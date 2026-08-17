import { formatILS } from "../utils/money";

// גרף עמודות חודשי פשוט (ללא ספריית צד-שלישי). data: [{label, income, expense}]
export default function BarChart({ data, highlight = -1 }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));

  return (
    <div className="barchart">
      <div className="barchart__legend">
        <span><i className="dot dot--income" /> הכנסות</span>
        <span><i className="dot dot--expense" /> הוצאות</span>
      </div>
      <div className="barchart__plot">
        {data.map((d, i) => (
          <div
            key={i}
            className={"barchart__group" + (i === highlight ? " on" : "")}
            title={`${d.label}: הכנסות ${formatILS(d.income)} · הוצאות ${formatILS(d.expense)}`}
          >
            <div className="barchart__bars">
              <div
                className="bar bar--income"
                style={{ height: `${(d.income / max) * 100}%` }}
              />
              <div
                className="bar bar--expense"
                style={{ height: `${(d.expense / max) * 100}%` }}
              />
            </div>
            <span className="barchart__label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
