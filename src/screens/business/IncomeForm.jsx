import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import ClientPicker from "../../components/ClientPicker";
import VatFields from "../../components/VatFields";
import { useCollectionData, useRepo, useSettingDoc, useAuditLog } from "../../data";
import { usePaymentMethods } from "../../data/useListSettings";
import { useVatSettings } from "../../data/useVatSettings";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
import { formatILS } from "../../utils/money";
import { dateInputValue } from "../../utils/datetime";
import { taxYearFor, effectiveRate, clampRate } from "../../utils/vat";
import { goBackOr } from "../../utils/nav";
import ReceiptField from "../../components/ReceiptField";

// מסך ברירת מחדל כשאין מסך קודם באפליקציה (כניסה ישירה): לשונית ההכנסות.
const FALLBACK = "/business?tab=income";

// שדה "פירוט / טיפול" להכנסה ידנית: טקסט חופשי עם הצעות מרשימת הטיפולים
// (settings/treatments). בחירה מההצעות — או הקלדת שם זהה בדיוק לטיפול —
// נחשבת "מהרשימה" (נשמר treatmentId); כל טקסט אחר נשמר כטקסט חופשי בלבד.
// הרשימה מבטיחה שם עקבי, כך שהסיכום לפי טיפול לא מתפצל בגלל שגיאות כתיב.
function TreatmentField({ value, onChange, treatments }) {
  const [open, setOpen] = useState(false);
  const term = value.trim();
  const linked = treatments.find((t) => t.name === term) || null;
  const options = treatments.filter((t) => !term || t.name.includes(term));
  // כשהשם זהה בדיוק לטיפול — אין טעם להמשיך להציג את הרשימה.
  const showList = open && options.length > 0 && !linked;

  return (
    <div className="field">
      <label>פירוט / טיפול</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        // השהיה קצרה, כדי שלחיצה על הצעה תספיק להירשם לפני סגירת הרשימה.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {showList && (
        <div className="suggest">
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              className="suggest__item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(t.name);
                setOpen(false);
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {term && (
        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
          {linked ? "✓ טיפול מהרשימה" : "לא מהרשימה — יירשם כטקסט חופשי"}
        </p>
      )}
    </div>
  );
}

// תווית מקור להכנסה שנוצרה אוטומטית — להסבר באזהרת העריכה.
const AUTO_SOURCE_LABEL = {
  appointment: "סגירת תור",
  series: "רכישת סדרה",
  product: "מכירת מוצר",
  voucher: "רכישת שובר מתנה",
};

