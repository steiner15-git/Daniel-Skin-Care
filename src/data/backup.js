import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

const BACKUP_NAME = "daniel-skin-care-backup.xlsx";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// מיוצא (בעבר היה פרטי) כדי שמסך "הגדרות → גיבוי" (addendum #7) יוכל לבנות
// קישור ישיר לקובץ הגיבוי ב-Drive מתוך אותו localStorage key בדיוק.
export const FILE_ID_KEY = "dsc:driveBackupFileId";

async function getAll(uid, name) {
  const snap = await getDocs(collection(db, "users", uid, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// בונה חוברת Excel עם גיליונות הכנסות / הוצאות / לקוחות (גיבוי קריא, לא JSON).
async function buildWorkbookBase64(uid) {
  const XLSX = await import("xlsx");
  const [income, expenses, clients, packages] = await Promise.all([
    getAll(uid, "income"),
    getAll(uid, "expenses"),
    getAll(uid, "clients"),
    getAll(uid, "clientPackages"),
  ]);

  const wb = XLSX.utils.book_new();

  const incomeAoa = [
    ["תאריך", "סכום", "אמצעי תשלום", "מספר חשבונית", "שולם", "לקוחה", "טיפול"],
    ...income.map((r) => [
      r.date || "",
      Number(r.amount) || 0,
      r.paymentMethod || "",
      r.invoiceNumber || "",
      r.paid ? "כן" : "לא",
      r.clientName || "",
      r.treatmentName || r.note || "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incomeAoa), "הכנסות");

  const expenseAoa = [
    ["תאריך", "תיאור", "שם עסק", "מספר חשבונית", "לפני מעמ", "מעמ", "סהכ", "קטגוריה", "קבועה"],
    ...expenses.map((r) => [
      r.date || "",
      r.description || "",
      r.businessName || "",
      r.invoiceNumber || "",
      Number(r.amountBeforeVat) || 0,
      Number(r.vat) || 0,
      Number(r.total) || 0,
      r.category || "",
      r.recurring || "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseAoa), "הוצאות");

  const clientAoa = [
    ["שם פרטי", "שם משפחה", "טלפון", "אימייל", "תאריך לידה", "מקור", "בארכיון"],
    ...clients.map((c) => [
      c.firstName || "",
      c.lastName || "",
      c.phone || "",
      c.email || "",
      c.birthday || "",
      c.source || "",
      c.archived ? "כן" : "לא",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clientAoa), "לקוחות");

  const packageAoa = [
    ["לקוחה", "סדרה", "טיפול", "סהכ מפגשים", "נותרו", "תאריך רכישה", "בתוקף עד", "סטטוס"],
    ...packages.map((p) => [
      p.clientName || "",
      p.seriesName || "",
      p.treatmentName || "",
      Number(p.totalSessions) || 0,
      Number(p.remainingSessions) || 0,
      p.purchaseDate || "",
      p.expiryDate || "",
      p.status || "",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(packageAoa), "חבילות");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// גיבוי אוטומטי ל-Drive: מעלה חוברת Excel יחידה, ומעדכן את אותו קובץ בכל פעם
// (ללא צבירת קבצים — לא מעמיס על מקום ב-Drive).
export async function runBackup(uid, token) {
  const base64 = await buildWorkbookBase64(uid);
  const existingId = localStorage.getItem(FILE_ID_KEY);
  const boundary = "dscbnd" + Math.random().toString(36).slice(2);
  const metadata = { name: BACKUP_NAME, mimeType: XLSX_MIME };

  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${XLSX_MIME}\r\n` +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    base64 +
    `\r\n--${boundary}--`;

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const res = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive backup failed: ${res.status}`);
  const json = await res.json();
  if (json.id) localStorage.setItem(FILE_ID_KEY, json.id);
  return json.id;
}
