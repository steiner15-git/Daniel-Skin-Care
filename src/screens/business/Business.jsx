import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import BarChart from "../../components/BarChart";
import { useCollectionData, useRepo, useAuditLog, useSettingDoc } from "../../data";
import { formatILS, HEB_MONTHS } from "../../utils/money";
import { formatDate } from "../../utils/datetime";
import { exportYearReport } from "../../utils/exportXlsx";
import { ReceiptBadge, hasReceipt } from "../../components/ReceiptField";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

export default function Business() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "summary");
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");

  return (
    <>
      <ScreenHeader title="ניהול עסק" />
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={"seg__btn" + (tab === "summary" ? " on" : "")} onClick={() => setTab("summary")}>
          סיכום
        </button>
        <button className={"seg__btn" + (tab === "income" ? " on" : "")} onClick={() => setTab("income")}>
          הכנסות
        </button>
        <button className={"seg__btn" + (tab === "expense" ? " on" : "")} onClick={() => setTab("expense")}>
          הוצאות
        </button>
      </div>

      {tab === "summary" && <Summary income={income} expenses={expenses} />}
      {tab === "income" && (
        <IncomeTab
          income={income}
          initialMissing={params.get("filter") === "unpaid" ? "confirmation" : ""}
        />
      )}
      {tab === "expense" && <ExpenseTab expenses={expenses} />}
    </>
  );
}

function Summary({ income, expenses }) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [mode, setMode] = useState("month");

  const monthly = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
    for (const r of income) {
      const d = new Date(r.date);
      if (d.getFullYear() === year) arr[d.getMonth()].income += Number(r.amount) || 0;
    }
    for (const r of expenses) {
      const d = new Date(r.date);
      if (d.getFullYear() === year) arr[d.getMonth()].expense += Number(r.total) || 0;
    }
    return arr;
  }, [income, expenses, year]);

  const scope =
    mode === "year"
      ? monthly.reduce(
          (s, m) => ({ income: s.income + m.income, expense: s.expense + m.expense }),
          { income: 0, expense: 0 }
        )
      : monthly[month];

  const profit = scope.income - scope.expense;
  const chartData = monthly.map((m, i) => ({
    label: HEB_MONTHS[i].slice(0, 3),
    income: m.income,
    expense: m.expense,
  }));

  return (
    <>
      <div className="year-nav">
        <button className="icon-btn" onClick={() => setYear(year - 1)}>›</button>
        <strong>{year}</strong>
        <button className="icon-btn" onClick={() => setYear(year + 1)}>‹</button>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={"seg__btn" + (mode === "month" ? " on" : "")} onClick={() => setMode("month")}>
          חודשי
        </button>
        <button className={"seg__btn" + (mode === "year" ? " on" : "")} onClick={() => setMode("year")}>
          שנתי
        </button>
      </div>

      {mode === "month" && (
        <div className="field">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {HEB_MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
        </div>
      )}

      <div className="stat-row">
        <div className="stat stat--income">
          <span className="muted">הכנסות</span>
          <strong>{formatILS(scope.income)}</strong>
        </div>
        <div className="stat stat--expense">
          <span className="muted">הוצאות</span>
          <strong>{formatILS(scope.expense)}</strong>
        </div>
        <div className="stat stat--profit">
          <span className="muted">רווח</span>
          <strong>{formatILS(profit)}</strong>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <BarChart data={chartData} highlight={mode === "month" ? month : -1} />
      </div>

      <button
        className="btn btn--ghost btn--block"
        style={{ marginTop: 16 }}
        onClick={() => exportYearReport(year, income, expenses)}
      >
        ⬇ ייצוא דוח שנתי ל-Excel ({year})
      </button>
    </>
  );
}

