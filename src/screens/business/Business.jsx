import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import BarChart from "../../components/BarChart";
import { SkeletonRows } from "../../components/Skeleton";
import SummaryByProduct from "./SummaryByProduct";
import SummaryByClient from "./SummaryByClient";
import { useCollectionData, useRepo, useAuditLog, useSettingDoc } from "../../data";
import { formatILS, HEB_MONTHS } from "../../utils/money";
import { formatDate } from "../../utils/datetime";
import { exportYearReport } from "../../utils/exportXlsx";
import { ReceiptBadge, hasReceipt } from "../../components/ReceiptField";
import { useClinicMode } from "../../context/ClinicModeProvider";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

export default function Business() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "summary");
  const { items: income, loading: incomeLoading } = useCollectionData("income");
  const { items: expenses, loading: expensesLoading } = useCollectionData("expenses");

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

      {tab === "summary" && <SummaryTabs income={income} expenses={expenses} />}
      {tab === "income" && (
        <IncomeTab
          income={income}
          loading={incomeLoading}
          initialMissing={params.get("filter") === "unpaid" ? "confirmation" : ""}
        />
      )}
      {tab === "expense" && <ExpenseTab expenses={expenses} loading={expensesLoading} />}
    </>
  );
}

// תתי-טאבים של "סיכום" (addendum §3+4): כללי | לפי מוצר | לפי לקוחה.
// "כללי" (Summary למטה) נשאר בדיוק כפי שהיה — כולל התנהגות מצב קליניקה
// שכבר עברה שינוי עצמאי — ללא כל שינוי בגוף הפונקציה עצמה.
function SummaryTabs({ income, expenses }) {
  const [sub, setSub] = useState("general");
  return (
    <>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={"seg__btn" + (sub === "general" ? " on" : "")} onClick={() => setSub("general")}>
          כללי
        </button>
        <button className={"seg__btn" + (sub === "product" ? " on" : "")} onClick={() => setSub("product")}>
          לפי מוצר
        </button>
        <button className={"seg__btn" + (sub === "client" ? " on" : "")} onClick={() => setSub("client")}>
          לפי לקוחה
        </button>
      </div>
      {sub === "general" && <Summary income={income} expenses={expenses} />}
      {sub === "product" && <SummaryByProduct />}
      {sub === "client" && <SummaryByClient />}
    </>
  );
}