export default function IncomeForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("income");
  const repo = useRepo("income");
  const log = useAuditLog();
  const { items: methods } = usePaymentMethods();
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const treatments = treatmentsDoc?.items ?? [];
  const { years } = useVatSettings();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const editing = isEdit ? items.find((r) => r.id === id) : null;
  // הכנסה שנוצרה אוטומטית (מתור / רכישת סדרה / מכירת מוצר) — הלקוחה והשיוך
  // שלה נקבעים במקור (התור/החבילה), ולכן הלקוחה מוצגת כאן לקריאה בלבד.
  const isManual = !editing || !editing.source || editing.source === "manual";

  const [form, setForm] = useState({
    amount: "",
    date: dateInputValue(new Date()),
    invoiceNumber: "",
    paymentMethod: "",
    paid: false,
    note: "",
    clientId: "",
    clientName: "",
    receiptData: null,
    receiptFileId: null,
    receiptMime: null,
  });
  // שיעור מע"מ ידני (מחרוזת). null = ברירת המחדל לפי שנת המס של התאריך —
  // נגזר בזמן רינדור, כך שמשתנה עם התאריך ועם טעינת ההגדרות.
  const [rateInput, setRateInput] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        ...form,
        ...editing,
        amount: editing.amount ?? "",
        // "פירוט / טיפול" הוא שדה העריכה היחיד לשם המוצג (treatmentName).
        // הכנסות אוטומטיות נשמרות עם treatmentName אך בלי note — לכן טוענים
        // מ-note אם קיים, ואם לא, מ-treatmentName.
        note: editing.note || editing.treatmentName || "",
        clientId: editing.clientId || "",
        clientName: editing.clientName || "",
      });
      setRateInput(editing.vatRate != null ? String(editing.vatRate) : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  // מצבי טעינה / לא נמצא (בעריכה) — כמו ב-AppointmentForm. חייבים לבוא אחרי
  // כל ה-hooks.
  if (isEdit && loading) return <p className="muted">טוען…</p>;
  if (isEdit && !editing)
    return (
      <>
        <ScreenHeader
          title="עריכת הכנסה"
          action={
            <button className="btn btn--ghost" onClick={() => goBackOr(navigate, FALLBACK)}>
              חזרה
            </button>
          }
        />
        <div className="empty-state">ההכנסה לא נמצאה.</div>
      </>
    );

  const defaultRate = effectiveRate(taxYearFor(form.date, years));
  const manualRate = rateInput != null;
  const shownRate = manualRate ? rateInput : String(defaultRate);

  // אזהרה (לא חוסמת): מספר חשבונית זהה כבר קיים בהכנסה אחרת.
  const invTrim = form.invoiceNumber.trim();
  const duplicateInvoice =
    !!invTrim &&
    items.some((r) => r.id !== id && String(r.invoiceNumber || "").trim() === invTrim);

  // סכום ריק חוסם שמירה; סכום 0 מותר (למשל הכנסת ₪0 שנוצרה מקיזוז יתרה).
  const amountEmpty = form.amount === "" || form.amount == null;

  async function save() {
    if (saving) return;
    // הכנסה שנוצרה אוטומטית: שינוי סכום לא מעדכן את התור/החבילה/המלאי/היתרה
    // שמאחוריה — מבקשים אישור מפורש לפני שמירה.
    if (isEdit && editing && !isManual && Number(form.amount) !== Number(editing.amount)) {
      const ok = await confirmDialog({
        title: "שינוי סכום בהכנסה אוטומטית",
        message: `הכנסה זו נוצרה אוטומטית מ${
          AUTO_SOURCE_LABEL[editing.source] || "פעולה אחרת"
        }. שינוי הסכום כאן לא יעדכן את התור, החבילה, המלאי או היתרה המקושרים אליה. לשנות בכל זאת?`,
        confirmLabel: "שינוי בכל זאת",
        danger: true,
      });
      if (!ok) return;
    }
    const linkedTreatment = isManual
      ? treatments.find((t) => t.name === form.note.trim()) || null
      : null;
    const payload = {
      // סכום שלילי (הקלדה בטעות) נעצר ב-0.
      amount: Math.max(0, Number(form.amount) || 0),
      date: form.date,
      invoiceNumber: form.invoiceNumber.trim(),
      paymentMethod: form.paymentMethod,
      paid: form.paid,
      note: form.note.trim(),
      // clientId מקשר את ההכנסה לכרטיסיית הלקוחה (ולסיכום לפי לקוחה); ריק
      // בלקוחה מזדמנת (שם בלבד, בלי כרטיסייה).
      clientId: form.clientId || null,
      clientName: form.clientName.trim(),
      // שדה "פירוט / טיפול" הוא מקור האמת היחיד, תמיד ניתן לעריכה.
      treatmentName: form.note.trim(),
      // treatmentId נשמר רק להכנסה ידנית, וכשהשם תואם טיפול מהרשימה.
      ...(isManual ? { treatmentId: linkedTreatment?.id || null } : {}),
      source: editing?.source || "manual",
      // מע"מ: נשמר רק שיעור שנערך ידנית; אחרת null והשיעור נגזר משנת המס.
      vatRate: manualRate ? clampRate(rateInput) : null,
      receiptData: form.receiptData || null,
      receiptFileId: form.receiptFileId || null,
      receiptMime: form.receiptMime || null,
    };

    setSaving(true);
    try {
      if (isEdit) await repo.update(id, payload);
      else await repo.add(payload);
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת ההכנסה נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }

    // כשל בלוג אחרי פעולה שהצליחה לא אמור להציג "השמירה נכשלה".
    if (isEdit) {
      try {
        await log({
          action: "income_edit",
          entity: {
            type: "income",
            id,
            desc: `${payload.treatmentName || "הכנסה"} · ${formatILS(payload.amount)}`,
          },
          before: {
            amount: editing.amount,
            paid: editing.paid,
            invoiceNumber: editing.invoiceNumber,
            vatRate: editing.vatRate ?? null,
          },
          after: {
            amount: payload.amount,
            paid: payload.paid,
            invoiceNumber: payload.invoiceNumber,
            vatRate: payload.vatRate,
          },
        });
      } catch (e) {
        console.error("[audit] income_edit failed", e);
      }
    }
    toast.showMessage(isEdit ? "ההכנסה עודכנה ✓" : "ההכנסה נוספה ✓");
    // חזרה למסך שממנו הגענו (כרטיסיית לקוחה, חיפוש, רשימת הכנסות, דשבורד...).
    goBackOr(navigate, FALLBACK);
  }

  return (
    <>
      <ScreenHeader
        title={isEdit ? "עריכת הכנסה" : "הכנסה ידנית"}
        action={
          <button className="btn btn--ghost" onClick={() => goBackOr(navigate, FALLBACK)}>
            חזרה
          </button>
        }
      />

      {editing && !isManual && (
        <div className="notice" style={{ marginTop: 0 }}>
          הכנסה זו נוצרה אוטומטית מ{AUTO_SOURCE_LABEL[editing.source] || "פעולה אחרת"}. שינוי
          הסכום כאן לא יעדכן את הרשומה המקורית.
        </div>
      )}

      <div className="card">
        <div className="row-2">
          <div className="field">
            <label>סכום כולל מע"מ (₪)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </div>
          <div className="field">
            <label>תאריך</label>
            <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
        </div>

        {/* מספר חשבונית — בין שורת הסכום/תאריך לאמצעי התשלום (דרישת PRD) */}
        <div className="field">
          <label>מספר חשבונית</label>
          <input
            dir="ltr"
            value={form.invoiceNumber}
            onChange={(e) => set({ invoiceNumber: e.target.value })}
          />
          {duplicateInvoice && (
            <p className="warn-text">⚠ קיימת הכנסה אחרת עם אותו מספר חשבונית (ניתן להמשיך).</p>
          )}
        </div>

        {/* מע"מ: עורכים סכום כולל (למעלה) או שיעור; נטו ומע"מ מחושבים */}
        <VatFields
          gross={Number(form.amount) || 0}
          rate={shownRate}
          manual={manualRate}
          defaultRate={defaultRate}
          onRateChange={setRateInput}
          onReset={() => setRateInput(null)}
        />

        <div className="field">
          <label>אמצעי תשלום</label>
          <select value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
            <option value="">— בחרי —</option>
            {methods.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* לקוחה: הכנסה ידנית — בורר (לקוחה מהרשימה / מזדמנת); הכנסה אוטומטית
            — קריאה בלבד, כי מקור האמת שלה הוא התור/החבילה. */}
        {isManual ? (
          <ClientPicker
            clientId={form.clientId}
            clientName={form.clientName}
            onChange={({ clientId, clientName }) => set({ clientId, clientName })}
          />
        ) : (
          <div className="read-row" style={{ marginBottom: 14 }}>
            <span className="muted">לקוחה (נקבעת לפי התור/הרכישה המקורית)</span>
            <span>{form.clientName || "—"}</span>
          </div>
        )}

        {isManual ? (
          <TreatmentField
            value={form.note}
            onChange={(v) => set({ note: v })}
            treatments={treatments}
          />
        ) : (
          <div className="field">
            <label>פירוט / טיפול</label>
            <input value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
        )}

        <label className="inline-check">
          <input type="checkbox" checked={form.paid} onChange={(e) => set({ paid: e.target.checked })} />
          <span>סומן כשולם</span>
        </label>

        <div style={{ marginTop: 14 }}>
          <ReceiptField value={form} onChange={set} />
        </div>
      </div>

      <div className="save-row">
        <button className="btn" disabled={amountEmpty || saving} onClick={save}>
          {saving ? "שומרת…" : isEdit ? "אישור שמירה" : "הוספת הכנסה"}
        </button>
      </div>
    </>
  );
}