/* ---------- הכנסות ---------- */
function IncomeTab({ income, initialMissing = "" }) {
  const navigate = useNavigate();
  const repo = useRepo("income");
  const log = useAuditLog();
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [];
  const [q, setQ] = useState("");
  const [missing, setMissing] = useState(initialMissing); // "" | confirmation | invoice | both
  const [status, setStatus] = useState(""); // "" | paid | unpaid
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receipt, setReceipt] = useState(""); // "" | with | without
  const [sortBy, setSortBy] = useState("date");

  const list = useMemo(() => {
    let l = income.slice();
    const term = q.trim();
    if (term)
      l = l.filter((r) =>
        [r.clientName, r.treatmentName, r.note, r.invoiceNumber]
          .filter(Boolean)
          .some((v) => String(v).includes(term))
      );
    if (status === "paid") l = l.filter((r) => r.paid);
    else if (status === "unpaid") l = l.filter((r) => !r.paid);
    if (method) l = l.filter((r) => r.paymentMethod === method);
    if (from) l = l.filter((r) => (r.date || "") >= from);
    if (to) l = l.filter((r) => (r.date || "") <= to);
    if (receipt === "with") l = l.filter(hasReceipt);
    else if (receipt === "without") l = l.filter((r) => !hasReceipt(r));
    if (missing === "confirmation") l = l.filter((r) => !r.paid);
    else if (missing === "invoice") l = l.filter((r) => !r.invoiceNumber);
    else if (missing === "both") l = l.filter((r) => !r.paid && !r.invoiceNumber);
    l.sort((a, b) => {
      if (sortBy === "amount") return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === "method") return (a.paymentMethod || "").localeCompare(b.paymentMethod || "", "he");
      return new Date(b.date) - new Date(a.date);
    });
    return l;
  }, [income, q, status, method, from, to, receipt, missing, sortBy]);

  async function togglePaid(r) {
    const paid = !r.paid;
    await repo.update(r.id, { paid });
    await log({
      action: paid ? "income_mark_paid" : "income_unmark_paid",
      entity: { type: "income", id: r.id, desc: `${r.treatmentName || "הכנסה"} · ${formatILS(r.amount)}` },
      before: { paid: r.paid },
      after: { paid },
    });
  }

  async function remove(r) {
    if (r.paid) return;
    if (!confirm("למחוק את ההכנסה?")) return;
    await repo.remove(r.id);
    await log({
      action: "income_delete",
      entity: { type: "income", id: r.id, desc: `${r.treatmentName || "הכנסה"} · ${formatILS(r.amount)}` },
    });
  }

  return (
    <>
      <div className="toolbar">
        <input placeholder="חיפוש (לקוחה / טיפול / חשבונית)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar__row">
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>מתאריך</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>עד תאריך</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="toolbar__row">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="paid">שולם</option>
            <option value="unpaid">לא שולם</option>
          </select>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">כל אמצעי התשלום</option>
            {methods.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="toolbar__row">
          <select value={missing} onChange={(e) => setMissing(e.target.value)}>
            <option value="">כל ההכנסות</option>
            <option value="confirmation">חסר אישור תשלום</option>
            <option value="invoice">חסרה חשבונית</option>
            <option value="both">חסרים שניהם</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">סדר לפי תאריך</option>
            <option value="amount">סדר לפי סכום</option>
            <option value="method">סדר לפי אמצעי תשלום</option>
          </select>
        </div>
        <div className="toolbar__row">
          <select value={receipt} onChange={(e) => setReceipt(e.target.value)}>
            <option value="">תמונה: הכל</option>
            <option value="with">עם תמונה</option>
            <option value="without">ללא תמונה</option>
          </select>
        </div>
        <button className="btn btn--block" onClick={() => navigate("/business/income/new")}>
          + הכנסה ידנית
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">אין הכנסות להצגה.</div>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="card fin-item">
              <div className="fin-item__main">
                <div className="fin-item__top">
                  <strong>{formatILS(r.amount)}</strong>
                  <span className={"badge " + (r.paid ? "badge--ok" : "badge--warn")}>
                    {r.paid ? "שולם" : "לא שולם"}
                  </span>
                  <ReceiptBadge value={r} />
                </div>
                <span className="muted">
                  {formatDate(r.date)} · {r.treatmentName || r.note || "הכנסה"}
                  {r.clientName ? ` · ${r.clientName}` : ""}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {r.paymentMethod || "—"}
                  {r.invoiceNumber ? ` · חשבונית ${r.invoiceNumber}` : " · ללא חשבונית"}
                </span>
              </div>
              <div className="fin-item__actions">
                <button className="btn btn--ghost" onClick={() => togglePaid(r)}>
                  {r.paid ? "בטל שולם" : "סמן שולם"}
                </button>
                <button className="btn btn--ghost" onClick={() => navigate(`/business/income/${r.id}/edit`)}>
                  עריכה
                </button>
                <button
                  className="btn btn--muted"
                  disabled={r.paid}
                  title={r.paid ? "יש להסיר סימון 'שולם' לפני מחיקה" : ""}
                  onClick={() => remove(r)}
                >
                  מחיקה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}>
        הכנסה שסומנה "שולם" אינה ניתנת למחיקה עד להסרת הסימון.
      </p>
    </>
  );
}

