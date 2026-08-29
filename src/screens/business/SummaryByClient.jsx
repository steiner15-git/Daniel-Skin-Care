import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import YearMonthNav from "../../components/YearMonthNav";
import StackedBarChart from "./StackedBarChart";
import { useCollectionData } from "../../data";
import { useClinicMode } from "../../context/ClinicModeProvider";
import { formatILS, HEB_MONTHS } from "../../utils/money";
import { summarizeByClient } from "../../utils/incomeCategorize";
import { colorForIndex } from "../../utils/chartColors";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();
const OTHERS_COLOR = "#b8b0a3";
const TOP_N = 10;

export default function SummaryByClient() {
  const { enabled: clinicMode } = useClinicMode();
  const navigate = useNavigate();
  const { items: income } = useCollectionData("income");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [viewMode, setViewMode] = useState("month");
  const [selected, setSelected] = useState(null);

  const inYear = useMemo(
    () => income.filter((r) => new Date(r.date).getFullYear() === year),
    [income, year]
  );
  const scopedIncome = useMemo(
    () => (viewMode === "year" ? inYear : inYear.filter((r) => new Date(r.date).getMonth() === month)),
    [inYear, viewMode, month]
  );

  // רשימה מדורגת — מציגה רק לקוחות עם הכנסה בפועל בטווח (כולל "ללא שיוך"
  // אם קיימת הכנסה כזו), לפי דרישת ה-addendum.
  const ranked = useMemo(() => summarizeByClient(scopedIncome), [scopedIncome]);
  const total = useMemo(() => ranked.reduce((s, x) => s + x.amount, 0), [ranked]);

  // צבע דטרמיניסטי לפי מיקום — רק ל-10 המובילות (הן היחידות המיוצגות
  // בנפרד בגרף; שאר הלקוחות מאוחדות תחת "אחרות").
  const colorByKey = useMemo(() => {
    const map = new Map();
    ranked.slice(0, TOP_N).forEach((x, i) => map.set(x.key, colorForIndex(i)));
    return map;
  }, [ranked]);

  // בגרף בלבד: 10 הלקוחות המובילות (בטווח השנה כולה, לעקביות בין החודשים)
  // + מקטע "אחרות" מאוחד. הרשימה המדורגת למעלה ממשיכה להציג את כולן.
  const topKeys = useMemo(() => {
    const yearRanked = summarizeByClient(inYear);
    return yearRanked.slice(0, TOP_N).map((x) => x.key);
  }, [inYear]);

  const monthlyChart = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const monthIncome = inYear.filter((r) => new Date(r.date).getMonth() === m);
      const bucket = summarizeByClient(monthIncome);
      const byKey = new Map(bucket.map((x) => [x.key, x]));

      const segments = topKeys.map((key) => {
        const entry = byKey.get(key);
        return {
          key,
          name: entry?.clientName || ranked.find((x) => x.key === key)?.clientName || "—",
          value: entry?.amount || 0,
          color: colorByKey.get(key),
        };
      });
      const othersTotal = bucket.reduce((s, x) => (topKeys.includes(x.key) ? s : s + x.amount), 0);
      segments.push({ key: "__others__", name: "אחרות", value: othersTotal, color: OTHERS_COLOR });

      return { label: HEB_MONTHS[m].slice(0, 3), segments };
    });
  }, [inYear, topKeys, colorByKey, ranked]);

  const legend = [
    ...topKeys.map((key) => ({
      key,
      name: ranked.find((x) => x.key === key)?.clientName || "—",
      color: colorByKey.get(key),
    })),
    { key: "__others__", name: "אחרות", color: OTHERS_COLOR },
  ];

  if (clinicMode) {
    return (
      <div className="clinic-summary-hidden">
        מצב קליניקה פעיל — כבי אותו (אייקון העין למעלה) כדי לראות סיכום כספי.
      </div>
    );
  }

  return (
    <>
      <YearMonthNav year={year} setYear={setYear} mode={viewMode} setMode={setViewMode} month={month} setMonth={setMonth} />

      <div className="stat stat--income" style={{ marginBottom: 16 }}>
        <span className="muted">סה"כ הכנסה · לפי לקוחה</span>
        <strong>{formatILS(total)}</strong>
      </div>

      {ranked.length === 0 ? (
        <div className="empty-state">אין הכנסות בטווח הנבחר.</div>
      ) : (
        <>
          <div className="list">
            {ranked.map((x) => (
              <div
                key={x.key}
                className={"card list-item" + (selected === x.key ? " ranked-row--on" : "")}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(selected === x.key ? null : x.key)}
                onKeyDown={(e) => e.key === "Enter" && setSelected(selected === x.key ? null : x.key)}
              >
                <div className="list-item__main">
                  <strong>
                    <i className="dot" style={{ background: colorByKey.get(x.key) || OTHERS_COLOR }} />{" "}
                    {x.clientName}
                  </strong>
                  <span className="muted">{total > 0 ? Math.round((x.amount / total) * 100) : 0}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{formatILS(x.amount)}</strong>
                  {x.clientId && (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/clients/${x.clientId}`);
                      }}
                    >
                      לכרטיסייה ‹
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <StackedBarChart
              months={monthlyChart}
              legend={legend}
              highlightKey={selected}
              highlightMonthIndex={viewMode === "month" ? month : null}
            />
          </div>
        </>
      )}
    </>
  );
}
