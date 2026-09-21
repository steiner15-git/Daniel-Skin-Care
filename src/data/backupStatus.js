// סטטוס גיבוי אוטומטי (הצלחה/כישלון/דילוג אחרונים), נשמר ב-localStorage כדי
// שמסך "הגדרות → גיבוי" יוכל להציגו מיד גם בלי לחכות לריצה הבאה של
// useAutoBackup. שלושה timestamps נפרדים (לא דורסים זה את זה) — כך אפשר
// להציג "הגיבוי האחרון נכשל" וגם "גיבוי מוצלח אחרון" בו-זמנית, אם היה גיבוי
// מוצלח אי-פעם לפני הכישלון הנוכחי; ו-lastSkippedAt (Phase 4 §8 — "גיבוי
// חכם") כדי להראות שהבדיקה האוטומטית רצה ומצאה שאין מה לעדכן.
//
// lastErrorReason: סיבת הכשל האחרון כטקסט קצר (למשל "HTTP 404 — File not
// found: …" או "no-token"), כדי שמסך הגיבוי יציג את הסיבה האמיתית ולא רק
// "נכשל". מנוקה בהצלחה, יחד עם lastErrorAt.
const STATUS_KEY = "dsc:driveBackupStatus";

export function readBackupStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || "null") || {};
  } catch {
    return {};
  }
}

// הרצה מוצלחת: מעדכנת lastSuccessAt, ומנקה lastErrorAt/lastErrorReason —
// כישלון ישן שכבר "תוקן" ע"י ריצה מוצלחת מאוחרת יותר לא אמור להמשיך להיות
// מוצג כ"הגיבוי האחרון נכשל" (זו כבר לא המציאות הנוכחית).
export function markBackupSuccess() {
  try {
    const cur = readBackupStatus();
    localStorage.setItem(
      STATUS_KEY,
      JSON.stringify({ ...cur, lastSuccessAt: Date.now(), lastErrorAt: null, lastErrorReason: null })
    );
  } catch {
    /* localStorage לא זמין — הסטטוס פשוט לא יישמר */
  }
}

export function markBackupError(reason) {
  try {
    const cur = readBackupStatus();
    localStorage.setItem(
      STATUS_KEY,
      JSON.stringify({ ...cur, lastErrorAt: Date.now(), lastErrorReason: reason || null })
    );
  } catch {
    /* localStorage לא זמין — הסטטוס פשוט לא יישמר */
  }
}

// Phase 4 §8 — נקראת כשריצת גיבוי אוטומטית דילגה על גישה ל-Drive כי לא
// זוהה שינוי (updatedAt מרבי <= watermark, ראו backupWatermark.js). לא
// נוגעת ב-lastErrorAt/lastSuccessAt — דילוג אינו כישלון ואינו הצלחה חדשה.
export function markBackupSkipped() {
  try {
    const cur = readBackupStatus();
    localStorage.setItem(STATUS_KEY, JSON.stringify({ ...cur, lastSkippedAt: Date.now() }));
  } catch {
    /* localStorage לא זמין — הסטטוס פשוט לא יישמר */
  }
}