/* ---------- הוצאות ---------- */
function ExpenseTab({ expenses }) {
  const navigate = useNavigate();
  const repo = useRepo("expenses");
  const log = useAuditLog();
  const { data: catDoc } = useSettingDoc("expenseCategories");
  const categories = catDoc?.items ?? [];
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receipt, setReceipt] = useState(""); // "" | with | without
  const [sortBy, setSortBy] = useState("date");

  const list = useMemo(() => {
    let l = expenses.slice();
    const term = q.trim();
    if (term)
      l = l.filter((r) =>
        [r.description, r.businessName, r.category, r.invoiceNumber]
          .filter(Boolean)
          .some((v) => String(v).includes(term))
      );
    if (category) l = l.filter((r) => r.category === category);
    if (from) l = l.filter((r) => (r.date || "") >= from);
    if (to) l = l.filter((r) => (r.date || "") <= to);
    if (receipt === "with") l = l.filter(hasReceipt);
    else if (receipt === "without") l = l.filter((r) => !hasReceipt(r));
    l.sort((a, b) => {
      if (sortBy === "amount") return (Number(b.total) || 0) - (Number(a.total) || 0);
      if (sortBy === "category") return (a.category || "").localeCompare(b.category || "", "he");
      return new Date(b.date) - new Date(a.date);
    });
    return l;
  }, [expenses, q, category, from, to, receipt, sortBy]);

  async function remove(r) {
    if (!confirm("למחוק את ההוצאה?")) return;
    await repo.remove(r.id);
    await log({
      action: "expense_delete",
      entity: { type: "expense", id: r.id, desc: `${r.description || "הוצאה"} · ${formatILS(r.total)}` },
    });
  }

  return (
    <>
      <div className="toolbar">
        <input placeholder="חיפוש (תיאור / עסק / קטגוריה)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar__row">
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>מתאריך</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>עד תאריך</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="toolbar__row">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">כל הקטגוריות</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">סדר לפי תאריך</option>
            <option value="amount">סדר לפי סכום</option>
            <option value="category">סדר לפי קטגוריה</option>
          </select>
        </div>
        <div className="toolbar__row">
          <select value={receipt} onChange={(e) => setReceipt(e.target.value)}>
            <option value="">תמונה: הכל</option>
            <option value="with">עם תמונה</option>
            <option value="without">ללא תמונה</option>
          </select>
        </div>
        <button className="btn btn--block" onClick={() => navigate("/business/expense/new")}>
          + הוצאה
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">אין הוצאות להצגה.</div>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="card fin-item">
              <div className="fin-item__main">
                <div className="fin-item__top">
                  <strong>{formatILS(r.total)}</strong>
                  {r.recurring && <span className="badge badge--info">קבועה · {r.recurring === "yearly" ? "שנתי" : "חודשי"}</span>}
                  <ReceiptBadge value={r} />
                </div>
                <span className="muted">
                  {formatDate(r.date)} · {r.description || "הוצאה"}
                  {r.businessName ? ` · ${r.businessName}` : ""}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {r.category || "—"}
                  {r.invoiceNumber ? ` · חשבונית ${r.invoiceNumber}` : ""}
                </span>
              </div>
              <div className="fin-item__actions">
                <button className="btn btn--ghost" onClick={() => navigate(`/business/expense/${r.id}/edit`)}>
                  עריכה
                </button>
                <button className="btn btn--muted" onClick={() => remove(r)}>
                  מחיקה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
