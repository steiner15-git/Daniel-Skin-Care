import { formatILS } from "../../utils/money";

// גרף עמודות חודשי מוערם עם N מקטעים לכל עמודה — לשימוש בטאבי הסיכום
// המורחבים "לפי מוצר"/"לפי לקוחה" בלבד (addendum §3+4). BarChart.jsx הקיים
// (טאב "כללי", שני טורים קבועים הכנסה/הוצאה) נשאר ללא כל שינוי במכוון.
//
// months: [{ label, segments: [{ key, name, value, color }] }] — 12 איברים.
// legend: [{ key, name, color }].
// highlightKey: כשמוגדר (נשלט מלחיצה על שורה ברשימה החיצונית), מקטעים
//   שאינם תואמים מוצגים בשקיפות נמוכה; המקטע התואם מקבל תווית סכום מעליו.
// highlightMonthIndex: null (הצג תוויות בכל החודשים, מצב שנתי) או אינדקס
//   חודש בודד (מצב חודשי — תווית רק בעמודה הנבחרת).
export default function StackedBarChart({ months, legend, highlightKey, highlightMonthIndex }) {
  const max = Math.max(1, ...months.map((m) => m.segments.reduce((s, seg) => s + seg.value, 0)));

  return (
    <div className="stackchart">
      {legend.length > 0 && (
        <div className="stackchart__legend">
          {legend.map((l) => (
            <span
              key={l.key}
              className={"stackchart__legend-item" + (legend.length > 8 ? " sm" : "")}
            >
              <i className="dot" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="stackchart__plot">
        {months.map((m, i) => {
          const showLabelsHere = highlightMonthIndex == null || highlightMonthIndex === i;
          return (
            <div key={i} className="stackchart__col">
              <div className="stackchart__bar">
                {m.segments.map((seg, si) => {
                  if (seg.value <= 0) return null;
                  const heightPct = (seg.value / max) * 100;
                  const isHighlighted = highlightKey && seg.key === highlightKey;
                  const dimmed = highlightKey && !isHighlighted;
                  return (
                    <div
                      key={si}
                      className={"stackchart__seg" + (dimmed ? " dimmed" : "")}
                      style={{ height: `${heightPct}%`, background: seg.color }}
                      title={`${seg.name}: ${formatILS(seg.value)}`}
                    >
                      {isHighlighted && showLabelsHere && (
                        <span className="stackchart__seg-label">{formatILS(seg.value)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="stackchart__col-label">{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
