import NameListEditor from "./NameListEditor";
import { DEFAULT_EXPENSE_CATEGORIES } from "../../data/useListSettings";

export default function ExpenseCategories() {
  return (
    <NameListEditor
      docKey="expenseCategories"
      title="קטגוריות הוצאה"
      itemLabel="שם הקטגוריה"
      addLabel="הוספת קטגוריה"
      defaults={DEFAULT_EXPENSE_CATEGORIES}
    />
  );
}
