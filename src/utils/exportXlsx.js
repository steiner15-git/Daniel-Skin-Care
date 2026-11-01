import { round2 } from "./credits";
import {
  taxYearFor,
  isLicensed,
  effectiveRate,
  incomeVat,
  expenseVat,
  incomeRevenue,
  expenseCost,
  VAT_STATUS_LABEL,
} from "./vat";

// ייצוא דוח שנתי אמיתי (.xlsx): טבלה אחת עם עמודת "סוג", כולל עמודת מספר חשבונית
// (מאוכלסת בהכנסות; ריקה בהוצאות), ארבע עמודות מע"מ (כולל מע"מ / נטו / מע"מ /
// מע"מ %) להכנסות ולהוצאות — בשנת פטור ובשנת מורשה — ושורות סיכום.
// הנטו והמע"מ נגזרים מהגדרות שנת המס (utils/vat.js), לא נקראים מהרשומה.
// שורה ראשונה בקובץ מציינת את הסטטוס ושיעור המע"מ של השנה, כדי שרואה החשבון
// ידע על איזה בסיס הקובץ נוצר.
// טעינת ספריית xlsx דינמית — נטענת רק בעת ייצוא, לא בטעינת האפליקציה.
export async function exportYearReport(year, income, expenses, years = []) {
  const XLSX = await import("xlsx");
  const header = [
    "סוג",
    "תאריך",
    "פירוט",
    "לקוחה / שם עסק",
    "קטגוריה / אמצעי תשלום",
    "מספר חשבונית",
    'כולל מע"מ (₪)',
    "נטו (₪)",
    'מע"מ (₪)',
    'מע"מ %',
    "סטטוס",
  ];

  const inYear = (d) => String(d || "").startsWith(String(year));

  const incomeList = income.filter((r) => inYear(r.date));
  const expenseList = expenses.filter((r) => inYear(r.date));

  const incomeRows = incomeList.map((r) => {
    const p = incomeVat(r, years);
    return [
      "הכנסה",
      r.date || "",
      r.treatmentName || r.note || "",
      r.clientName || "",
      r.paymentMethod || "",
      r.invoiceNumber || "",
      p.gross,
      p.net,
      p.vat,
      p.rate,
      r.paid ? "שולם" : "לא שולם",
    ];
  });

  const expenseRows = expenseList.map((r) => {
    const p = expenseVat(r, years);
    return [
      "הוצאה",
      r.date || "",
      r.description || "",
      r.businessName || "",
      r.category || "",
      r.invoiceNumber || "",
      p.gross,
      p.net,
      p.vat,
      p.rate,
      "",
    ];
  });

  const sum = (rows, col) => round2(rows.reduce((s, r) => s + (Number(r[col]) || 0), 0));

  // רווח: בשנת מורשה — נטו; בשנת פטור — סכומים כוללים (ראו utils/vat.js).
  const profit = round2(
    incomeList.reduce((s, r) => s + incomeRevenue(r, years), 0) -
      expenseList.reduce((s, r) => s + expenseCost(r, years), 0)
  );

  const entry = taxYearFor(`${year}-06-30`, years);
  const statusLabel = VAT_STATUS_LABEL[entry?.status || "exempt"];
  const info = `דוח שנתי ${year} · ${statusLabel} · שיעור מע"מ בשנה: ${effectiveRate(entry)}%`;
  const profitBasis = isLicensed(entry) ? "לפי נטו" : "לפי סכומים כוללים";

  const aoa = [
    [info],
    [],
    header,
    ...incomeRows,
    ...expenseRows,
    [],
    ["", "", "", "", "", 'סה"כ הכנסות', sum(incomeRows, 6), sum(incomeRows, 7), sum(incomeRows, 8), "", ""],
    ["", "", "", "", "", 'סה"כ הוצאות', sum(expenseRows, 6), sum(expenseRows, 7), sum(expenseRows, 8), "", ""],
    ["", "", "", "", "", "רווח", profit, "", "", "", profitBasis],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 9 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(year));
  XLSX.writeFile(wb, `report-${year}.xlsx`);
}
