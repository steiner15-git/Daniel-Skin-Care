import { useMemo } from "react";
import { useSettingDoc } from "./index";

// רשימות שם בהגדרות (אמצעי תשלום, קטגוריות הוצאה) עם ברירות מחדל משותפות.
// עד שהמשתמשת שומרת רשימה בפעם הראשונה, גם מסך ההגדרות (NameListEditor) וגם
// כל הטפסים (סגירת תור, הכנסה, מכירה, רכישה, הוצאה) חייבים לראות את אותה
// רשימה בדיוק — ולכן הן מוגדרות כאן פעם אחת.
// המזהים יציבים (לא נוצרים מחדש בכל רינדור), אחרת עריכה/מחיקה של פריט
// ברירת מחדל לא עובדות (המזהה משתנה בין רינדורים).

export const DEFAULT_PAYMENT_METHODS = ["מזומן", "אשראי", "ביט", "אחר"];
export const DEFAULT_EXPENSE_CATEGORIES = ["חומרים", "ציוד", "שיווק", "שכירות", "אחר"];

export function defaultItems(docKey, names) {
  return names.map((name, i) => ({ id: `${docKey}-default-${i}`, name }));
}

function useNameList(docKey, names) {
  const { data, loading } = useSettingDoc(docKey);
  const saved = data?.items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => saved ?? defaultItems(docKey, names), [saved, docKey]);
  return { items, loading };
}

export function usePaymentMethods() {
  return useNameList("paymentMethods", DEFAULT_PAYMENT_METHODS);
}

export function useExpenseCategories() {
  return useNameList("expenseCategories", DEFAULT_EXPENSE_CATEGORIES);
}
