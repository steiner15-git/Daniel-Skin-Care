// סטטוס גיבוי אוטומטי (הצלחה/כישלון אחרונים), נשמר ב-localStorage כדי
// שמסך "הגדרות → גיבוי" יוכל להציגו מיד גם בלי לחכות לריצה הבאה של
// useAutoBackup. שני timestamps נפרדים (לא דורסים זה את זה) — כך אפשר
// להציג גם "הגיבוי האחרון נכשל" וגם "גיבוי מוצלח אחרון" בו-זמנית, אם
// היה גיבוי מוצלח אי-פעם לפני הכישלון הנוכחי.
const STATUS_KEY = "dsc:driveBackupStatus";

export function readBackupStatus() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || "null") || {};
  } catch {
    return {};
  }
}

// הרצה מוצלחת: מעדכנת lastSuccessAt, ומנקה lastErrorAt — כישלון ישן
// שכבר "תוקן" ע"י ריצה מוצלחת מאוחרת יותר לא אמור להמשיך להיות מוצג
// כ"הגיבוי האחרון נכשל" (זו כבר לא המציאות הנוכחית).
export function markBackupSuccess() {
  try {
    const cur = readBackupStatus();
    localStorage.setItem(
      STATUS_KEY,
      JSON.stringify({ ...cur, lastSuccessAt: Date.now(), lastErrorAt: null })
    );
  } catch {
    /* localStorage לא זמין — הסטטוס פשוט לא יישמר */
  }
}

export function markBackupError() {
  try {
    const cur = readBackupStatus();
    localStorage.setItem(STATUS_KEY, JSON.stringify({ ...cur, lastErrorAt: Date.now() }));
  } catch {
    /* localStorage לא זמין — הסטטוס פשוט לא יישמר */
  }
}
