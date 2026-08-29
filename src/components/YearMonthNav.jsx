import { HEB_MONTHS } from "../utils/money";

// בורר שנה + מצב חודשי/שנתי — משותף לתתי-הטאבים החדשים "לפי מוצר"/"לפי
// לקוחה" בניהול עסק (addendum §3+4). טאב "כללי" הקיים אינו משתמש ברכיב
// זה במכוון — הוא נשאר בדיוק כפי שהיה, ללא כל שינוי, לפי דרישת ה-addendum.
export default function YearMonthNav({ year, setYear, mode, setMode, month, setMonth }) {
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
              <option key={i} value={i}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
