import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import ClientPicker from "../../components/ClientPicker";
import { useCollectionData, useRepo, useSettingDoc, useAuditLog } from "../../data";
import { formatILS } from "../../utils/money";
import { dateInputValue } from "../../utils/datetime";
import ReceiptField from "../../components/ReceiptField";

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

export default function IncomeForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { items } = useCollectionData("income");
  const repo = useRepo("income");
  const log = useAuditLog();
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [{ id: "cash", name: "מזומן" }];
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const treatments = treatmentsDoc?.items ?? [];

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

  useEffect(() => {
    if (editing)
      setForm({
        ...form,
        ...editing,
        amount: editing.amount ?? "",
        // "פירוט / טיפול" הוא כעת שדה העריכה היחיד לשם המוצג (treatmentName).
        // הכנסות שנוצרו אוטומטית (מתור/מכירה) נשמרות עם treatmentName אך בלי
        // note — לכן טוענים מ-note אם קיים, ואם לא, מ-treatmentName הקיים,
        // כדי שהשדה בפועל יציג את הערך הנוכחי ולא יופיע ריק.
        note: editing.note || editing.treatmentName || "",
        clientId: editing.clientId || "",
        clientName: editing.clientName || "",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function save() {
    const linkedTreatment = isManual
      ? treatments.find((t) => t.name === form.note.trim()) || null
      : null;
    const payload = {
      amount: Number(form.amount) || 0,
      date: form.date,
      invoiceNumber: form.invoiceNumber.trim(),
      paymentMethod: form.paymentMethod,
      paid: form.paid,
      note: form.note.trim(),
      // clientId מקשר את ההכנסה לכרטיסיית הלקוחה (ולסיכום לפי לקוחה); ריק
      // בלקוחה מזדמנת (שם בלבד, בלי כרטיסייה).
      clientId: form.clientId || null,
      clientName: form.clientName.trim(),
      // תוקן: לפני כן, כאשר עורכים הכנסה שכבר יש לה treatmentName (כל הכנסה
      // אוטומטית), הביטוי היה editing?.treatmentName || form.note.trim() —
      // שמתעלם תמיד מהעריכה בפועל (כי editing.treatmentName תמיד "אמיתי").
      // כעת שדה "פירוט / טיפול" הוא מקור האמת היחיד, תמיד ניתן לעריכה.
      treatmentName: form.note.trim(),
      // treatmentId נשמר רק להכנסה ידנית, וכשהשם תואם טיפול מהרשימה.
      ...(isManual ? { treatmentId: linkedTreatment?.id || null } : {}),
      source: editing?.source || "manual",
      receiptData: form.receiptData || null,
      receiptFileId: form.receiptFileId || null,
      receiptMime: form.receiptMime || null,
    };
    if (isEdit) {
      await repo.update(id, payload);
      await log({
        action: "income_edit",
        entity: { type: "income", id, desc: `${payload.treatmentName || "הכנסה"} · ${formatILS(payload.amount)}` },
        before: { amount: editing.amount, paid: editing.paid, invoiceNumber: editing.invoiceNumber },
        after: { amount: payload.amount, paid: payload.paid, invoiceNumber: payload.invoiceNumber },
      });
    } else {
      await repo.add(payload);
    }
    navigate("/business");
  }

  return (
    <>
      <ScreenHeader
        title={isEdit ? "עריכת הכנסה" : "הכנסה ידנית"}
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/business")}>
            חזרה
          </button>
        }
      />

      <div className="card">
        <div className="row-2">
          <div className="field">
            <label>סכום (₪)</label>
            <input
              type="number"
              inputMode="numeric"
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
        </div>

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
        <button className="btn" disabled={!form.amount} onClick={save}>
          {isEdit ? "אישור שמירה" : "הוספת הכנסה"}
        </button>
      </div>
    </>
  );
}
