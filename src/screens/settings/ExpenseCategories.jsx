import NameListEditor from "./NameListEditor";

export default function ExpenseCategories() {
  return (
    <NameListEditor
      docKey="expenseCategories"
      title="קטגוריות הוצאה"
      itemLabel="שם הקטגוריה"
      addLabel="הוספת קטגוריה"
      defaults={["חומרים", "ציוד", "שיווק", "שכירות", "אחר"]}
    />
  );
}
