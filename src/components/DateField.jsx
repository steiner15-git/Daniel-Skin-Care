import { useEffect, useState } from "react";
import { HEB_MONTHS } from "../utils/money";

// שדה תאריך עם יום/חודש/שנה בנפרד (שלושה תפריטים) — במקום input[type=date]
// שתלוי בלוקאל הדפדפן ומציג mm/dd/yyyy. קורא/כותב פורמט "YYYY-MM-DD".
function pad(n) {
  return String(n).padStart(2, "0");
}
function split(v) {
  const [y = "", m = "", d = ""] = (v || "").split("-");
  return { y, m, d };
}

export default function DateField({ value = "", onChange, fromYear, toYear }) {
  const [parts, setParts] = useState(() => split(value));

  // מסנכרן מערך חיצוני רק כשהוא תאריך מלא (כדי לא לאבד בחירה חלקית באמצע הזנה)
  useEffect(() => {
    const s = split(value);
    if (s.y && s.m && s.d) setParts(s);
    else if (!value) setParts({ y: "", m: "", d: "" });
  }, [value]);

  const now = new Date().getFullYear();
  const maxY = toYear ?? now;
  const minY = fromYear ?? now - 100;
  const years = [];
  for (let i = maxY; i >= minY; i--) years.push(String(i));
  const months = Array.from({ length: 12 }, (_, i) => pad(i + 1));
  const days = Array.from({ length: 31 }, (_, i) => pad(i + 1));

  function update(next) {
    setParts(next);
    if (next.y && next.m && next.d) onChange(`${next.y}-${next.m}-${next.d}`);
    else onChange("");
  }

  return (
    <div className="date-field">
      <select
        value={parts.d}
        onChange={(e) => update({ ...parts, d: e.target.value })}
        aria-label="יום"
      >
        <option value="">יום</option>
        {days.map((x) => (
          <option key={x} value={x}>
            {Number(x)}
          </option>
        ))}
      </select>
      <select
        value={parts.m}
        onChange={(e) => update({ ...parts, m: e.target.value })}
        aria-label="חודש"
      >
        <option value="">חודש</option>
        {months.map((x, i) => (
          <option key={x} value={x}>
            {HEB_MONTHS[i]}
          </option>
        ))}
      </select>
      <select
        value={parts.y}
        onChange={(e) => update({ ...parts, y: e.target.value })}
        aria-label="שנה"
      >
        <option value="">שנה</option>
        {years.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}
