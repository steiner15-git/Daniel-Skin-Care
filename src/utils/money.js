export function formatILS(n) {
  const num = Number(n) || 0;
  return "₪" + num.toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

export function monthKey(dateStr) {
  // dateStr: "YYYY-MM-DD" → 0-11
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export const HEB_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
