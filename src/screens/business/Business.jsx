import { useEffect, useMemo, useState } from "react";
import { useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import BarChart from "../../components/BarChart";
import { SkeletonRows } from "../../components/Skeleton";
import SummaryByProduct from "./SummaryByProduct";
import SummaryByClient from "./SummaryByClient";
import SummaryOverview from "./SummaryOverview";
import { useCollectionData, useYearRangeCollectionData, useRepo, useAuditLog, useSettingDoc } from "../../data";
import { usePaymentMethods, useExpenseCategories } from "../../data/useListSettings";
import { useVatSettings } from "../../data/useVatSettings";
import { useReminderSettings } from "../../data/useReminderSettings";
import { formatILS, HEB_MONTHS } from "../../utils/money";
import { formatDate } from "../../utils/datetime";
import { round2 } from "../../utils/credits";
import { exportYearReport } from "../../utils/exportXlsx";
import {
  incomeVat,
  expenseVat,
  incomeRevenue,
  expenseCost,
  incomeVatDue,
  expenseVatCredit,
  formatMoney2,
  taxYearFor,
  isLicensed,
  turnoverForYear,
} from "../../utils/vat";
import {
  pendingClosureAppts,
  unverifiedIncome,
  incomeMissingInvoice,
  expensesMissingReceipt,
} from "../../utils/reminders";
import { openSeriesLiability } from "../../utils/seriesRealization";
import { recurringEnded } from "../../utils/recurring";
import { periodRange } from "../../utils/period";
import { ReceiptBadge, hasReceipt } from "../../components/ReceiptField";
import { useClinicMode } from "../../context/ClinicModeProvider";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

// סינונים שמורים של רשימות ההכנסות/ההוצאות (sessionStorage, פר-לשונית דפדפן).
// נשמרים בכל שינוי, ומשוחזרים רק בחזרה למסך (ניווט אחורה אחרי עריכת רשומה) —
// לא בכניסה רגילה, שבה הרשימה נפתחת נקייה כמו תמיד. ראו Business() / restore.
const FILTER_STORAGE_KEYS = {
  income: "dsc:filters:income",
  expense: "dsc:filters:expense",
};

function readSavedFilters(name) {
  try {
    return JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEYS[name]) || "null");
  } catch {
    return null;
  }
}

function writeSavedFilters(name, value) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEYS[name], JSON.stringify(value));
  } catch {
    /* sessionStorage לא זמין — הסינון פשוט לא ישוחזר */
  }
}

// Phase 4 §9 (המשך) — Business() כבר לא שואב income/expenses ברמה
// העליונה: כל טאב (SummaryTabs/IncomeTab/ExpenseTab) שואב בעצמו, רק כל עוד
// הוא מורכב (mounted) בפועל. לפני התיקון, שני ה-useCollectionData היו
// רצים תמיד גם כשהטאב הפעיל לא זקוק להם כלל (למשל income נטען גם כשהמסך
// על "הוצאות") — וגם היו "נועלים" את שני הטאבים על טעינת ההיסטוריה
// המלאה מאז ומתמיד, בלי דרך לצמצם.
// תווית מקור להכנסה (תגית לחיצה בשורה, מובילה לכרטיסיית הלקוחה). הכנסה ידנית
// (manual) אינה מקבלת תגית.
const SOURCE_LABELS = { appointment: "מתור", series: "סדרה", product: "מוצר", voucher: "שובר" };

// קיבוץ רשימה (ממוינת לפי תאריך) לפי חודש, עם סכום חלקי לכל חודש.
function monthGroups(list, amountOf) {
  const map = new Map();
  for (const r of list) {
    const d = new Date(r.date);
    const bad = isNaN(d);
    const key = bad ? "none" : `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: bad ? "ללא תאריך" : `${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        items: [],
        total: 0,
      });
    }
    const g = map.get(key);
    g.items.push(r);
    g.total += amountOf(r);
  }
  return [...map.values()];
}

