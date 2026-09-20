// Phase 4 §8 — "גיבוי חכם": במקום דגל בוליאני שמסומן בכל כתיבה (הגישה
// הקודמת, שהוחלפה כאן), עוקבים אחר updatedAt המרבי בפועל מתוך הרשומות
// שכבר טעונות בזיכרון בקולקציות המגובות (BACKUP_COLLECTIONS — חייב להישאר
// תואם ל-4 קריאות ה-getAll ב-data/backup.js), ומשווים לחותמת (watermark)
// של הגיבוי המוצלח האחרון. כך גם עדכון שמגיע ממקור אחר (למשל תיקון ידני
// ישיר ב-Firestore Console) מזוהה נכון — לא רק כתיבות שעברו דרך ה-repo.
//
// היתרון על פני דגל-כתיבה: שכבת ה-repo (data/firestore.js / data/localStore.js)
// לא צריכה "לדעת" כלל על גיבוי — הפרדת אחריות נקייה יותר.

const WATERMARK_KEY = "dsc:driveBackupWatermark";

export const BACKUP_COLLECTIONS = ["income", "expenses", "clients", "clientPackages"];

// ממיר updatedAt (יכול להיות Firestore Timestamp בענן, או מספר Date.now()
// במצב מקומי) למספר מילישניות להשוואה אחידה.
function toMillis(updatedAt) {
  if (updatedAt == null) return 0;
  if (typeof updatedAt === "number") return updatedAt;
  if (typeof updatedAt.toMillis === "function") return updatedAt.toMillis();
  if (typeof updatedAt.toDate === "function") return updatedAt.toDate().getTime();
  return 0;
}

// updatedAt המרבי בפועל מתוך כל הרשומות שכבר נטענו בכל קולקציה מגובה.
// collectionsByName: { income: [...], expenses: [...], clients: [...],
// clientPackages: [...] } — כפי שמתקבל מ-useCollectionData בכל אחת מהן
// (ראו useAutoBackup.js).
export function maxUpdatedAt(collectionsByName) {
  let max = 0;
  for (const name of BACKUP_COLLECTIONS) {
    for (const item of collectionsByName[name] || []) {
      const t = toMillis(item.updatedAt);
      if (t > max) max = t;
    }
  }
  return max;
}

export function readBackupWatermark() {
  try {
    return Number(localStorage.getItem(WATERMARK_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeBackupWatermark(ms) {
  try {
    localStorage.setItem(WATERMARK_KEY, String(ms));
  } catch {
    /* localStorage לא זמין — הגיבוי הבא פשוט ירוץ שוב, בבטחה (לא מזיק) */
  }
}
