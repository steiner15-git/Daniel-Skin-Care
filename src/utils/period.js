import { HEB_MONTHS } from "./money";

// עזרי טווחי זמן לסיכומים ול-drill-down: טווח הוא { from, to } כמחרוזות
// "YYYY-MM-DD" (כולל), מתאים להשוואת מחרוזות מול income.date / expenses.date.
// month הוא אינדקס 0-11 (כמו Date.getMonth).

const pad = (n) => String(n).padStart(2, "0");

export function periodRange(year, month, mode) {
  if (mode === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(year, month + 1, 0).getDate();
  return { from: `${year}-${pad(month + 1)}-01`, to: `${year}-${pad(month + 1)}-${pad(last)}` };
}

// התקופה הקודמת: בחודשי — החודש הקודם; בשנתי — השנה הקודמת.
export function previousPeriod(year, month, mode) {
  if (mode === "year") {
    return { ...periodRange(year - 1, 0, "year"), label: String(year - 1) };
  }
  const y = month === 0 ? year - 1 : year;
  const m = month === 0 ? 11 : month - 1;
  return { ...periodRange(y, m, "month"), label: `${HEB_MONTHS[m]} ${y}` };
}

// אותו חודש אשתקד (למצב חודשי).
export function lastYearPeriod(year, month) {
  return { ...periodRange(year - 1, month, "month"), label: `${HEB_MONTHS[month]} ${year - 1}` };
}

export function inRange(dateStr, range) {
  const d = String(dateStr || "").slice(0, 10);
  return !!d && d >= range.from && d <= range.to;
}
