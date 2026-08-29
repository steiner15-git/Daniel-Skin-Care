import { useMemo, useState } from "react";
import YearMonthNav from "../../components/YearMonthNav";
import StackedBarChart from "./StackedBarChart";
import { useCollectionData } from "../../data";
import { useClinicMode } from "../../context/ClinicModeProvider";
import { formatILS, HEB_MONTHS } from "../../utils/money";
import { categorizeIncome, summarizeByType, packageAttributedByTreatment } from "../../utils/incomeCategorize";
import { colorForIndex, lightVariant } from "../../utils/chartColors";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

const MODES = [
  { key: "treatment", label: "טיפולים" },
  { key: "series", label: "סדרות" },
  { key: "product", label: "מוצרים" },
];

export default function SummaryByProduct() {
  const { enabled: clinicMode } = useClinicMode();
  const { items: income } = useCollectionData("income");
  const { items: appts } = useCollectionData("appointments");
  const { items: packages } = useCollectionData("clientPackages");

  const [mode, setMode] = useState("treatment");
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [viewMode, setViewMode] = useState("month");
  const [selected, setSelected] = useState(null);

  const incomeById = useMemo(() => {
    const map = {};
    for (const r of income) map[r.id] = r;
    return map;
  }, [income]);

  const inYear = useMemo(
    () => income.filter((r) => new Date(r.date).getFullYear() === year),
    [income, year]
  );

  const scopedIncome = useMemo(
    () => (viewMode === "year" ? inYear : inYear.filter((r) => new Date(r.date).getMonth() === month)),
    [inYear, viewMode, month]
  );

  const ranked = useMemo(() => summarizeByType(scopedIncome, mode), [scopedIncome, mode]);
  const total = useMemo(() => ranked.reduce((s, x) => s + x.amount, 0), [ranked]);

  const otherTotal = useMemo(
    () =>
      scopedIncome
        .filter((r) => categorizeIncome(r).type === "other")
        .reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [scopedIncome]
  );

  // צבע דטרמיניסטי לפי מיקום ברשימה המדורגת — עקבי בין הרשימה, הגרף וה-legend.
  const colorByName = useMemo(() => {
    const map = new Map();
    ranked.forEach((x, i) => map.set(x.name, colorForIndex(i)));
    return map;
  }, [ranked]);

  // 12 עמודות חודשיות — תמיד כל השנה (כמו בטאב הכללי), עם highlight על
  // החודש הנבחר במצב חודשי.
  const monthlyChart = useMemo(() => {
    const names = ranked.map((x) => x.name);
    return Array.from({ length: 12 }, (_, m) => {
      const monthIncome = inYear.filter((r) => new Date(r.date).getMonth() === m);
      const bucket = summarizeByType(monthIncome, mode);
      const byName = new Map(bucket.map((x) => [x.name, x.amount]));

      let pkgMap = new Map();
      if (mode === "treatment") {
        const monthAppts = appts.filter(
          (a) => new Date(a.start).getFullYear() === year && new Date(a.start).getMonth() === m
        );
        pkgMap = packageAttributedByTreatment(monthAppts, packages, incomeById);
      }

      const segments = [];
      names.forEach((name, i) => {
        segments.push({ key: name, name, value: byName.get(name) || 0, color: colorByName.get(name) });
        if (mode === "treatment") {
          segments.push({
            key: name,
            name: `${name} · מחבילה (משוער)`,
            value: pkgMap.get(name) || 0,
            color: lightVariant(i),
          });
        }
      });
      return { label: HEB_MONTHS[m].slice(0, 3), segments };
    });
  }, [ranked, inYear, mode, colorByName, appts, packages, incomeById, year]);

  const legend = ranked.map((x) => ({ key: x.name, name: x.name, color: colorByName.get(x.name) }));

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

      <div className="seg" style={{ marginBottom: 14 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            className={"seg__btn" + (mode === m.key ? " on" : "")}
            onClick={() => {
              setMode(m.key);
              setSelected(null);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="stat stat--income" style={{ marginBottom: 16 }}>
        <span className="muted">סה"כ הכנסה · {MODES.find((m) => m.key === mode).label}</span>
        <strong>{formatILS(total)}</strong>
      </div>

      {ranked.length === 0 ? (
        <div className="empty-state">אין הכנסות בקטגוריה זו בטווח הנבחר.</div>
      ) : (
        <>
          <div className="list">
            {ranked.map((x) => (
              <button
                key={x.name}
                className={"card list-item as-button" + (selected === x.name ? " ranked-row--on" : "")}
                onClick={() => setSelected(selected === x.name ? null : x.name)}
              >
                <div className="list-item__main">
                  <strong>
                    <i className="dot" style={{ background: colorByName.get(x.name) }} /> {x.name}
                  </strong>
                  <span className="muted">{total > 0 ? Math.round((x.amount / total) * 100) : 0}%</span>
                </div>
                <strong>{formatILS(x.amount)}</strong>
              </button>
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

      {otherTotal > 0 && (
        <details className="card" style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer" }}>
            הכנסות אחרות (ללא שיוך) · {formatILS(otherTotal)}
          </summary>
          <p className="muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
            הכנסות ידניות שלא שויכו לטיפול, סדרה או מוצר ספציפיים.
          </p>
        </details>
      )}
    </>
  );
}
