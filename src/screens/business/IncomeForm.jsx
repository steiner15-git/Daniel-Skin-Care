import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc, useAuditLog } from "../../data";
import { formatILS } from "../../utils/money";
import ReceiptField from "../../components/ReceiptField";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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

  const editing = isEdit ? items.find((r) => r.id === id) : null;

  const [form, setForm] = useState({
    amount: "",
    date: todayInput(),
    invoiceNumber: "",
    paymentMethod: "",
    paid: false,
    note: "",
    clientName: "",
    receiptData: null,
    receiptFileId: null,
    receiptMime: null,
  });

  useEffect(() => {
    if (editing) setForm({ ...form, ...editing, amount: editing.amount ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function save() {
    const payload = {
      amount: Number(form.amount) || 0,
      date: form.date,
      invoiceNumber: form.invoiceNumber.trim(),
      paymentMethod: form.paymentMethod,
      paid: form.paid,
      note: form.note.trim(),
      clientName: form.clientName.trim(),
      treatmentName: editing?.treatmentName || form.note.trim(),
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

        <div className="row-2">
          <div className="field">
            <label>פירוט / טיפול</label>
            <input value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
          <div className="field">
            <label>לקוחה (אופציונלי)</label>
            <input value={form.clientName} onChange={(e) => set({ clientName: e.target.value })} />
          </div>
        </div>

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
