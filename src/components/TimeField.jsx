// שדה שעה 24-שעות מובטח (שני תפריטים) — במקום input[type=time] שתלוי בלוקאל הדפדפן
// ועלול להציג AM/PM.
function pad(n) {
  return String(n).padStart(2, "0");
}

export default function TimeField({ value = "09:00", onChange }) {
  const [h = "09", m = "00"] = (value || "").split(":");

  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const mins = [];
  for (let i = 0; i < 60; i += 5) mins.push(pad(i));
  if (!mins.includes(m)) mins.push(m); // שמירת ערך לא-עגול קיים
  mins.sort();

  function setH(nh) {
    onChange(`${nh}:${m}`);
  }
  function setM(nm) {
    onChange(`${h}:${nm}`);
  }

  return (
    <div className="time-field">
      <select value={h} onChange={(e) => setH(e.target.value)} aria-label="שעה">
        {hours.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="time-field__sep">:</span>
      <select value={m} onChange={(e) => setM(e.target.value)} aria-label="דקות">
        {mins.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}
