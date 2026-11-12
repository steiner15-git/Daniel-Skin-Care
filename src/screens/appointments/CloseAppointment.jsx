import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import CreditOffsetField from "../../components/CreditOffsetField";
import { useCollectionData, useRepo, useBatchRepo, useSettingDoc, useAuditLog } from "../../data";
import { usePaymentMethods } from "../../data/useListSettings";
import { formatDateTime, dateInputValue } from "../../utils/datetime";
import { formatILS } from "../../utils/money";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
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
  // לאן חוזרים אחרי אישור/ביטול/חזרה: מסך הבית (from "dashboard"), תצוגת
  // "ממתינים" ביומן (from "pending" — כדי לסגור כמה תורים ברצף), או לוח השנה.
  const from = location.state?.from;
  // returnTo (מהיומן או מכרטיסיית לקוחה) גובר: חוזרים בדיוק למסך ולמצב שממנו הגענו.
  const backTo =
    location.state?.returnTo ||
    (from === "dashboard" ? "/" : from === "pending" ? "/calendar?view=pending" : "/calendar");
  const { items: appts, loading } = useCollectionData("appointments");
  const { items: packages } = useCollectionData("clientPackages");
  // יתרות זיכוי (שוברי מתנה + זיכוי לקוחה) — לקיזוז במסלול ההכנסה הרגיל בלבד.
  const { items: credits } = useCollectionData("credits");
  const apptRepo = useRepo("appointments");
  const batchRepo = useBatchRepo();
  // רשימת אמצעי התשלום כוללת את ברירות המחדל גם אם לא נשמרה מעולם בהגדרות.
  const { items: methods } = usePaymentMethods();
  // מחירי הטיפולים — fallback למחיר כשהתור נשמר עם מחיר 0 (חיוב מחבילה שפקעה).
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const treatments = treatmentsDoc?.items ?? [];
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const appt = appts.find((a) => a.id === id);
  const [amount, setAmount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [date, setDate] = useState(dateInputValue(new Date()));
  const [paid, setPaid] = useState(false);
  // saving נשאר true אחרי הצלחה (עד הניווט) — כך שהמסך לא מבהב "התור כבר נסגר"
  // ברגע שהנתונים מתעדכנים לפני שהניווט מסתיים.
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

  // מגן: תור שכבר נסגר/בוטל (כניסה חוזרת, קישור ישן, או סגירה בטאב אחר) לא
  // יכול להיסגר שוב — אחרת נוצרת הכנסה כפולה.
  if ((appt.status === "done" || appt.status === "cancelled") && !saving) {
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
        <div className="notice" style={{ marginTop: 0 }}>
          {appt.status === "done"
            ? "התור כבר נסגר (אושר ביצוע). שינויים בתשלום נעשים דרך עריכת ההכנסה."
            : "התור בוטל."}
        </div>
      </>
    );
  }

  // תור שנשמר עם מחיר 0 בגלל כוונת חיוב מחבילה (וכעת החבילה לא כשירה) —
  // ברירת המחדל לסכום היא מחיר הטיפול מההגדרות.
  const fallbackPrice =
    appt.clientPackageId && !(Number(appt.price) > 0)
      ? treatments.find((t) => t.id === appt.treatmentId)?.price
      : undefined;
  const amountVal = amount == null ? fallbackPrice ?? appt.price ?? 0 : amount;
  const amountNum = Math.max(0, Number(amountVal) || 0);

  // קיזוז מיתרת זיכוי (O-1..O-6): רק ללקוחה עם clientId (מזדמנת — אין קיזוז).
  // ההכנסה נרשמת רק על החלק ששולם בפועל; כיסוי מלא = הכנסה בסכום 0 וללא חובת
  // אמצעי תשלום.
  const balance = appt.clientId ? creditBalance(credits, appt.clientId) : 0;
  const offsetVal = resolveOffset(offset, balance, amountNum);
  const cashAmount = round2(amountNum - offsetVal);
  const fullyCovered = offsetVal > 0 && cashAmount <= 0;

  const pkg = appt.clientPackageId ? packages.find((p) => p.id === appt.clientPackageId) : null;
  // הבחנה בין "החבילה נמחקה" לבין "נמצאה אך לא כשירה" (פקעה/נוצלה).
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const pkgChargeable =
    pkg &&
    pkg.status === "active" &&
    (pkg.remainingSessions ?? 0) > 0 &&
    (!pkg.expiryDate || new Date(pkg.expiryDate) >= t0);
  const pkgWasDeleted = !!appt.clientPackageId && !pkg;

  // Phase 4 §2 — אטומיות: ניכוי המפגש מהחבילה וסימון התור כ-"done" ב-batch אחד.
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
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "אישור הביצוע נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    // כשל בלוג אחרי שהפעולה הצליחה לא אמור להציג "האישור נכשל".
    try {
      await log({
        action: "package_charge",
        entity: { type: "clientPackage", id: pkg.id, desc: `${appt.clientName} — ${pkg.seriesName}` },
        before: { remainingSessions: pkg.remainingSessions },
        after: { remainingSessions: remaining },
      });
    } catch (e) {
      console.error("[audit] package_charge failed", e);
    }
    toast.showMessage("התור נסגר ✓ מפגש אחד נוכה מהחבילה");
    navigate(backTo);
  }

  // Phase 4 §2 — אטומיות: יצירת ההכנסה, ירידת היתרות וסימון התור כ-"done"
  // ב-commit אחד (O-7). כשל: הודעת שגיאה ו-saving משתחרר, והיתרה לא ירדה.
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
          // clientId נשמר בנוסף ל-clientName; לקוחה מזדמנת — clientId ריק.
          clientId: appt.clientId || null,
          clientName: appt.clientName || "",
          treatmentName: appt.treatmentName || "",
          // סכום ששולם בפועל (אחרי קיזוז מיתרה), נעצר ב-0.
          amount: cashAmount,
          date,
          invoiceNumber: "",
          paymentMethod: fullyCovered ? "" : paymentMethod,
          // בכיסוי מלא ההכנסה בסכום 0 מסומנת "שולם"; אחרת האישור ידני.
          paid: fullyCovered ? true : paid,
          // creditApplications: נדרש להחזרת היתרה במחיקת ההכנסה (Business.jsx).
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
          // true רק כשהקיזוז כיסה את כל הסכום — רשת ביטחון ל-D-1/D-2
          chargedFromCredit: fullyCovered,
          ...(offsetVal > 0 ? { creditApplied: offsetVal } : {}),
        },
      });
      await batchRepo.commit(ops);
      toast.showMessage("התור נסגר ✓ ההכנסה נרשמה");
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "אישור הביצוע נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }

    // לוג קיזוז (O-10) — אחרי שה-commit הצליח; כשל בלוג נבלע.
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

  // Phase 4 §5 — מעקב ביטולים: הדיאלוג דורש בחירת סיבה, נשמר cancelReason,
  // והתווית הקריאה נכללת ב-entity.desc של הלוג.
  async function cancelAppt() {
    const reason = await confirmDialog({
      title: "ביטול תור",
      message: "לבטל את התור? לא תיווצר הכנסה (למשל: הלקוחה לא הגיעה).",
      confirmLabel: "ביטול תור",
      danger: true,
      reasonOptions: CANCEL_REASONS,
    });
    if (!reason) return;
    setSaving(true);
    try {
      await apptRepo.update(appt.id, { status: "cancelled", cancelReason: reason });
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "ביטול התור נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    try {
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
      console.error("[audit] appointment_cancel failed", e);
    }
    toast.showMessage("התור בוטל");
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
            <button className="btn btn--danger" disabled={saving} onClick={cancelAppt}>
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
            <button className="btn btn--danger" disabled={saving} onClick={cancelAppt}>
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
