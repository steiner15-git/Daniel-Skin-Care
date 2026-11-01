import { useMemo, useState } from "react";
import YearMonthNav from "../../components/YearMonthNav";
import StackedBarChart from "./StackedBarChart";
import { useCollectionData } from "../../data";
import { useVatSettings } from "../../data/useVatSettings";
import { useClinicMode } from "../../context/ClinicModeProvider";
import { formatILS, HEB_MONTHS } from "../../utils/money";
import { incomeRevenue } from "../../utils/vat";
import { round2 } from "../../utils/credits";
import { realizedSeriesValue, packageSessionValue } from "../../utils/seriesRealization";
import { periodRange, inRange as inRangeStr } from "../../utils/period";
import { categorizeIncome, summarizeByType, packageAttributedByTreatment } from "../../utils/incomeCategorize";
import { colorForIndex, lightVariant } from "../../utils/chartColors";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();

const MODES = [
  { key: "treatment", label: "טיפולים" },
  { key: "series", label: "סדרות" },
  { key: "product", label: "מוצרים" },
];

export default function SummaryByProduct({ onDrill }) {
  const { enabled: clinicMode } = useClinicMode();
  const { items: rawIncome } = useCollectionData("income");
  const { items: appts } = useCollectionData("appointments");
  const { items: packages } = useCollectionData("clientPackages");
  const { years: vatYears } = useVatSettings();

  // מע"מ: בשנת מורשה הסיכום מציג נטו, בשנת פטור סכום כולל — אותה התאמה בדיוק
  // כמו בטאב "כללי" (utils/vat.js). ממפים כאן פעם אחת את amount, וכל החישובים
  // והגרפים שמתחת (כולל incomeById והאומדן מחבילות) ממשיכים כרגיל מעליו.
  const income = useMemo(
    () => rawIncome.map((r) => ({ ...r, amount: incomeRevenue(r, vatYears) })),
    [rawIncome, vatYears]
  );

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

  // בסיס התצוגה: תקבולים (ברירת מחדל, הבסיס הרשמי) או מימוש. בבסיס מימוש רכישת
  // סדרה לא נספרת בחודש הרכישה; במקומה נספר שווי המפגש בחודש שבו נוצל (תור שחויב
  // מחבילה), בטיפול של התור (מצב טיפולים) או בשם הסדרה (מצב סדרות). תצוגה ניהולית
  // בלבד — ההכנסה הרשמית והמע"מ נשארים לפי תקבולים (ראו גשר ההתאמה).
  const [basis, setBasis] = useState("receipts"); // receipts | realization
  const effectiveIncome = useMemo(() => {
    if (basis !== "realization" || mode === "product") return income;
    const pkgById = new Map(packages.map((p) => [p.id, p]));
    const synth = [];
    for (const a of appts) {
      if (a.status !== "done" || !a.chargedFromPackage || !a.clientPackageId) continue;
      const pkg = pkgById.get(a.clientPackageId);
      if (!pkg) continue;
      const value = packageSessionValue(pkg, incomeById);
      if (!value) continue;
      synth.push({
        id: "real-" + a.id,
        date: String(a.start).slice(0, 10),
        amount: value,
        source: mode === "series" ? "series" : "appointment",
        treatmentName: mode === "series" ? pkg.seriesName || "סדרה" : a.treatmentName || "טיפול",
      });
    }
    return [...income.filter((r) => r.source !== "series"), ...synth];
  }, [basis, mode, income, appts, packages, incomeById]);

  const inYear = useMemo(
    () => effectiveIncome.filter((r) => new Date(r.date).getFullYear() === year),
    [effectiveIncome, year]
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
      if (mode === "treatment" && basis === "receipts") {
        const monthAppts = appts.filter(
          (a) => new Date(a.start).getFullYear() === year && new Date(a.start).getMonth() === m
        );
        pkgMap = packageAttributedByTreatment(monthAppts, packages, incomeById);
      }

      const segments = [];
      names.forEach((name, i) => {
        segments.push({ key: name, name, value: byName.get(name) || 0, color: colorByName.get(name) });
        if (mode === "treatment" && basis === "receipts") {
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
  }, [ranked, inYear, mode, basis, colorByName, appts, packages, incomeById, year]);

  // גשר תקבולים ↔ מימוש (מצב "סדרות" בלבד): תקבולי סדרות בתקופה פחות שווי
  // המפגשים שמומשו בתקופה = שינוי בהתחייבות הפתוחה. שכבה ניהולית — אינה
  // משנה את סכומי ההכנסות (ראו utils/seriesRealization.js).
  const bridge = useMemo(() => {
    if (mode !== "series") return null;
    const range = periodRange(year, month, viewMode);
    const receipts = income
      .filter((r) => r.source === "series" && inRangeStr(r.date, range))
      .reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const realized = realizedSeriesValue(appts, packages, incomeById, (start) =>
      inRangeStr(start, range)
    );
    return { receipts: round2(receipts), realized, change: round2(receipts - realized) };
  }, [mode, income, appts, packages, incomeById, year, month, viewMode]);

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

      {mode !== "product" && (
        <>
          <div className="seg" style={{ marginBottom: 8 }}>
            <button
              className={"seg__btn" + (basis === "receipts" ? " on" : "")}
              onClick={() => setBasis("receipts")}
            >
              בסיס תקבולים
            </button>
            <button
              className={"seg__btn" + (basis === "realization" ? " on" : "")}
              onClick={() => setBasis("realization")}
            >
              בסיס מימוש
            </button>
          </div>
          {basis === "realization" && (
            <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
              תצוגה ניהולית: רכישות סדרות נספרות לפי שווי המפגשים שנוצלו בכל חודש. ההכנסה
              הרשמית, הרווח והמע"מ נשארים לפי תקבולים; ההפרש מוסבר בגשר שבמצב "סדרות".
            </p>
          )}
        </>
      )}

      <div className="stat stat--income" style={{ marginBottom: 16 }}>
        <span className="muted">סה"כ הכנסה · {MODES.find((m) => m.key === mode).label}</span>
        <strong>{formatILS(total)}</strong>
      </div>

      {bridge && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>גשר תקבולים ↔ מימוש (סדרות)</h3>
          <div className="read-row">
            <span className="muted">תקבולי סדרות בתקופה</span>
            <span className="sensitive">{formatILS(bridge.receipts)}</span>
          </div>
          <div className="read-row">
            <span className="muted">פחות: שווי מפגשים שמומשו בתקופה</span>
            <span className="sensitive">{formatILS(bridge.realized)}</span>
          </div>
          <div className="read-row">
            <strong>שינוי בהתחייבות הפתוחה</strong>
            <strong className="sensitive">{formatILS(bridge.change)}</strong>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
            ההכנסה הרשמית נשארת לפי תקבולים. מפגשים שהופחתו ידנית בעריכת החבילה, והחלק ששולם
            מיתרה, אינם נכללים במימוש.
          </p>
        </div>
      )}

      {ranked.length === 0 ? (
        <div className="empty-state">אין הכנסות בקטגוריה זו בטווח הנבחר.</div>
      ) : (
        <>
          <div className="list">
            {ranked.map((x) => (
              <div
                key={x.name}
                className={"card list-item as-button" + (selected === x.name ? " ranked-row--on" : "")}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(selected === x.name ? null : x.name)}
                onKeyDown={(e) => e.key === "Enter" && setSelected(selected === x.name ? null : x.name)}
              >
                <div className="list-item__main">
                  <strong>
                    <i className="dot" style={{ background: colorByName.get(x.name) }} /> {x.name}
                  </strong>
                  <span className="muted">{total > 0 ? Math.round((x.amount / total) * 100) : 0}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong>{formatILS(x.amount)}</strong>
                  {onDrill && basis === "receipts" && (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDrill({
                          tab: "income",
                          year,
                          ...periodRange(year, month, viewMode),
                          q: x.name,
                        });
                      }}
                    >
                      הכנסות ‹
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
