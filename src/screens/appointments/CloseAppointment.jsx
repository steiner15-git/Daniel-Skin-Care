import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import CreditOffsetField from "../../components/CreditOffsetField";
import { useCollectionData, useRepo, useBatchRepo, useSettingDoc, useAuditLog } from "../../data";
import { formatDateTime, dateInputValue } from "../../utils/datetime";
import { formatILS } from "../../utils/money";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { CANCEL_REASONS, CANCEL_REASON_LABELS } from "../../utils/cancellations";
import {
  creditBalance,
  allocateCredit,
  resolveOffset,
  round2,
  creditLabel,
} from "../../utils/credits";

export default function CloseAppointment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from === "dashboard" ? "/" : "/calendar";
  const { items: appts, loading } = useCollectionData("appointments");
  const { items: packages } = useCollectionData("clientPackages");
  // יתרות זיכוי (שוברי מתנה + זיכוי לקוחה) — לקיזוז במסלול ההכנסה הרגיל בלבד.
  const { items: credits } = useCollectionData("credits");
  // apptRepo נשאר בשימוש רק לביטול תור (כתיבה בודדת, לא זקוקה ל-batch).
  // שני מסלולי הסגירה עצמם (חיוב מחבילה / הכנסה רגילה) עברו ל-useBatchRepo
  // (Phase 4 §2) — ראו הערה מפורטת ליד confirmFromPackage/confirmDone למטה.
  const apptRepo = useRepo("appointments");
  const batchRepo = useBatchRepo();
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [{ id: "cash", name: "מזומן" }];
  const log = useAuditLog();
  const confirmDialog = useConfirm();

  const appt = appts.find((a) => a.id === id);
  const [amount, setAmount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [date, setDate] = useState(dateInputValue(new Date()));
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  // קיזוז מיתרה: null = ברירת מחדל (הנמוך מבין היתרה לסכום); מחרוזת = הוקלד.
  const [offset, setOffset] = useState(null);

  if (loading) return <p className="muted">טוען…</p>;
  if (!appt)
    return (
      <>
        <ScreenHeader title="אישור ביצוע" />
        <div className="empty-state">התור לא נמצא.</div>
      </>
    );

  const amountVal = amount == null ? appt.price ?? 0 : amount;
  const amountNum = Math.max(0, Number(amountVal) || 0);

  // קיזוז מיתרת זיכוי (O-1..O-6): רק ללקוחה עם clientId (מזדמנת — אין קיזוז).
  // ההכנסה נרשמת רק על החלק ששולם בפועל; כיסוי מלא = ללא הכנסה וללא חובת
  // אמצעי תשלום.
  const balance = appt.clientId ? creditBalance(credits, appt.clientId) : 0;
  const offsetVal = resolveOffset(offset, balance, amountNum);
  const cashAmount = round2(amountNum - offsetVal);
  const fullyCovered = offsetVal > 0 && cashAmount <= 0;

  const pkg = appt.clientPackageId ? packages.find((p) => p.id === appt.clientPackageId) : null;
  // תוקן QA (2026-09): הבחנה בין "החבילה נמחקה" (pkg === undefined, למרות
  // ש-clientPackageId עדיין מוגדר על התור) לבין "נמצאה אך לא כשירה" (פקעה/
  // נוצלה). לפני התיקון שתי האפשרויות הוצגו תחת אותה הודעה ("פקעה או שנגמרו
  // בה המפגשים") — מטעה כאשר החבילה בפועל נמחקה (למשל דרך "מחיקת חבילה" ב-
  // כרטיסיית הלקוחה) ולא פקעה כלל.
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const pkgChargeable =
    pkg &&
    pkg.status === "active" &&
    (pkg.remainingSessions ?? 0) > 0 &&
    (!pkg.expiryDate || new Date(pkg.expiryDate) >= t0);
  const pkgWasDeleted = !!appt.clientPackageId && !pkg;

  // Phase 4 §2 — אטומיות: לפני התיקון, ניכוי המפגש מהחבילה (clientPackages)
  // וסימון התור כ-"done" היו שתי כתיבות repo נפרדות. כשל רשת בין השתיים
  // היה יכול להשאיר חבילה עם מפגש מנוכה אך תור שלא סומן כסגור (או להפך),
  // ללא דרך לזהות/לתקן זאת אוטומטית. writeBatch מבטיח ששתי הכתיבות
  // מצליחות יחד או נכשלות יחד — אותו דפוס בדיוק כמו ב-SeriesPurchase.jsx
  // ו-ProductSell.jsx (ראו הערת התיעוד ב-data/firestore.js).
  // מסלול החיבור מחבילה אינו משתנה בתוספת הקיזוז (O-11).
  async function confirmFromPackage() {
    setSaving(true);
    const remaining = (pkg.remainingSessions ?? 0) - 1;
    try {
      await batchRepo.commit([
        {
          name: "clientPackages",
          id: pkg.id,
          type: "update",
          data: {
            remainingSessions: remaining,
            status: remaining <= 0 ? "used" : "active",
          },
        },
        {
          name: "appointments",
          id: appt.id,
          type: "update",
          data: {
            status: "done",
            chargedFromPackage: true,
            clientPackageId: pkg.id,
          },
        },
      ]);
      await log({
        action: "package_charge",
        entity: { type: "clientPackage", id: pkg.id, desc: `${appt.clientName} — ${pkg.seriesName}` },
        before: { remainingSessions: pkg.remainingSessions },
        after: { remainingSessions: remaining },
      });
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "אישור הביצוע נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    navigate(backTo);
  }

  // Phase 4 §2 — אטומיות: לפני התיקון, יצירת רשומת ה-income וסימון התור
  // כ-"done" היו שתי כתיבות repo נפרדות (incomeRepo.add ואז apptRepo.update).
  // כשל רשת בין השתיים היה יכול ליצור הכנסה "יתומה" בלי תור מעודכן, או
  // תור שנשאר "ממתין לסגירה" בעוד שהכנסה כבר נוצרה. עברו יחד ל-writeBatch
  // דרך useBatchRepo — מזהה ההכנסה נוצר מראש עם batchRepo.newId() כדי
  // שאפשר יהיה לכתוב אותו כ-incomeId על רשומת התור באותו batch.
  //
  // קיזוז מיתרה (O-7): ירידת remaining ביתרות שנוצלו, יצירת ההכנסה (על החלק
  // ששולם בפועל; בכיסוי מלא — הכנסה בסכום 0) ועדכון התור — הכול ב-commit אחד. כשל: הודעת שגיאה ו-saving משתחרר, והיתרה לא ירדה.
  async function confirmDone() {
    setSaving(true);
    const allocations = offsetVal > 0 ? allocateCredit(credits, appt.clientId, offsetVal) : [];
    try {
      const incomeId = batchRepo.newId("income");
      const ops = allocations.map(({ credit, remainingAfter }) => ({
        name: "credits",
        id: credit.id,
        type: "update",
        data: {
          remaining: remainingAfter,
          status: remainingAfter <= 0 ? "used" : "active",
        },
      }));
      ops.push({
        name: "income",
        id: incomeId,
        type: "add",
        data: {
          source: "appointment",
          appointmentId: appt.id,
          // clientId נשמר כאן (בנוסף ל-clientName) — אותו דפוס כמו בהכנסות
          // ממכירת מוצר/רכישת סדרה. בלעדיו אותה לקוחה מופיעה ב"סיכום לפי
          // לקוחה" בשתי שורות (מפתח clientId מול מפתח name:...). לקוחה
          // שהוזנה ידנית בתיאום תור (ללא כרטיסייה) — clientId ריק.
          // הכנסות שנוצרו *לפני* תיקון זה ימשיכו לא לכלול clientId.
          clientId: appt.clientId || null,
          clientName: appt.clientName || "",
          treatmentName: appt.treatmentName || "",
          // סכום ששולם בפועל (אחרי קיזוז מיתרה). תוקן QA (2026-09): סכום
          // שלילי (הקלדה בטעות) נעצר ב-0 (resolveOffset/amountNum).
          amount: cashAmount,
          date,
          invoiceNumber: "",
          paymentMethod: fullyCovered ? "" : paymentMethod,
          // בכיסוי מלא ההכנסה בסכום 0 מסומנת "שולם" (לא נספרת כתשלום שטרם אומת).
          // אחרת — אישור התשלום נעשה ידנית ע"י המפעילה, לא אוטומטית.
          paid: fullyCovered ? true : paid,
          // creditApplications: פירוט לאילו יתרות נוצל הקיזוז — נדרש להחזרת
          // היתרה במחיקת ההכנסה (Business.jsx).
          ...(offsetVal > 0
            ? {
                creditApplied: offsetVal,
                creditApplications: allocations.map(({ credit, take }) => ({
                  creditId: credit.id,
                  amount: take,
                })),
              }
            : {}),
        },
      });
      ops.push({
        name: "appointments",
        id: appt.id,
        type: "update",
        data: {
          status: "done",
          incomeId,
          paymentMethod: fullyCovered ? "" : paymentMethod,
          // החבילה פקעה/נגמרה/נמחקה — התור חויב רגיל, מנתקים את הקישור לחבילה
          clientPackageId: null,
          chargedFromPackage: false,
          // true רק כשהקיזוז כיסה את כל הסכום (ההכנסה בסכום 0) — רשת ביטחון ל-D-1/D-2
          chargedFromCredit: fullyCovered,
          ...(offsetVal > 0 ? { creditApplied: offsetVal } : {}),
        },
      });
      await batchRepo.commit(ops);
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "אישור הביצוע נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }

    // לוג קיזוז (O-10) — אחרי שה-commit הצליח. כשל בלוג לא אמור להציג
    // "הביצוע נכשל" כשהתור כבר נסגר בפועל, ולכן נבלע (נרשם ל-console).
    for (const { credit, remainingAfter } of allocations) {
      try {
        await log({
          action: "credit_apply",
          entity: {
            type: "credit",
            id: credit.id,
            desc: `${appt.clientName} — ${creditLabel(credit)} · ${appt.treatmentName || "תור"}`,
          },
          before: { remaining: credit.remaining },
          after: { remaining: remainingAfter },
        });
      } catch (e) {
        console.error("[audit] credit_apply failed", e);
      }
    }
    navigate(backTo);
  }

  // Phase 4 §5 — מעקב ביטולים: הדיאלוג דורש בחירת סיבה (reasonOptions),
  // הערך שנבחר נשמר על התור כ-cancelReason, ונרשם בלוג השינויים — כולל
  // התווית הקריאה של הסיבה (לא רק הערך הגולמי) בתוך entity.desc עצמו, כדי
  // שהיא תופיע ישירות בשורת הלוג ולא רק בתוך "אחרי: {...}".
  async function cancelAppt() {
    const reason = await confirmDialog({
      title: "ביטול תור",
      message: "לבטל את התור? לא תיווצר הכנסה (למשל: הלקוחה לא הגיעה).",
      confirmLabel: "ביטול תור",
      danger: true,
      reasonOptions: CANCEL_REASONS,
    });
    if (!reason) return;
    try {
      await apptRepo.update(appt.id, { status: "cancelled", cancelReason: reason });
      await log({
        action: "appointment_cancel",
        entity: {
          type: "appointment",
          id: appt.id,
          desc: `${appt.treatmentName || "תור"}${appt.clientName ? ` · ${appt.clientName}` : ""} · ${
            CANCEL_REASON_LABELS[reason] || reason
          }`,
        },
        after: { cancelReason: reason },
      });
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "ביטול התור נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    navigate(backTo);
  }

  return (
    <>
      <ScreenHeader
        title="אישור ביצוע"
        action={
          <button className="btn btn--ghost" onClick={() => navigate(backTo)}>
            חזרה
          </button>
        }
      />

      <div className="card">
        <div className="read-row">
          <span className="muted">לקוחה</span>
          <span>{appt.clientName}</span>
        </div>
        <div className="read-row">
          <span className="muted">טיפול</span>
          <span>{appt.treatmentName}</span>
        </div>
        <div className="read-row">
          <span className="muted">מועד</span>
          <span>{formatDateTime(appt.start)}</span>
        </div>
      </div>

      {pkgChargeable ? (
        <>
          <div className="notice" style={{ marginTop: 0 }}>
            תור זה מחויב מחבילה: <strong>{pkg.seriesName}</strong> — נותרו{" "}
            {pkg.remainingSessions}/{pkg.totalSessions} מפגשים. אישור הביצוע ינכה מפגש אחד
            ולא ייצור הכנסה חדשה.
          </div>
          <div className="save-row" style={{ justifyContent: "space-between" }}>
            <button className="btn btn--danger" onClick={cancelAppt}>
              ביטול תור (לא בוצע)
            </button>
            <button className="btn" disabled={saving} onClick={confirmFromPackage}>
              {saving ? "שומרת…" : "אישור וניכוי מהחבילה"}
            </button>
          </div>
        </>
      ) : (
        <>
          {appt.clientPackageId && (
            <div className="notice" style={{ marginTop: 0 }}>
              {pkgWasDeleted
                ? "⚠ החבילה שהתור היה משויך אליה נמחקה מכרטיסיית הלקוחה — התור יחויב כתשלום רגיל."
                : "⚠ החבילה שסומנה לתור פקעה או שנגמרו בה המפגשים — התור יחויב כתשלום רגיל."}
            </div>
          )}

          <div className="card">
            <div className="row-2">
              <div className="field">
                <label>סכום שהתקבל (₪)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={amountVal}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label>תאריך תשלום</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>אמצעי תשלום{fullyCovered ? " (לא נדרש — הסכום מכוסה מהיתרה)" : ""}</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">— בחרי —</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>

            <CreditOffsetField
              balance={balance}
              amount={amountNum}
              offset={offset}
              setOffset={setOffset}
            />

            {!fullyCovered && (
              <label className="inline-check" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
                <span>סומן כשולם (אפשר לאשר גם מאוחר יותר במסך ההכנסות)</span>
              </label>
            )}
          </div>

          <div className="notice">
            {fullyCovered
              ? `הסכום מכוסה במלואו מיתרת הזיכוי — תיווצר רשומת הכנסה בסכום ₪0 (לתיעוד בלבד; השובר/הזיכוי כבר נרשמו קודם). אישור הביצוע ינכה ${formatILS(offsetVal)} מהיתרה, ועריכת התור תינעל.`
              : `אישור ביצוע ייצור רשומת הכנסה של ${formatILS(cashAmount)} המשויכת לתור${
                  offsetVal > 0 ? ` (בנוסף לקיזוז של ${formatILS(offsetVal)} מהיתרה)` : ""
                }. אישור התשלום ("שולם") נעשה על ידך — כאן או מאוחר יותר. לאחר האישור עריכת התור תינעל.`}
          </div>

          <div className="save-row" style={{ justifyContent: "space-between" }}>
            <button className="btn btn--danger" onClick={cancelAppt}>
              ביטול תור (לא בוצע)
            </button>
            <button
              className="btn"
              disabled={saving || (!paymentMethod && !fullyCovered)}
              onClick={confirmDone}
            >
              {saving ? "שומרת…" : fullyCovered ? "אישור וקיזוז מהיתרה" : "אישור ויצירת הכנסה"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
