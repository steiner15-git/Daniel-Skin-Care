import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { DriveAuthError, isDriveAuthFailure } from "../auth/googleDrive";

const BACKUP_NAME = "daniel-skin-care-backup.xlsx";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

// מזהה קובץ הגיבוי ב-Drive נשמר ב-localStorage, ממופתח לפי uid — כך שהחלפת
// חשבון Google על אותו דפדפן/origin לא תשתמש במזהה של חשבון אחר (ל-Drive עם
// scope drive.file אין גישה לקבצים של חשבון/client אחר, והתוצאה 404).
// (המפתח הישן ללא uid — "dsc:driveBackupFileId" — כבר לא נקרא; קובץ הגיבוי
// הקיים יימצא מחדש לפי שם, ראו findExistingBackupId.)
const FILE_ID_KEY_BASE = "dsc:driveBackupFileId";

function fileIdKey(uid) {
  return `${FILE_ID_KEY_BASE}:${uid}`;
}

// מיוצא עבור מסך "הגדרות → גיבוי" (קישור ישיר לקובץ).
export function readBackupFileId(uid) {
  if (!uid) return "";
  try {
    return localStorage.getItem(fileIdKey(uid)) || "";
  } catch {
    return "";
  }
}

function writeBackupFileId(uid, id) {
  try {
    if (id) localStorage.setItem(fileIdKey(uid), id);
    else localStorage.removeItem(fileIdKey(uid));
  } catch {
    /* localStorage לא זמין — הגיבוי הבא פשוט יחפש את הקובץ לפי שם */
  }
}

// שגיאת גיבוי עם סטטוס HTTP והודעת Drive, כדי שהסיבה האמיתית תוצג במסך
// הגיבוי ובקונסול (במקום הודעה כללית "בדקי את החיבור לרשת").
export class BackupError extends Error {
  constructor(status, detail) {
    super(`Drive backup failed: ${status}`);
    this.name = "BackupError";
    this.status = status;
    this.detail = detail || "";
  }
}

async function readErrorDetail(res) {
  try {
    const json = await res.json();
    return json?.error?.message || "";
  } catch {
    return "";
  }
}

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

// מחפש קובץ גיבוי קיים לפי שם (לא בפח). עם scope drive.file החיפוש מחזיר רק
// קבצים שהאפליקציה (אותו OAuth client) יצרה — בדיוק מה שמתאים כאן.
// כשל-אימות (טוקן נדחה) נזרק כ-DriveAuthError ומטופל ע"י withDriveToken
// שקורא ל-performBackup כולו (ראו runBackup למטה) — כל כשל אחר (רשת/quota,
// לא נמצא) אינו קריטי כאן: מוחזר null והקורא ייצור קובץ חדש.
async function findExistingBackupId(token) {
  const q = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
  const res = await fetch(
    `${DRIVE_FILES}?q=${q}&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (await isDriveAuthFailure(res)) throw new DriveAuthError(res.status);
  if (!res.ok) return null;
  try {
    const json = await res.json();
    return json.files?.[0]?.id || null;
  } catch {
    return null;
  }
}

// העלאה: PATCH לקובץ קיים (כשיש fileId), אחרת POST ליצירת קובץ חדש.
async function uploadWorkbook(token, fileId, base64) {
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

  const url = fileId
    ? `${DRIVE_UPLOAD}/${fileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}?uploadType=multipart`;

  const res = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (await isDriveAuthFailure(res)) throw new DriveAuthError(res.status);
  return res;
}

// ליבת הגיבוי בפועל, פר-טוקן: מחפשת קובץ קיים ומעלה/מעדכנת אותו, כולל
// ההתאוששות הקיימת מ-404 (קובץ שנמחק ב-Drive או שהמזהה השמור שייך
// לחשבון/client אחר). עטופה כולה ע"י withDriveToken ב-runBackup למטה כיחידה
// אחת — בטוח לעשות זאת כאן כי כל הפעולות הפנימיות אידמפוטנטיות (החיפוש הוא
// read-only; ההעלאה עצמה היא PATCH/POST מלא לפי id/name קבועים, לא צבירה) —
// אם 401 קורה באמצע והכל רץ שוב מההתחלה עם טוקן טרי, לא נוצרת כפילות או
// תופעת לוואי.
async function performBackup(uid, token, base64) {
  const storedId = readBackupFileId(uid) || null;
  // אין מזהה שמור (דפדפן חדש / localStorage נוקה) — קודם מחפשים קובץ קיים
  // כדי לא ליצור כפילות ב-Drive.
  const initialId = storedId || (await findExistingBackupId(token));

  let res = await uploadWorkbook(token, initialId, base64);

  if (res.status === 404 && initialId) {
    writeBackupFileId(uid, null);
    const foundId = await findExistingBackupId(token);
    res = await uploadWorkbook(token, foundId && foundId !== initialId ? foundId : null, base64);
  }

  if (!res.ok) {
    if (res.status === 404) writeBackupFileId(uid, null);
    throw new BackupError(res.status, await readErrorDetail(res));
  }

  const json = await res.json();
  if (json.id) writeBackupFileId(uid, json.id);
  return json.id;
}

// גיבוי אוטומטי ל-Drive: מעלה חוברת Excel יחידה, ומעדכן את אותו קובץ בכל פעם
// (ללא צבירת קבצים — לא מעמיס על מקום ב-Drive).
//
// מקבל withDriveToken (מ-useAuth(), ראו AuthProvider.jsx) ולא token גולמי —
// כך שאם Drive דוחה את הטוקן באמצע הגיבוי (401/403-authError, מזוהה ע"י
// findExistingBackupId/uploadWorkbook למעלה), מתבצע רענון שקט + ניסיון חוזר
// יחיד לכל תהליך הגיבוי, במקום שהגיבוי האוטומטי ייכשל בשקט עד ההתחברות
// הידנית הבאה.
export async function runBackup(uid, withDriveToken) {
  const base64 = await buildWorkbookBase64(uid);
  return withDriveToken((token) => performBackup(uid, token, base64));
}
