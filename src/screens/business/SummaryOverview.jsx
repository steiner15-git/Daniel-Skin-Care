import { useMemo, useState } from "react";
import YearMonthNav from "../../components/YearMonthNav";
import { useCollectionData } from "../../data";
import { useVatSettings } from "../../data/useVatSettings";
import { useClinicMode } from "../../context/ClinicModeProvider";
import { formatILS } from "../../utils/money";
import { round2 } from "../../utils/credits";
import { incomeRevenue, expenseCost } from "../../utils/vat";
import { periodRange, previousPeriod, lastYearPeriod, inRange } from "../../utils/period";
import { openSeriesLiability, seriesCompletionStats } from "../../utils/seriesRealization";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

const SOURCE_LABEL = {
  appointment: "תורים",
  series: "רכישות סדרות",
  product: "מוצרים",
  voucher: "שוברים",
  manual: "הכנסות ידניות",
};

const METRICS = [
  { key: "income", label: "הכנסות", goodUp: true },
  { key: "expense", label: "הוצאות", goodUp: false },
  { key: "profit", label: "רווח", goodUp: true },
];

// הכנסה/עלות לפי אותה התאמה כמו בסיכום הכללי: בשנת מורשה נטו, בשנת פטור סכום כולל.
function sumPeriod(income, expenses, years, range) {
  let inc = 0;
  let exp = 0;
  for (const r of income) if (inRange(r.date, range)) inc += incomeRevenue(r, years);
  for (const r of expenses) if (inRange(r.date, range)) exp += expenseCost(r, years);
  inc = round2(inc);
  exp = round2(exp);
  return { income: inc, expense: exp, profit: round2(inc - exp) };
}