function Summary({ income, expenses }) {
  const { enabled: clinicMode } = useClinicMode();
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

  // מצב קליניקה פעיל: מסתירים לגמרי את תוכן הסיכום הכספי (לא רק מטשטשים) —
  // הטאבים עצמם נשארים זמינים לניווט.
  if (clinicMode) {
    return (
      <div className="clinic-summary-hidden">
        מצב קליניקה פעיל — כבי אותו (אייקון העין למעלה) כדי לראות סיכום כספי.
      </div>
    );
  }

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
function IncomeTab({ income, initialMissing = "", loading }) {
  const { enabled: clinicMode } = useClinicMode();
  const navigate = useNavigate();
  const repo = useRepo("income");
  const apptRepo = useRepo("appointments");
  const packageRepo = useRepo("clientPackages");
  const { items: packages } = useCollectionData("clientPackages");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
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
  // הכנסות שנמחקו אופטימית ל-Undo (רק מחיקות "פשוטות" ללא side-effects —
  // ראו remove() למטה. ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const list = useMemo(() => {
    const term = q.trim();
    // מצב קליניקה: הרשימה ריקה כברירת מחדל, ומוצגת רק כתוצאה של חיפוש
    // טקסטואלי פעיל — שאר הפילטרים פועלים רק אחרי שיש טקסט בחיפוש.
    if (clinicMode && !term) return [];
    let l = income.slice().filter((r) => !hiddenIds.has(r.id));
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
  }, [income, q, status, method, from, to, receipt, missing, sortBy, clinicMode, hiddenIds]);

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

  // מחיקת הכנסה משויכת לתור/סדרה עלולה להשאיר "יתום" ביומן/בכרטיסיית הלקוחה
  // אם לא מטופלת במפורש. השאלות ("למחוק גם את...") נשאלות מיד (דורשות קלט
  // מהמשתמשת ולא ניתנות לדחייה), אבל הביצוע בפועל נדחה יחד עם שאר ה-Undo —
  // כך שגם מחיקת הכנסה עם רשומות מקושרות ניתנת לביטול תוך 5 שניות.
  async function planLinkedRecords(r) {
    if (r.source === "appointment" && r.appointmentId) {
      const alsoDeleteAppt = await confirmDialog({
        title: "מחיקת תור משויך",
        message: "האם למחוק גם את התור המשויך מהיומן ומרשימת התורים של הלקוחה?",
        confirmLabel: "מחיקה",
        danger: true,
      });
      return { deleteAppointment: alsoDeleteAppt };
    }

    if (r.source === "series") {
      const pkg = packages.find((p) => p.incomeId === r.id);
      if (!pkg) return {};
      const usedSome = (pkg.remainingSessions ?? 0) < (pkg.totalSessions ?? 0);
      const question = usedSome
        ? `החבילה "${pkg.seriesName}" כבר נוצלה חלקית (נותרו ${pkg.remainingSessions}/${pkg.totalSessions} מפגשים). האם למחוק אותה בכל זאת? תורים שכבר חויבו ממנה יישארו מתויגים "מחבילה" בהיסטוריה, ללא חבילה פעילה מאחוריהם.`
        : `האם למחוק גם את החבילה "${pkg.seriesName}" מכרטיסיית הלקוחה?`;
      const alsoDeletePkg = await confirmDialog({
        title: "מחיקת חבילה משויכת",
        message: question,
        confirmLabel: "מחיקה",
        danger: true,
      });
      return { deletePackage: alsoDeletePkg ? pkg : null };
    }

    return {};
  }

  async function executeLinkedRecords(r, plan) {
    if (plan.deleteAppointment) {
      try {
        await apptRepo.remove(r.appointmentId);
        await log({
          action: "appointment_delete",
          entity: {
            type: "appointment",
            id: r.appointmentId,
            desc: `${r.treatmentName || "תור"}${r.clientName ? ` · ${r.clientName}` : ""}`,
          },
        });
      } catch {
        /* התור כבר לא קיים / מחיקתו נכשלה — ההכנסה עדיין תימחק */
      }
    }
    if (plan.deletePackage) {
      const pkg = plan.deletePackage;
      await packageRepo.remove(pkg.id);
      await log({
        action: "package_delete",
        entity: { type: "clientPackage", id: pkg.id, desc: `${pkg.clientName} — ${pkg.seriesName}` },
      });
    }
  }

  async function remove(r) {
    if (r.paid) return;
    const ok = await confirmDialog({
      title: "מחיקת הכנסה",
      message: "למחוק את ההכנסה?",
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;

    // שאלות על רשומות מקושרות (תור/חבילה) נשאלות מיד — הן דורשות החלטה
    // מהמשתמשת ולא ניתן לדחות אותן ל-5 השניות של ה-Undo.
    const plan = await planLinkedRecords(r);

    setHiddenIds((prev) => new Set(prev).add(r.id));
    toast.showUndo({
      message: "ההכנסה נמחקה",
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(r.id);
          return next;
        }),
      onExpire: async () => {
        await executeLinkedRecords(r, plan);
        await repo.remove(r.id);
        await log({
          action: "income_delete",
          entity: { type: "income", id: r.id, desc: `${r.treatmentName || "הכנסה"} · ${formatILS(r.amount)}` },
        });
      },
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

      {loading ? (
        <SkeletonRows count={5} itemClassName="fin-item" />
      ) : list.length === 0 ? (
        <div className="empty-state">
          {clinicMode && !q.trim()
            ? "מצב קליניקה פעיל — חפשי כדי להציג הכנסות."
            : "אין הכנסות להצגה."}
        </div>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="card fin-item">
              <div className="fin-item__main">
                <div className="fin-item__top">
                  <strong className="sensitive">{formatILS(r.amount)}</strong>
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
function ExpenseTab({ expenses, loading }) {
  const { enabled: clinicMode } = useClinicMode();
  const navigate = useNavigate();
  const repo = useRepo("expenses");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const { data: catDoc } = useSettingDoc("expenseCategories");
  const categories = catDoc?.items ?? [];
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receipt, setReceipt] = useState(""); // "" | with | without
  const [sortBy, setSortBy] = useState("date");
  // הוצאות שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const list = useMemo(() => {
    const term = q.trim();
    // מצב קליניקה: הרשימה ריקה כברירת מחדל, ומוצגת רק כתוצאה של חיפוש
    // טקסטואלי פעיל — שאר הפילטרים פועלים רק אחרי שיש טקסט בחיפוש.
    if (clinicMode && !term) return [];
    let l = expenses.slice().filter((r) => !hiddenIds.has(r.id));
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
  }, [expenses, q, category, from, to, receipt, sortBy, clinicMode, hiddenIds]);

  async function remove(r) {
    const ok = await confirmDialog({
      title: "מחיקת הוצאה",
      message: "למחוק את ההוצאה?",
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(r.id));
    toast.showUndo({
      message: "ההוצאה נמחקה",
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(r.id);
          return next;
        }),
      onExpire: async () => {
        await repo.remove(r.id);
        await log({
          action: "expense_delete",
          entity: { type: "expense", id: r.id, desc: `${r.description || "הוצאה"} · ${formatILS(r.total)}` },
        });
      },
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

      {loading ? (
        <SkeletonRows count={5} itemClassName="fin-item" />
      ) : list.length === 0 ? (
        <div className="empty-state">
          {clinicMode && !q.trim()
            ? "מצב קליניקה פעיל — חפשי כדי להציג הוצאות."
            : "אין הוצאות להצגה."}
        </div>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="card fin-item">
              <div className="fin-item__main">
                <div className="fin-item__top">
                  <strong className="sensitive">{formatILS(r.total)}</strong>
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
