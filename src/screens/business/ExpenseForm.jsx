import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import VatFields from "../../components/VatFields";
import DateField from "../../components/DateField";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { useExpenseCategories } from "../../data/useListSettings";
import { useVatSettings } from "../../data/useVatSettings";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
import { formatILS } from "../../utils/money";
import { dateInputValue } from "../../utils/datetime";
import { taxYearFor, effectiveRate, clampRate, expenseVat } from "../../utils/vat";
import { endDateForCount } from "../../utils/recurring";
import { goBackOr } from "../../utils/nav";
import ReceiptField from "../../components/ReceiptField";

// מסך ברירת מחדל כשאין מסך קודם באפליקציה (כניסה ישירה): לשונית ההוצאות.
const FALLBACK = "/business?tab=expense";

export default function ExpenseForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("expenses");
  const repo = useRepo("expenses");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  // קטגוריות כולל ברירות מחדל גם אם הרשימה לא נשמרה מעולם בהגדרות.
  const { items: categories } = useExpenseCategories();
  const { years } = useVatSettings();

  const editing = isEdit ? items.find((r) => r.id === id) : null;

  const [form, setForm] = useState({
    date: dateInputValue(new Date()),
    description: "",
    businessName: "",
    invoiceNumber: "",
    total: "",
    category: "",
    recurring: "", // "" | "monthly" | "yearly"
    receiptData: null,
    receiptFileId: null,
    receiptMime: null,
  });
  // שיעור מע"מ ידני (מחרוזת). null = ברירת המחדל לפי שנת המס של התאריך.
  const [rateInput, setRateInput] = useState(null);
  // סיום הוצאה קבועה: none = ללא סיום, count = מספר חיובים כולל (כולל הראשון),
  // date = עד תאריך. נשמר על התבנית רק recurringEnd (תאריך החיוב האחרון).
  const [endMode, setEndMode] = useState("none");
  const [endCount, setEndCount] = useState("12");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({ ...form, ...editing, total: editing.total ?? "" });
      // הוצאה עם שיעור ידני, או הוצאה ישנה (amountBeforeVat+vat מחשבונית ספק):
      // נטענת כשיעור ידני.
      const p = expenseVat(editing, years);
      setRateInput(p.manual ? String(p.rate) : null);
      if (editing.recurringEnd) {
        setEndMode("date");
        setEndDate(editing.recurringEnd);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  // מצבי טעינה / לא נמצא (בעריכה) — חייבים לבוא אחרי כל ה-hooks.
  if (isEdit && loading) return <p className="muted">טוען…</p>;
  if (isEdit && !editing)
    return (
      <>
        <ScreenHeader
          title="עריכת הוצאה"
          action={
            <button className="btn btn--ghost" onClick={() => goBackOr(navigate, FALLBACK)}>
              חזרה
            </button>
          }
        />
        <div className="empty-state">ההוצאה לא נמצאה.</div>
      </>
    );

  const defaultRate = effectiveRate(taxYearFor(form.date, years));
  const manualRate = rateInput != null;
  const shownRate = manualRate ? rateInput : String(defaultRate);

  // אזהרה (לא חוסמת): אותו מספר חשבונית אצל אותו עסק כבר קיים בהוצאה אחרת.
  const norm = (s) => String(s || "").trim().toLowerCase();
  const duplicateInvoice =
    !!norm(form.invoiceNumber) &&
    items.some(
      (r) =>
        r.id !== id &&
        norm(r.invoiceNumber) === norm(form.invoiceNumber) &&
        norm(r.businessName) === norm(form.businessName)
    );

  const endInvalid =
    !!form.recurring &&
    ((endMode === "count" && !(Number(endCount) >= 1)) ||
      (endMode === "date" && (!endDate || endDate < form.date)));

  async function save() {
    if (saving) return;
    // תאריך החיוב האחרון של הוצאה קבועה (null = ללא סיום).
    const recurringEnd = !form.recurring
      ? null
      : endMode === "date"
      ? endDate || null
      : endMode === "count"
      ? endDateForCount(form.date, form.recurring, Number(endCount))
      : null;
    const payload = {
      date: form.date,
      description: form.description.trim(),
      businessName: form.businessName.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      // סכום שלילי (הקלדה בטעות) נעצר ב-0.
      total: Math.max(0, Number(form.total) || 0),
      // מע"מ: נשמר רק שיעור שנערך ידנית; אחרת null והשיעור נגזר משנת המס.
      // שדות amountBeforeVat/vat הישנים מנוקים.
      vatRate: manualRate ? clampRate(rateInput) : null,
      amountBeforeVat: null,
      vat: null,
      category: form.category,
      recurring: form.recurring || null,
      recurringEnd,
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
        message: "שמירת ההוצאה נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }

    // כשל בלוג אחרי פעולה שהצליחה לא אמור להציג "השמירה נכשלה".
    if (isEdit) {
      try {
        await log({
          action: "expense_edit",
          entity: {
            type: "expense",
            id,
            desc: `${payload.description || "הוצאה"} · ${formatILS(payload.total)}`,
          },
          before: { total: editing.total, vatRate: expenseVat(editing, years).rate },
          after: { total: payload.total, vatRate: payload.vatRate },
        });
      } catch (e) {
        console.error("[audit] expense_edit failed", e);
      }
    }
    toast.showMessage(isEdit ? "ההוצאה עודכנה ✓" : "ההוצאה נוספה ✓");
    // חזרה למסך שממנו הגענו (חיפוש, רשימת הוצאות, דשבורד...).
    goBackOr(navigate, FALLBACK);
  }

  return (
    <>
      <ScreenHeader
        title={isEdit ? "עריכת הוצאה" : "הוצאה חדשה"}
        action={
          <button className="btn btn--ghost" onClick={() => goBackOr(navigate, FALLBACK)}>
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
          {duplicateInvoice && (
            <p className="warn-text">⚠ קיימת הוצאה אחרת עם אותו מספר חשבונית אצל אותו עסק (ניתן להמשיך).</p>
          )}
        </div>

        {/* סכום כולל + שיעור מע"מ; הנטו וסכום המע"מ מחושבים */}
        <div className="field">
          <label>סה"כ כולל מע"מ (₪)</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={form.total}
            onChange={(e) => set({ total: e.target.value })}
          />
        </div>
        <VatFields
          gross={Number(form.total) || 0}
          rate={shownRate}
          manual={manualRate}
          defaultRate={defaultRate}
          onRateChange={setRateInput}
          onReset={() => setRateInput(null)}
        />

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

        {form.recurring && (
          <div className="field">
            <label>סיום ההוצאה הקבועה</label>
            <select value={endMode} onChange={(e) => setEndMode(e.target.value)}>
              <option value="none">ללא סיום</option>
              <option value="count">מספר חיובים (כולל הראשון)</option>
              <option value="date">עד תאריך</option>
            </select>
            {endMode === "count" && (
              <>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  dir="ltr"
                  style={{ marginTop: 8 }}
                  value={endCount}
                  onChange={(e) => setEndCount(e.target.value)}
                />
                <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
                  {Number(endCount) >= 1
                    ? `החיוב האחרון: ${endDateForCount(form.date, form.recurring, Number(endCount))}`
                    : "יש להזין מספר חיובים (1 ומעלה)."}
                </p>
              </>
            )}
            {endMode === "date" && (
              <div style={{ marginTop: 8 }}>
                <DateField
                  value={endDate}
                  onChange={setEndDate}
                  fromYear={new Date().getFullYear() - 1}
                  toYear={new Date().getFullYear() + 10}
                />
                {endDate && endDate < form.date && (
                  <p className="warn-text">⚠ תאריך הסיום לפני תאריך ההוצאה.</p>
                )}
              </div>
            )}
          </div>
        )}

        <ReceiptField value={form} onChange={set} />
      </div>

      <div className="save-row">
        <button className="btn" disabled={!Number(form.total) || endInvalid || saving} onClick={save}>
          {saving ? "שומרת…" : isEdit ? "אישור שמירה" : "הוספת הוצאה"}
        </button>
      </div>
    </>
  );
}
