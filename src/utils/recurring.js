import { dateInputValue } from "./datetime";

// הוצאה קבועה (חודשית/שנתית) — חישובי תקופות טהורים, משותפים ל-
// useRecurringExpenses (יצירת הרשומות) ול-ExpenseForm (חישוב תאריך סיום).
//
// סיום: על התבנית נשמר recurringEnd (תאריך "YYYY-MM-DD" של החיוב האחרון, כולל),
// או null = ללא סיום. "מספר חיובים" בטופס מומר לתאריך סיום בעת השמירה
// (endDateForCount), כך ששדה אחד בלבד קובע ואין צורך לספור רשומות שנוצרו.

export function nextPeriod(dateStr, kind) {
  const d = new Date(dateStr);
  if (kind === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

// תאריכי החיוב שחלפו ועדיין לא נרשמו, עד היום ועד תאריך הסיום (אם קיים).
export function pendingDates(template, today) {
  const anchor = template.lastPosted || template.date;
  if (!anchor) return [];
  const end = template.recurringEnd || null;
  const dates = [];
  let cursor = anchor;
  while (true) {
    const next = nextPeriod(cursor, template.recurring);
    if (next > today) break;
    const key = dateInputValue(next);
    if (end && key > end) break;
    dates.push(key);
    cursor = key;
  }
  return dates;
}

// תאריך החיוב האחרון כש-count הוא מספר החיובים הכולל (כולל החיוב הראשון,
// שהוא תאריך התבנית עצמה). למשל חודשי למשך שנה = 12.
export function endDateForCount(startDate, kind, count) {
  const n = Math.floor(Number(count));
  if (!startDate || !(n >= 1)) return null;
  let cursor = startDate;
  for (let i = 1; i < n; i++) cursor = dateInputValue(nextPeriod(cursor, kind));
  return cursor;
}

// האם התבנית כבר סיימה את כל החיובים שלה (תאריך הסיום עבר ולא נותר חיוב).
export function recurringEnded(template, today = new Date()) {
  if (!template.recurringEnd) return false;
  return template.recurringEnd < dateInputValue(today) && pendingDates(template, today).length === 0;
}
