// ייצוא דוח שנתי אמיתי (.xlsx): טבלה אחת עם עמודת "סוג", כולל עמודת מספר חשבונית
// (מאוכלסת בהכנסות; ריקה בהוצאות) ושורות סיכום.
// טעינת ספריית xlsx דינמית — נטענת רק בעת ייצוא, לא בטעינת האפליקציה.
export async function exportYearReport(year, income, expenses) {
  const XLSX = await import("xlsx");
  const header = [
    "סוג",
    "תאריך",
    "פירוט",
    "לקוחה / שם עסק",
    "קטגוריה / אמצעי תשלום",
    "מספר חשבונית",
    "סכום (₪)",
    "סטטוס",
  ];

  const inYear = (d) => String(d || "").startsWith(String(year));

  const incomeRows = income
    .filter((r) => inYear(r.date))
    .map((r) => [
      "הכנסה",
      r.date || "",
      r.treatmentName || r.note || "",
      r.clientName || "",
      r.paymentMethod || "",
      r.invoiceNumber || "",
      Number(r.amount) || 0,
      r.paid ? "שולם" : "לא שולם",
    ]);

  const expenseRows = expenses
    .filter((r) => inYear(r.date))
    .map((r) => [
      "הוצאה",
      r.date || "",
      r.description || "",
      r.businessName || "",
      r.category || "",
      r.invoiceNumber || "",
      Number(r.total) || 0,
      "",
    ]);

  const totalIncome = incomeRows.reduce((s, r) => s + r[6], 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r[6], 0);

  const aoa = [
    header,
    ...incomeRows,
    ...expenseRows,
    [],
    ["", "", "", "", "", "סה\"כ הכנסות", totalIncome, ""],
    ["", "", "", "", "", "סה\"כ הוצאות", totalExpense, ""],
    ["", "", "", "", "", "רווח", totalIncome - totalExpense, ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(year));
  XLSX.writeFile(wb, `report-${year}.xlsx`);
}
