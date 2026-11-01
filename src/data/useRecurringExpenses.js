import { useEffect, useRef } from "react";
import { useCollectionData, useBatchRepo } from "./index";
import { pendingDates } from "../utils/recurring";

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
//
// מע"מ: הרשומות שנוצרות מעתיקות מהתבנית את הסכום הכולל ואת הנתונים שקובעים
// את המע"מ שלה (vatRate ידני, או amountBeforeVat/vat בתבנית ישנה). ערכים
// חסרים נכתבים כ-null (Firestore אינו מקבל undefined). בתבנית חדשה בלי שיעור
// ידני — השיעור נגזר משנת המס של תאריך כל רשומה (utils/vat.js).

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
              description: t.description ?? "",
              businessName: t.businessName ?? "",
              invoiceNumber: "",
              total: t.total ?? 0,
              vatRate: t.vatRate ?? null,
              amountBeforeVat: t.amountBeforeVat ?? null,
              vat: t.vat ?? null,
              category: t.category ?? "",
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