export default function Business() {
  const [params, setParams] = useSearchParams();
  const navType = useNavigationType();
  const [tab, setTab] = useState(params.get("tab") || "summary");
  // הטאב הפעיל נשמר ב-URL, כך שחזרה ממסך משני (עריכת הכנסה/הוצאה) מחזירה לאותו טאב.
  useEffect(() => {
    if (params.get("tab") === tab) return;
    setParams({ tab }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // restorable: האם הרשימות משחזרות סינונים שמורים. true רק כשהמסך נפתח בחזרה
  // (POP — ניווט אחורה, או רענון); כל פעולה יזומה (לחיצה על טאב, "דורש טיפול",
  // drill-down) מכבה אותו, כך שהרשימה נפתחת נקייה כמו תמיד.
  const [restorable, setRestorable] = useState(navType === "POP");

  // פילטרים שמגיעים מ"דורש טיפול" או מקישור עמוק (?filter=unpaid). מתאפסים
  // בלחיצה ידנית על טאב, כדי שפילטר ישן לא "ידבק" לכניסה הבאה.
  const [incomeMissing, setIncomeMissing] = useState(
    params.get("filter") === "unpaid" ? "confirmation" : ""
  );
  const [expenseReceipt, setExpenseReceipt] = useState("");
  // drill-down מהסיכומים: { tab, year, from, to, q?, source?, category? } — נפתח
  // טאב ההכנסות/ההוצאות עם הסינון המתאים (ראו IncomeTab/ExpenseTab `initial`).
  const [drill, setDrill] = useState(null);

  function openTab(name) {
    setRestorable(false);
    setIncomeMissing("");
    setExpenseReceipt("");
    setDrill(null);
    setTab(name);
  }
  function goIncome(missing) {
    setRestorable(false);
    setIncomeMissing(missing);
    setExpenseReceipt("");
    setDrill(null);
    setTab("income");
  }
  function goExpense(receipt) {
    setRestorable(false);
    setExpenseReceipt(receipt);
    setIncomeMissing("");
    setDrill(null);
    setTab("expense");
  }
  function goDrill(d) {
    setRestorable(false);
    setDrill(d);
    setIncomeMissing("");
    setExpenseReceipt("");
    setTab(d.tab);
  }

  return (
    <>
      <ScreenHeader title="ניהול עסק" />
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={"seg__btn" + (tab === "summary" ? " on" : "")} onClick={() => openTab("summary")}>
          סיכום
        </button>
        <button className={"seg__btn" + (tab === "income" ? " on" : "")} onClick={() => openTab("income")}>
          הכנסות
        </button>
        <button className={"seg__btn" + (tab === "expense" ? " on" : "")} onClick={() => openTab("expense")}>
          הוצאות
        </button>
      </div>

      {tab === "summary" && <AttentionHub onIncome={goIncome} onExpense={goExpense} />}
      {tab === "summary" && <SummaryTabs onDrill={goDrill} />}
      {tab === "income" && (
        <IncomeTab
          key={incomeMissing + JSON.stringify(drill)}
          initialMissing={incomeMissing}
          initial={drill?.tab === "income" ? drill : {}}
          restore={restorable}
        />
      )}
      {tab === "expense" && (
        <ExpenseTab
          key={expenseReceipt + JSON.stringify(drill)}
          initialReceipt={expenseReceipt}
          initial={drill?.tab === "expense" ? drill : {}}
          restore={restorable}
        />
      )}
    </>
  );
}

// מרכז "דורש טיפול": ריכוז פריטים פתוחים עם קישור לרשימה המסוננת. מוצג רק כשיש
// מה לטפל. החישובים ב-utils/reminders.js (משותפים עם מסך הבית והבאדג'ים);
// "חשבונית חסרה" ו"הוצאה בלי תמונה" נספרים לשנה הנוכחית בלבד.
function AttentionHub({ onIncome, onExpense }) {
  const navigate = useNavigate();
  const { items: appts } = useCollectionData("appointments");
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");
  const { data: reminders } = useReminderSettings();
  const thisYear = new Date().getFullYear();

  const pending = useMemo(() => pendingClosureAppts(appts), [appts]);
  const unpaid = useMemo(
    () => unverifiedIncome(income, reminders.paymentVerificationDays),
    [income, reminders.paymentVerificationDays]
  );
  const noInvoice = useMemo(() => incomeMissingInvoice(income, thisYear), [income, thisYear]);
  const noReceipt = useMemo(() => expensesMissingReceipt(expenses, thisYear), [expenses, thisYear]);

  if (!pending.length && !unpaid.length && !noInvoice.length && !noReceipt.length) return null;

  return (
    <div className="card reminders" style={{ marginBottom: 16 }}>
      <strong>דורש טיפול</strong>
      {pending.length > 0 && (
        <button className="reminder reminder--link" onClick={() => navigate("/calendar?view=pending")}>
          🕓 {pending.length} תורים ממתינים לסגירה →
        </button>
      )}
      {unpaid.length > 0 && (
        <button className="reminder reminder--link" onClick={() => onIncome("confirmation")}>
          💰 {unpaid.length} הכנסות טרם אומתו (מעל {reminders.paymentVerificationDays} ימים) →
        </button>
      )}
      {noInvoice.length > 0 && (
        <button className="reminder reminder--link" onClick={() => onIncome("invoice")}>
          🧾 {noInvoice.length} הכנסות השנה בלי מספר חשבונית →
        </button>
      )}
      {noReceipt.length > 0 && (
        <button className="reminder reminder--link" onClick={() => onExpense("without")}>
          📎 {noReceipt.length} הוצאות השנה בלי תמונה →
        </button>
      )}
    </div>
  );
}

// תתי-טאבים של "סיכום" (addendum §3+4): כללי | לפי מוצר | לפי לקוחה.
// "כללי" (Summary למטה) נשאר בדיוק כפי שהיה — כולל התנהגות מצב קליניקה
// שכבר עברה שינוי עצמאי — ללא כל שינוי בגוף הפונקציה עצמה.
//
// Phase 4 §9 (המשך) — income/expenses המלאים (ללא הגבלת שנה) עברו לכאן
// מ-Business() בעצמו: SummaryTabs() (בניגוד ל-Summary() עצמה) כבר שונתה
// בעבר כדי לתווך בין הטאבים, כך שזו נקודת החיבור הנכונה לשינוי — Summary()
// עצמה ממשיכה לקבל בדיוק את אותם income/expenses לא-מוגבלים כמו קודם,
// ה-source שלהם רק זז שכבה אחת למעלה.
function SummaryTabs({ onDrill }) {
  const [sub, setSub] = useState("general");
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");
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
        <button className={"seg__btn" + (sub === "overview" ? " on" : "")} onClick={() => setSub("overview")}>
          מבט על
        </button>
      </div>
      {sub === "general" && <Summary income={income} expenses={expenses} onDrill={onDrill} />}
      {sub === "product" && <SummaryByProduct onDrill={onDrill} />}
      {sub === "client" && <SummaryByClient onDrill={onDrill} />}
      {sub === "overview" && <SummaryOverview onDrill={onDrill} />}
    </>
  );
}

function Summary({ income, expenses, onDrill }) {
  const { enabled: clinicMode } = useClinicMode();
  const { years } = useVatSettings();
  const { items: packages } = useCollectionData("clientPackages");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [mode, setMode] = useState("month");

  // מע"מ: הכנסה = נטו בשנת מורשה / סכום כולל בשנת פטור; הוצאה = נטו בשנת מורשה
  // / סכום כולל בשנת פטור (utils/vat.js). outVat/inVat — מע"מ עסקאות/תשומות,
  // רק מרשומות בשנת מורשה; lic — האם יש בחודש רשומות בשנת מורשה.
  const monthly = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({
      income: 0,
      expense: 0,
      outVat: 0,
      inVat: 0,
      lic: false,
    }));
    for (const r of income) {
      const d = new Date(r.date);
      if (d.getFullYear() === year) {
        const m = arr[d.getMonth()];
        m.income += incomeRevenue(r, years);
        m.outVat += incomeVatDue(r, years);
        if (incomeVat(r, years).licensed) m.lic = true;
      }
    }
    for (const r of expenses) {
      const d = new Date(r.date);
      if (d.getFullYear() === year) {
        const m = arr[d.getMonth()];
        m.expense += expenseCost(r, years);
        m.inVat += expenseVatCredit(r, years);
        if (expenseVat(r, years).licensed) m.lic = true;
      }
    }
    return arr;
  }, [income, expenses, year, years]);

  // סדרות פתוחות (נכון להיום): שווי המפגשים שנותרו בחבילות פעילות. שכבה ניהולית
  // בלבד — אינה נספרת בהכנסות (ראו utils/seriesRealization.js).
  const openSeries = useMemo(() => {
    const incomeById = {};
    for (const r of income) incomeById[r.id] = { amount: incomeRevenue(r, years) };
    return openSeriesLiability(packages, incomeById);
  }, [income, packages, years]);

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
          (s, m) => ({
            income: s.income + m.income,
            expense: s.expense + m.expense,
            outVat: s.outVat + m.outVat,
            inVat: s.inVat + m.inVat,
            lic: s.lic || m.lic,
          }),
          { income: 0, expense: 0, outVat: 0, inVat: 0, lic: false }
        )
      : monthly[month];

  const profit = scope.income - scope.expense;
  const vatDue = round2(scope.outVat - scope.inVat);

  // מד תקרת מחזור: רק לשנת מס של עוסק פטור עם תקרה שהוגדרה.
  const taxEntry = taxYearFor(`${year}-06-30`, years);
  const showMeter = !!taxEntry && !isLicensed(taxEntry) && taxEntry.ceiling > 0;
  const turnover = showMeter ? turnoverForYear(income, years, taxEntry.id) : 0;
  const meterPct = showMeter ? Math.round((turnover / taxEntry.ceiling) * 100) : 0;
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

      {/* drill-down: מעבר לרשימת ההכנסות/ההוצאות של התקופה שמוצגת */}
      {onDrill && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => onDrill({ tab: "income", year, ...periodRange(year, month, mode) })}
          >
            הכנסות התקופה ‹
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => onDrill({ tab: "expense", year, ...periodRange(year, month, mode) })}
          >
            הוצאות התקופה ‹
          </button>
        </div>
      )}

      {/* מע"מ לתשלום — מוצג רק כשיש בטווח רשומות בשנת מורשה */}
      {scope.lic && (
        <div className="stat stat--profit" style={{ marginTop: 10 }}>
          <span className="muted">מע"מ לתשלום (עסקאות פחות תשומות)</span>
          <strong>{formatMoney2(vatDue)}</strong>
          <span className="muted" style={{ marginTop: 4 }}>
            עסקאות {formatMoney2(scope.outVat)} · תשומות {formatMoney2(scope.inVat)}
          </span>
        </div>
      )}

      {showMeter && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="card-head" style={{ marginBottom: 8 }}>
            <h3>מחזור מול תקרת עוסק פטור</h3>
            <strong className="sensitive">{meterPct}%</strong>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, meterPct)}%`,
                height: "100%",
                background:
                  meterPct >= 100 ? "var(--danger)" : meterPct >= 80 ? "#c98228" : "var(--accent-2)",
              }}
            />
          </div>
          <p className="muted sensitive" style={{ fontSize: 13, margin: "8px 0 0" }}>
            {formatILS(turnover)} מתוך {formatILS(taxEntry.ceiling)}
          </p>
          {meterPct >= 80 && (
            <p className="warn-text">
              ⚠ {meterPct >= 100 ? "המחזור עבר את התקרה" : "המחזור מתקרב לתקרה"} — כדאי לבדוק מעבר
              לעוסק מורשה (המעבר חל על כל שנת המס).
            </p>
          )}
        </div>
      )}

      {(openSeries.sessions > 0 || openSeries.expiredSessions > 0) && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="card-head" style={{ marginBottom: 6 }}>
            <h3>סדרות פתוחות</h3>
            <strong className="sensitive">{formatILS(openSeries.value)}</strong>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            נכון להיום: {openSeries.sessions} מפגשים שנותרו ב-{openSeries.count} חבילות פעילות — כסף
            שכבר נגבה ועדיין לא נוצל. לא נספר בהכנסות.
          </p>
          {openSeries.expiredSessions > 0 && (
            <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
              פקעו ללא מימוש: {openSeries.expiredSessions} מפגשים ·{" "}
              <span className="sensitive">{formatILS(openSeries.expiredValue)}</span>
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <BarChart data={chartData} highlight={mode === "month" ? month : -1} />
      </div>

      <button
        className="btn btn--ghost btn--block"
        style={{ marginTop: 16 }}
        onClick={() => exportYearReport(year, income, expenses, years)}
      >
        ⬇ ייצוא דוח שנתי ל-Excel ({year})
      </button>
    </>
  );
}

// Phase 4 §9 (המשך) — בורר "שנה ‹ N › | כל השנים" משותף ל-IncomeTab/
// ExpenseTab. לא נעשה שימוש חוזר ב-YearMonthNav.jsx הקיים (הועבר לבדיקה):
// הוא בנוי לצורך אחר — מתג "חודשי/שנתי" לתצוגת-צבירה בתוך שנה שכבר נטענה
// (סיכום לפי מוצר/לקוחה) — לא לבחירת *איזו* שנה לטעון מלכתחילה מול "הכול".
// שני הצרכים שונים מספיק כדי לא לעוות רכיב אחד לשניהם; זהו רכיב קטן וממוקד
// חדש במקום זאת, בעיצוב עקבי (`.year-nav`/`.icon-btn`/`.chip` קיימים).
function YearScopeNav({ year, setYear, allYears, setAllYears }) {
  return (
    <div className="year-nav">
      <button className="icon-btn" disabled={allYears} onClick={() => setYear(year - 1)}>›</button>
      <strong>{allYears ? "כל השנים" : year}</strong>
      <button className="icon-btn" disabled={allYears} onClick={() => setYear(year + 1)}>‹</button>
      <button
        type="button"
        className={"chip" + (allYears ? " chip--on" : "")}
        style={{ marginInlineStart: 10 }}
        onClick={() => setAllYears((v) => !v)}
      >
        כל השנים
      </button>
    </div>
  );
}

/* ---------- הכנסות ---------- */
// restore: האם לשחזר סינונים שמורים (חזרה ממסך עריכה). כשיש סינונים שמורים הם
// גוברים על initial/initialMissing שהתקבלו; אחרת הרשימה נפתחת לפי הערכים
// שהתקבלו (drill-down / "דורש טיפול" / ברירת מחדל).
function IncomeTab({ initialMissing: initialMissingProp = "", initial: initialProp = {}, restore = false }) {
  const [saved] = useState(() => (restore ? readSavedFilters("income") : null));
  const initial = saved ? { ...initialProp, ...saved } : initialProp;
  const initialMissing = saved ? saved.missing ?? "" : initialMissingProp;

  const { enabled: clinicMode } = useClinicMode();
  const navigate = useNavigate();
  const repo = useRepo("income");
  const apptRepo = useRepo("appointments");
  const packageRepo = useRepo("clientPackages");
  // תוקן QA (2026-09): productRepo + products נדרשים כדי לאפשר החזרת מלאי
  // בעת מחיקת הכנסה ממכירת מוצר (ראו planLinkedRecords/executeLinkedRecords
  // למטה) — לפני התיקון, מחיקת מכירה שגויה/כפולה לא הציעה כלל להחזיר את
  // הכמות למלאי, והמלאי נשאר חסר לצמיתות עד תיקון ידני.
  const { items: packages } = useCollectionData("clientPackages");
  const { items: products } = useCollectionData("products");
  const productRepo = useRepo("products");
  // שוברי מתנה (D-3): מחיקת הכנסת שובר מציעה למחוק גם את היתרה שנוצרה ממנה.
  const { items: credits } = useCollectionData("credits");
  const creditRepo = useRepo("credits");
  const { years } = useVatSettings();
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  // אמצעי תשלום כולל ברירות מחדל גם אם הרשימה לא נשמרה מעולם בהגדרות.
  const { items: methods } = usePaymentMethods();
  const [q, setQ] = useState(initial.q || "");
  const [missing, setMissing] = useState(initialMissing); // "" | confirmation | invoice | both
  const [status, setStatus] = useState(initial.status ?? ""); // "" | paid | unpaid
  const [method, setMethod] = useState(initial.method ?? "");
  const [from, setFrom] = useState(initial.from || "");
  const [to, setTo] = useState(initial.to || "");
  const [receipt, setReceipt] = useState(initial.receipt ?? ""); // "" | with | without
  const [source, setSource] = useState(initial.source || ""); // "" | appointment | series | product | voucher | manual
  const [sortBy, setSortBy] = useState(initial.sortBy ?? "date");
  // Phase 4 §9 (המשך) — ברירת מחדל: השנה הנוכחית בלבד (שאילתה מוגבלת, ראו
  // useYearRangeCollectionData). "כל השנים" משחזר בדיוק את ההתנהגות
  // הקודמת (שאילתה מלאה, ללא הגבלה) — אותו מנוי משותף שגם SummaryTabs
  // כבר עשוי להיות מנוי עליו, ללא כפילות עלות.
  //
  // חריג מכוון: כשמגיעים דרך "?filter=unpaid" (למשל מ-Dashboard/BottomNav
  // — הכנסה לא-מאומתת עשויה להיות משנה קודמת, ולא רק מהשנה הנוכחית),
  // ברירת המחדל היא "כל השנים" ולא השנה הנוכחית — אחרת הזימון הישיר
  // (deep-link) עלול "לאבד" בשקט את הרשומה שאותה בדיוק ביקשו למצוא.
  const [year, setYear] = useState(initial.year || CURRENT_YEAR);
  const [allYears, setAllYears] = useState(
    initial.allYears ?? (initialMissing === "confirmation" || initialMissing === "both")
  );
  const { items: income, loading } = useYearRangeCollectionData(
    "income",
    "date",
    allYears ? null : year
  );
  // הכנסות שנמחקו אופטימית ל-Undo (רק מחיקות "פשוטות" ללא side-effects —
  // ראו remove() למטה. ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  // שמירת הסינונים לשחזור בחזרה ממסך עריכה (sessionStorage).
  useEffect(() => {
    writeSavedFilters("income", {
      q, missing, status, method, from, to, receipt, source, sortBy, year, allYears,
    });
  }, [q, missing, status, method, from, to, receipt, source, sortBy, year, allYears]);

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
    if (source) l = l.filter((r) => (r.source || "manual") === source);
    if (from) l = l.filter((r) => (r.date || "") >= from);
    if (to) l = l.filter((r) => (r.date || "") <= to);
    if (receipt === "with") l = l.filter(hasReceipt);
    else if (receipt === "without") l = l.filter((r) => !hasReceipt(r));
    // הכנסה בסכום ₪0 (קיזוז מיתרה / חבילה) לא דורשת תשלום ולא חשבונית — אינה
    // נכללת בסינוני "חסר ...". "חסר אישור תשלום" מציג את כל מה שטרם אומת, גם אם
    // טרם עבר מספר הימים של התזכורת (הספירה בבאדג' נשארת לפי הסף).
    const hasAmount = (r) => (Number(r.amount) || 0) > 0;
    const noInvoice = (r) => !String(r.invoiceNumber || "").trim();
    if (missing === "confirmation") l = l.filter((r) => hasAmount(r) && !r.paid);
    else if (missing === "invoice") l = l.filter((r) => hasAmount(r) && noInvoice(r));
    else if (missing === "both") l = l.filter((r) => hasAmount(r) && !r.paid && noInvoice(r));
    l.sort((a, b) => {
      if (sortBy === "amount") return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === "method") return (a.paymentMethod || "").localeCompare(b.paymentMethod || "", "he");
      return new Date(b.date) - new Date(a.date);
    });
    return l;
  }, [income, q, status, method, from, to, receipt, source, missing, sortBy, clinicMode, hiddenIds]);

  async function togglePaid(r) {
    const paid = !r.paid;
    try {
      await repo.update(r.id, { paid });
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "עדכון סטטוס התשלום נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    // כשל בלוג אחרי שהעדכון הצליח לא אמור להציג "העדכון נכשל".
    try {
      await log({
        action: paid ? "income_mark_paid" : "income_unmark_paid",
        entity: { type: "income", id: r.id, desc: `${r.treatmentName || "הכנסה"} · ${formatILS(r.amount)}` },
        before: { paid: r.paid },
        after: { paid },
      });
    } catch (e) {
      console.error("[audit] income paid toggle failed", e);
    }
    toast.showMessage(paid ? "סומן כשולם ✓" : "סימון התשלום הוסר");
  }

  // מחיקת הכנסה משויכת לתור/סדרה/מכירת מוצר/שובר עלולה להשאיר "יתום" (ביומן,
  // בכרטיסיית הלקוחה, במלאי, או ביתרת זיכוי) אם לא מטופלת במפורש. השאלות
  // ("למחוק גם את...") נשאלות מיד (דורשות קלט מהמשתמשת ולא ניתנות לדחייה),
  // אבל הביצוע בפועל נדחה יחד עם שאר ה-Undo — כך שגם מחיקת הכנסה עם רשומות
  // מקושרות ניתנת לביטול תוך 5 שניות.
  async function planSourceRecords(r) {
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

    // תוקן QA (2026-09) — הכנסה ממכירת מוצר: מציעה להחזיר את הכמות שנמכרה
    // למלאי המוצר. אם המוצר עצמו כבר נמחק בינתיים, אין מה להחזיר אליו —
    // ממשיכים למחיקת ההכנסה בלבד.
    if (r.source === "product" && r.productId) {
      const product = products.find((p) => p.id === r.productId);
      if (!product) return {};
      const qty = Number(r.quantity) || 1;
      const alsoRestock = await confirmDialog({
        title: "מחיקת מכירת מוצר",
        message: `האם להחזיר ${qty} יחיד${qty === 1 ? "ה" : "ות"} למלאי "${product.name}"?`,
        confirmLabel: "החזרה למלאי",
      });
      return { restockProduct: alsoRestock ? { id: product.id, qty, currentStock: product.stock ?? 0 } : null };
    }

    // שובר מתנה (addendum שוברים/זיכוי, D-3): היתרה שנוצרה ברכישה נמצאת לפי
    // incomeId. אם היא כבר נוצלה (חלקית/במלואה) — אזהרה מפורשת, כי מחיקת
    // ההכנסה אינה מחזירה קיזוזים שכבר בוצעו. אם היתרה כבר נמחקה — ממשיכים
    // למחיקת ההכנסה בלבד.
    if (r.source === "voucher") {
      const credit = credits.find((c) => c.incomeId === r.id);
      if (!credit) return {};
      const amount = Number(credit.amount) || 0;
      const remaining = Number(credit.remaining) || 0;
      const usedSome = remaining < amount;
      const question = usedSome
        ? `השובר כבר נוצל חלקית או במלואו (נותרו ${formatILS(remaining)} מתוך ${formatILS(amount)}). האם למחוק את היתרה מחשבון ${credit.clientName} בכל זאת? תשלומים שכבר קוזזו ממנה יישארו בהיסטוריה.`
        : `האם למחוק גם את יתרת השובר (${formatILS(amount)}) מחשבון ${credit.clientName}?`;
      const alsoDeleteCredit = await confirmDialog({
        title: "מחיקת יתרת שובר משויכת",
        message: question,
        confirmLabel: "מחיקה",
        danger: true,
      });
      return { deleteCredit: alsoDeleteCredit ? credit : null };
    }

    return {};
  }

  // שלב נוסף לכל סוג הכנסה: אם ההכנסה שולמה (גם חלקית) מיתרת זיכוי, נשאלת
  // השאלה אם להחזיר את הסכום ליתרה (בדפוס של "החזרה למלאי" במכירת מוצר).
  // הפירוט נשמר על ההכנסה ב-creditApplications; הכנסות ישנות (לפני התוספת)
  // אינן כוללות אותו — במקרה כזה אין החזרה אוטומטית (ניתן לתקן ידנית בכרטיס
  // יתרת הזיכוי של הלקוחה).
  async function planLinkedRecords(r) {
    const plan = await planSourceRecords(r);
    const apps = Array.isArray(r.creditApplications) ? r.creditApplications : [];
    if (apps.length > 0) {
      const total = round2(apps.reduce((s, a) => s + (Number(a.amount) || 0), 0));
      const alsoRestore = await confirmDialog({
        title: "החזרת יתרת זיכוי",
        message: `ההכנסה שולמה (גם) מיתרת זיכוי בסך ${formatILS(total)}. האם להחזיר את הסכום ליתרה של הלקוחה?`,
        confirmLabel: "החזרה ליתרה",
      });
      if (alsoRestore) plan.restoreCredits = apps;
    }
    return plan;
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
    if (plan.restockProduct) {
      const { id: productId, qty, currentStock } = plan.restockProduct;
      try {
        await productRepo.update(productId, { stock: currentStock + qty });
      } catch {
        /* עדכון המלאי נכשל — ההכנסה עדיין תימחק; ניתן לתקן ידנית במסך המוצרים */
      }
    }
    if (plan.restoreCredits) {
      for (const app of plan.restoreCredits) {
        // יתרה שנמחקה בינתיים — מדלגים בלי שגיאה.
        const credit = credits.find((c) => c.id === app.creditId);
        if (!credit) continue;
        const restoredTo = Math.min(
          round2(credit.amount),
          round2(round2(credit.remaining) + round2(app.amount))
        );
        try {
          await creditRepo.update(credit.id, { remaining: restoredTo, status: "active" });
          await log({
            action: "credit_restore",
            entity: {
              type: "credit",
              id: credit.id,
              desc: `${credit.clientName} — החזרה ממחיקת ${r.treatmentName || "הכנסה"}`,
            },
            before: { remaining: credit.remaining },
            after: { remaining: restoredTo },
          });
        } catch {
          /* ההחזרה נכשלה — ההכנסה עדיין תימחק; ניתן לתקן ידנית בכרטיס יתרת הזיכוי */
        }
      }
    }
    if (plan.deleteCredit) {
      const credit = plan.deleteCredit;
      try {
        await creditRepo.remove(credit.id);
        await log({
          action: "credit_delete",
          entity: { type: "credit", id: credit.id, desc: `${credit.clientName} — שובר מתנה` },
          before: { amount: credit.amount, remaining: credit.remaining },
        });
      } catch {
        /* מחיקת היתרה נכשלה — ההכנסה עדיין תימחק; ניתן למחוק את היתרה ידנית בכרטיסיית הלקוחה */
      }
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

    // שאלות על רשומות מקושרות (תור/חבילה/מלאי/שובר) נשאלות מיד — הן דורשות
    // החלטה מהמשתמשת ולא ניתן לדחות אותן ל-5 השניות של ה-Undo.
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

  // סיכום לפי הסינון + קיבוץ חודשי (כשהמיון לפי תאריך).
  const listTotals = list.reduce(
    (s, r) => {
      const p = incomeVat(r, years);
      return { gross: s.gross + p.gross, net: s.net + p.net, vat: s.vat + p.vat };
    },
    { gross: 0, net: 0, vat: 0 }
  );
  const incomeGroups = sortBy === "date" ? monthGroups(list, (r) => Number(r.amount) || 0) : [];

  function renderRow(r) {
    const vp = incomeVat(r, years);
    const srcLabel = SOURCE_LABELS[r.source];
    return (
      <div key={r.id} className="card fin-item">
        <div className="fin-item__main">
          <div className="fin-item__top">
            <strong className="sensitive">{formatILS(r.amount)}</strong>
            <span className={"badge " + (r.paid ? "badge--ok" : "badge--warn")}>
              {r.paid ? "שולם" : "לא שולם"}
            </span>
            <ReceiptBadge value={r} />
            {srcLabel &&
              (r.clientId ? (
                <button
                  type="button"
                  className="badge badge--info badge--btn"
                  onClick={() =>
                    navigate(`/clients/${r.clientId}`, {
                      state: { tab: r.source === "product" ? "products" : "appointments" },
                    })
                  }
                >
                  {srcLabel} ‹
                </button>
              ) : (
                <span className="badge badge--info">{srcLabel}</span>
              ))}
            {Number(r.creditApplied) > 0 && (
              <span className="badge badge--info sensitive">
                קוזז מיתרה {formatILS(r.creditApplied)}
              </span>
            )}
          </div>
          <span className="muted">
            {formatDate(r.date)} · {r.treatmentName || r.note || "הכנסה"}
            {r.clientName ? ` · ${r.clientName}` : ""}
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            {r.paymentMethod || "—"}
            {r.invoiceNumber ? ` · חשבונית ${r.invoiceNumber}` : " · ללא חשבונית"}
          </span>
          <span className="muted sensitive" style={{ fontSize: 12 }}>
            נטו {formatMoney2(vp.net)} · מע"מ {formatMoney2(vp.vat)} ({vp.rate}%)
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
    );
  }

  return (
    <>
      <YearScopeNav year={year} setYear={setYear} allYears={allYears} setAllYears={setAllYears} />

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
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">כל המקורות</option>
            <option value="appointment">מתור</option>
            <option value="series">מסדרה</option>
            <option value="product">ממוצר</option>
            <option value="voucher">משובר</option>
            <option value="manual">ידנית</option>
          </select>
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
        <>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
            {list.length} רשומות ·{" "}
            <span className="sensitive">
              {formatILS(listTotals.gross)} · נטו {formatMoney2(listTotals.net)} · מע"מ{" "}
              {formatMoney2(listTotals.vat)}
            </span>
          </p>
          {(sortBy === "date" ? incomeGroups : [{ key: "all", label: null, items: list, total: 0 }]).map(
            (g) => (
              <div key={g.key}>
                {g.label && (
                  <h3 className="group-title">
                    {g.label} · <span className="sensitive">{formatILS(g.total)}</span> ({g.items.length})
                  </h3>
                )}
                <div className="list">{g.items.map(renderRow)}</div>
              </div>
            )
          )}
        </>
      )}
      <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}>
        הכנסה שסומנה "שולם" אינה ניתנת למחיקה עד להסרת הסימון.
      </p>
    </>
  );
}

/* ---------- הוצאות ---------- */
// restore: ראו הערה ב-IncomeTab.
function ExpenseTab({ initialReceipt: initialReceiptProp = "", initial: initialProp = {}, restore = false }) {
  const [saved] = useState(() => (restore ? readSavedFilters("expense") : null));
  const initial = saved ? { ...initialProp, ...saved } : initialProp;
  const initialReceipt = saved ? saved.receipt ?? "" : initialReceiptProp;

  const { enabled: clinicMode } = useClinicMode();
  const navigate = useNavigate();
  const repo = useRepo("expenses");
  const { years } = useVatSettings();
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  // קטגוריות כולל ברירות מחדל גם אם הרשימה לא נשמרה מעולם בהגדרות.
  const { items: categories } = useExpenseCategories();
  const [q, setQ] = useState(initial.q || "");
  const [category, setCategory] = useState(initial.category || "");
  const [from, setFrom] = useState(initial.from || "");
  const [to, setTo] = useState(initial.to || "");
  const [receipt, setReceipt] = useState(initialReceipt); // "" | with | without
  const [sortBy, setSortBy] = useState(initial.sortBy ?? "date");
  // Phase 4 §9 (המשך) — ראו הערה מקבילה ב-IncomeTab. אין כאן deep-link
  // "unpaid" מקביל (הוצאות אינן נזקקות לאימות תשלום), ולכן אין חריג כמו
  // ב-IncomeTab — ברירת המחדל היא תמיד השנה הנוכחית.
  const [year, setYear] = useState(initial.year || CURRENT_YEAR);
  const [allYears, setAllYears] = useState(initial.allYears ?? false);
  const { items: expenses, loading } = useYearRangeCollectionData(
    "expenses",
    "date",
    allYears ? null : year
  );
  // הוצאות שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  // שמירת הסינונים לשחזור בחזרה ממסך עריכה (sessionStorage).
  useEffect(() => {
    writeSavedFilters("expense", { q, category, from, to, receipt, sortBy, year, allYears });
  }, [q, category, from, to, receipt, sortBy, year, allYears]);

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

  // סיכום לפי הסינון + קיבוץ חודשי (כשהמיון לפי תאריך).
  const listTotals = list.reduce(
    (s, r) => {
      const p = expenseVat(r, years);
      return { gross: s.gross + p.gross, net: s.net + p.net, vat: s.vat + p.vat };
    },
    { gross: 0, net: 0, vat: 0 }
  );
  const expenseGroups = sortBy === "date" ? monthGroups(list, (r) => Number(r.total) || 0) : [];

  function renderRow(r) {
    const vp = expenseVat(r, years);
    return (
      <div key={r.id} className="card fin-item">
        <div className="fin-item__main">
          <div className="fin-item__top">
            <strong className="sensitive">{formatILS(r.total)}</strong>
            {r.recurring && (
              <span className="badge badge--info">
                קבועה · {r.recurring === "yearly" ? "שנתי" : "חודשי"}
                {r.recurringEnd ? ` · עד ${formatDate(r.recurringEnd)}` : ""}
              </span>
            )}
            {r.recurring && recurringEnded(r) && <span className="badge badge--pending">הסתיימה</span>}
            {r.generatedFrom && <span className="badge badge--info">נוצרה אוטומטית</span>}
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
          <span className="muted sensitive" style={{ fontSize: 12 }}>
            נטו {formatMoney2(vp.net)} · מע"מ {formatMoney2(vp.vat)} ({vp.rate}%)
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
    );
  }

  return (
    <>
      <YearScopeNav year={year} setYear={setYear} allYears={allYears} setAllYears={setAllYears} />

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
        <>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
            {list.length} רשומות ·{" "}
            <span className="sensitive">
              {formatILS(listTotals.gross)} · נטו {formatMoney2(listTotals.net)} · מע"מ{" "}
              {formatMoney2(listTotals.vat)}
            </span>
          </p>
          {(sortBy === "date" ? expenseGroups : [{ key: "all", label: null, items: list, total: 0 }]).map(
            (g) => (
              <div key={g.key}>
                {g.label && (
                  <h3 className="group-title">
                    {g.label} · <span className="sensitive">{formatILS(g.total)}</span> ({g.items.length})
                  </h3>
                )}
                <div className="list">{g.items.map(renderRow)}</div>
              </div>
            )
          )}
        </>
      )}
    </>
  );
}
