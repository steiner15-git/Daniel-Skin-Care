import { useEffect, useRef } from "react";
import { useCollectionData, useBatchRepo } from "./index";
import { dateInputValue } from "../utils/datetime";

// הוצאה קבועה (חודשית/שנתית) נרשמת אוטומטית בכל תקופה שחלפה.
// אין שרת רקע — הרישום מתבצע בעת טעינת האפליקציה: לכל תבנית קבועה נוצרות
// רשומות הוצאה רגילות עבור כל תקופה שעברה מאז הרישום האחרון ועד היום.
// שדה lastPosted על התבנית מבטיח אידמפוטנטיות (לא נוצרות כפילויות בין טעינות).
//
// תוקן QA (2026-09): כל ה-add-ים של התקופות שחלפו + עדכון lastPosted על
// התבנית נכתבים כעת כ-batch אטומי אחד (במקום סדרת קריאות repo נפרדות).
// לפני התיקון, אם האפליקציה נסגרה/התרעננה בין יצירת רשומת ההוצאה
// (repo.add) לבין עדכון lastPosted — הטעינה הבאה הייתה מזהה את אותה
// תקופה כ"עדיין לא נרשמה" ויוצרת אותה שוב, כי lastPosted לא התעדכן. עם
// batchRepo, כל התקופות שנוצרו לתבנית נתונה ועדכון lastPosted שלה מצליחים
// יחד או נכשלים יחד — אין מצב ביניים.

function nextPeriod(dateStr, kind) {
  const d = new Date(dateStr);
  if (kind === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function pendingDates(template, today) {
  const anchor = template.lastPosted || template.date;
  if (!anchor) return [];
  const dates = [];
  let cursor = anchor;
  while (true) {
    const next = nextPeriod(cursor, template.recurring);
    if (next > today) break;
    dates.push(dateInputValue(next));
    cursor = dateInputValue(next);
  }
  return dates;
}

export function useRecurringExpenses() {
  const { items } = useCollectionData("expenses");
  const batchRepo = useBatchRepo();
  const running = useRef(false);

  useEffect(() => {
    if (running.current || !items) return;
    const today = new Date();
    const templates = items.filter(
      (r) => r.recurring && pendingDates(r, today).length > 0
    );
    if (templates.length === 0) return;

    running.current = true;
    (async () => {
      try {
        for (const t of templates) {
          const dates = pendingDates(t, today);
          const ops = dates.map((date) => ({
            name: "expenses",
            id: batchRepo.newId("expenses"),
            type: "add",
            data: {
              date,
              description: t.description,
              businessName: t.businessName,
              invoiceNumber: "",
              amountBeforeVat: t.amountBeforeVat,
              vat: t.vat,
              total: t.total,
              category: t.category,
              recurring: null,
              generatedFrom: t.id,
            },
          }));
          ops.push({
            name: "expenses",
            id: t.id,
            type: "update",
            data: { lastPosted: dates[dates.length - 1] },
          });
          // batch לכל תבנית בנפרד: תבניות שונות אינן תלויות זו בזו, וכשל
          // בתבנית אחת (למשל quota) לא אמור לחסום רישום של תבניות אחרות
          // שכן ממתינות.
          await batchRepo.commit(ops);
        }
      } finally {
        running.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}
