import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc, useAuditLog } from "../../data";
import { formatILS } from "../../utils/money";
import { dateInputValue } from "../../utils/datetime";
import ReceiptField from "../../components/ReceiptField";

export default function ExpenseForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { items } = useCollectionData("expenses");
  const repo = useRepo("expenses");
  const log = useAuditLog();
  const { data: catDoc } = useSettingDoc("expenseCategories");
  const categories = catDoc?.items ?? [];

  const editing = isEdit ? items.find((r) => r.id === id) : null;

  const [form, setForm] = useState({
    date: dateInputValue(new Date()),
    description: "",
    businessName: "",
    invoiceNumber: "",
    amountBeforeVat: "",
    vat: "",
    total: "",
    category: "",
    recurring: "", // "" | "monthly" | "yearly"
    receiptData: null,
    receiptFileId: null,
    receiptMime: null,
  });
  const [autoTotal, setAutoTotal] = useState(true);

  useEffect(() => {
    if (editing) {
      setForm({ ...form, ...editing });
      setAutoTotal(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => {
      const next = { ...f, ...patch };
      if (autoTotal && (patch.amountBeforeVat != null || patch.vat != null)) {
        next.total = String((Number(next.amountBeforeVat) || 0) + (Number(next.vat) || 0));
      }
      return next;
    });
  }

  async function save() {
    const payload = {
      date: form.date,
      description: form.description.trim(),
      businessName: form.businessName.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      amountBeforeVat: Number(form.amountBeforeVat) || 0,
      vat: Number(form.vat) || 0,
      total: Number(form.total) || 0,
      category: form.category,
      recurring: form.recurring || null,
      receiptData: form.receiptData || null,
      receiptFileId: form.receiptFileId || null,
      receiptMime: form.receiptMime || null,
    };
    if (isEdit) {
      await repo.update(id, payload);
      await log({
        action: "expense_edit",
        entity: { type: "expense", id, desc: `${payload.description || "הוצאה"} · ${formatILS(payload.total)}` },
        before: { total: editing.total },
        after: { total: payload.total },
      });
    } else {
      await repo.add(payload);
    }
    navigate("/business");
  }

  return (
    <>
      <ScreenHeader
        title={isEdit ? "עריכת הוצאה" : "הוצאה חדשה"}
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/business")}>
            חזרה
          </button>
        }
      />

      <div className="card">
        {/* סדר שדות: תאריך, תיאור, שם עסק (דרישת PRD) */}
        <div className="field">
          <label>תאריך</label>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="field">
          <label>תיאור</label>
          <input value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="field">
          <label>שם העסק</label>
          <input value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} />
        </div>
        <div className="field">
          <label>מספר חשבונית</label>
          <input dir="ltr" value={form.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} />
        </div>

        <div className="row-2">
          <div className="field">
            <label>מחיר לפני מע"מ</label>
            <input
              type="number"
              inputMode="numeric"
              value={form.amountBeforeVat}
              onChange={(e) => set({ amountBeforeVat: e.target.value })}
            />
          </div>
          <div className="field">
            <label>מע"מ</label>
            <input
              type="number"
              inputMode="numeric"
              value={form.vat}
              onChange={(e) => set({ vat: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label>סה"כ כולל מע"מ</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.total}
            onChange={(e) => {
              setAutoTotal(false);
              set({ total: e.target.value });
            }}
          />
        </div>

        <div className="field">
          <label>קטגוריה</label>
          <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">— בחרי —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>הוצאה קבועה</label>
          <select value={form.recurring} onChange={(e) => set({ recurring: e.target.value })}>
            <option value="">לא קבועה</option>
            <option value="monthly">חודשית</option>
            <option value="yearly">שנתית</option>
          </select>
        </div>

        <ReceiptField value={form} onChange={set} />
      </div>

      <div className="save-row">
        <button className="btn" disabled={!form.total && !form.amountBeforeVat} onClick={save}>
          {isEdit ? "אישור שמירה" : "הוספת הוצאה"}
        </button>
      </div>
    </>
  );
}
