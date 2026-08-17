import { useEffect, useRef } from "react";
import { useCollectionData, useRepo } from "./index";
import { dateInputValue } from "../utils/datetime";

// הוצאה קבועה (חודשית/שנתית) נרשמת אוטומטית בכל תקופה שחלפה.
// אין שרת רקע — הרישום מתבצע בעת טעינת האפליקציה: לכל תבנית קבועה נוצרות
// רשומות הוצאה רגילות עבור כל תקופה שעברה מאז הרישום האחרון ועד היום.
// שדה lastPosted על התבנית מבטיח אידמפוטנטיות (לא נוצרות כפילויות בין טעינות).

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
  const repo = useRepo("expenses");
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
          for (const date of dates) {
            await repo.add({
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
            });
          }
          await repo.update(t.id, { lastPosted: dates[dates.length - 1] });
        }
      } finally {
        running.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}