// שינוי באחוזים מול בסיס השוואה; צבע לפי האם עלייה טובה (הכנסות/רווח) או רעה (הוצאות).
function delta(cur, base, goodUp) {
  if (base === 0) return cur === 0 ? { text: "—", color: "var(--text-muted)" } : { text: "חדש", color: "var(--text-muted)" };
  const pct = Math.round(((cur - base) / Math.abs(base)) * 100);
  if (pct === 0) return { text: "ללא שינוי", color: "var(--text-muted)" };
  const good = goodUp ? pct > 0 : pct < 0;
  return {
    text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`,
    color: good ? "var(--accent-2)" : "var(--danger)",
  };
}

// מבט על (addendum סבב 2, פריט 8): השוואה לתקופה קודמת ואשתקד, הכנסות לפי מקור,
// הוצאות לפי קטגוריה כאחוז מההכנסה, ותובנות על סדרות. שורות לחיצות מובילות
// לרשימה המסוננת (drill-down, פריט 9) דרך onDrill.
export default function SummaryOverview({ onDrill }) {
  const { enabled: clinicMode } = useClinicMode();
  const { years } = useVatSettings();
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");
  const { items: packages } = useCollectionData("clientPackages");
  const { items: appts } = useCollectionData("appointments");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [mode, setMode] = useState("month");

  const cur = periodRange(year, month, mode);
  const prev = previousPeriod(year, month, mode);
  const ly = mode === "month" ? lastYearPeriod(year, month) : null;

  const totals = useMemo(
    () => ({
      cur: sumPeriod(income, expenses, years, cur),
      prev: sumPeriod(income, expenses, years, prev),
      ly: ly ? sumPeriod(income, expenses, years, ly) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [income, expenses, years, cur.from, cur.to]
  );

  const bySource = useMemo(() => {
    const map = new Map();
    let total = 0;
    for (const r of income) {
      if (!inRange(r.date, cur)) continue;
      const key = r.source || "manual";
      const v = incomeRevenue(r, years);
      map.set(key, (map.get(key) || 0) + v);
      total += v;
    }
    const rows = [...map.entries()]
      .map(([key, amount]) => ({ key, amount: round2(amount) }))
      .filter((x) => x.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
    return { rows, total: round2(total) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, years, cur.from, cur.to]);

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const r of expenses) {
      if (!inRange(r.date, cur)) continue;
      const key = (r.category || "").trim();
      map.set(key, (map.get(key) || 0) + expenseCost(r, years));
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount: round2(amount) }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, years, cur.from, cur.to]);

  const series = useMemo(() => {
    const incomeById = {};
    for (const r of income) incomeById[r.id] = { amount: incomeRevenue(r, years) };
    return {
      stats: seriesCompletionStats(packages, appts),
      open: openSeriesLiability(packages, incomeById),
    };
  }, [income, years, packages, appts]);

  if (clinicMode) {
    return (
      <div className="clinic-summary-hidden">
        מצב קליניקה פעיל — כבי אותו (אייקון העין למעלה) כדי לראות סיכום כספי.
      </div>
    );
  }

  const incomeTotal = totals.cur.income;
  const drill = (extra) => onDrill && onDrill({ year, from: cur.from, to: cur.to, ...extra });

  return (
    <>
      <YearMonthNav
        year={year}
        setYear={setYear}
        mode={mode}
        setMode={setMode}
        month={month}
        setMonth={setMonth}
      />

      <h3 className="group-title">השוואה לתקופות קודמות</h3>
      <div className="card">
        {METRICS.map((m) => {
          const d1 = delta(totals.cur[m.key], totals.prev[m.key], m.goodUp);
          const d2 = totals.ly ? delta(totals.cur[m.key], totals.ly[m.key], m.goodUp) : null;
          return (
            <div key={m.key} className="read-row read-row--col">
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <span className="muted">{m.label}</span>
                <strong className="sensitive">{formatILS(totals.cur[m.key])}</strong>
              </div>
              <div
                className="muted"
                style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 13 }}
              >
                <span>
                  מול {prev.label}: <span className="sensitive">{formatILS(totals.prev[m.key])}</span>
                </span>
                <span style={{ color: d1.color }}>{d1.text}</span>
              </div>
              {d2 && (
                <div
                  className="muted"
                  style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 13 }}
                >
                  <span>
                    מול {ly.label}: <span className="sensitive">{formatILS(totals.ly[m.key])}</span>
                  </span>
                  <span style={{ color: d2.color }}>{d2.text}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="group-title">הכנסות לפי מקור</h3>
      {bySource.rows.length === 0 ? (
        <div className="empty-state" style={{ padding: 16 }}>אין הכנסות בתקופה.</div>
      ) : (
        <div className="list">
          {bySource.rows.map((x) => (
            <div
              key={x.key}
              className="card list-item"
              role={onDrill ? "button" : undefined}
              tabIndex={onDrill ? 0 : undefined}
              onClick={() => drill({ tab: "income", source: x.key })}
              onKeyDown={(e) => e.key === "Enter" && drill({ tab: "income", source: x.key })}
            >
              <div className="list-item__main">
                <strong>{SOURCE_LABEL[x.key] || x.key}</strong>
                <span className="muted">
                  {bySource.total > 0 ? Math.round((x.amount / bySource.total) * 100) : 0}% מההכנסות
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong className="sensitive">{formatILS(x.amount)}</strong>
                {onDrill && <span className="nav-card__chev">‹</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {bySource.rows.some((x) => x.key === "series") && (
        <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
          רכישות סדרות נספרות בחודש הרכישה (בסיס תקבולים). למימוש בפועל לפי מפגשים: סיכום לפי
          מוצר ← סדרות ← בסיס מימוש.
        </p>
      )}

      <h3 className="group-title">הוצאות לפי קטגוריה</h3>
      {byCategory.length === 0 ? (
        <div className="empty-state" style={{ padding: 16 }}>אין הוצאות בתקופה.</div>
      ) : (
        <div className="list">
          {byCategory.map((x) => {
            const canDrill = onDrill && x.name;
            return (
              <div
                key={x.name || "__none__"}
                className="card list-item"
                role={canDrill ? "button" : undefined}
                tabIndex={canDrill ? 0 : undefined}
                onClick={() => canDrill && drill({ tab: "expense", category: x.name })}
                onKeyDown={(e) =>
                  e.key === "Enter" && canDrill && drill({ tab: "expense", category: x.name })
                }
              >
                <div className="list-item__main">
                  <strong>{x.name || "ללא קטגוריה"}</strong>
                  <span className="muted">
                    {incomeTotal > 0
                      ? `${Math.round((x.amount / incomeTotal) * 100)}% מההכנסה`
                      : "אין הכנסה להשוואה"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong className="sensitive">{formatILS(x.amount)}</strong>
                  {canDrill && <span className="nav-card__chev">‹</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(series.stats.samples > 0 || series.open.expiredSessions > 0) && (
        <>
          <h3 className="group-title">תובנות על סדרות</h3>
          <div className="card">
            {series.stats.samples > 0 && (
              <>
                <div className="read-row">
                  <span className="muted">משך ממוצע למימוש סדרה</span>
                  <strong>{series.stats.avgDays} ימים</strong>
                </div>
                <div className="read-row">
                  <span className="muted">המהירה / האיטית ביותר</span>
                  <span>
                    {series.stats.minDays} / {series.stats.maxDays} ימים
                  </span>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                  מתוך {series.stats.samples} סדרות שנוצלו במלואן (ימים מהרכישה ועד המפגש האחרון).
                </p>
              </>
            )}
            {series.open.expiredSessions > 0 && (
              <div className="read-row">
                <span className="muted">פקעו ללא מימוש</span>
                <span>
                  {series.open.expiredSessions} מפגשים ·{" "}
                  <span className="sensitive">{formatILS(series.open.expiredValue)}</span>
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
