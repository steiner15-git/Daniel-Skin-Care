import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { runBackup } from "./backup";
import { IS_LOCAL, useCollectionData } from "./index";
import { markBackupSuccess, markBackupError, markBackupSkipped } from "./backupStatus";
import { maxUpdatedAt, readBackupWatermark, writeBackupWatermark } from "./backupWatermark";

// גיבוי אוטומטי ל-Google Drive (חוברת Excel יחידה, מתעדכנת במקום).
// רץ ברקע ולא מאט את האפליקציה: גיבוי ראשוני דקה לאחר הכניסה, ואז אחת ל-6
// שעות. בסביבה סגורה / מצב תצוגה מקומי (ללא טוקן Drive) — מושבת בשקט.
const SIX_HOURS = 6 * 60 * 60 * 1000;

// ריצת גיבוי בודדת — מיוצאת כדי שגם הטיימר האוטומטי וגם כפתור "גיבוי
// עכשיו" במסך ההגדרות (addendum #7) ישתמשו באותה לוגיקה בדיוק, כולל
// עדכון סטטוס הגיבוי ב-localStorage (ראו backupStatus.js).
//
// Phase 4 §8 — "גיבוי חכם": force=true (כפתור "גיבוי עכשיו" ב-Backup.jsx,
// כולל נסיון-חוזר אחרי התחברות מחדש) מתעלם מ-currentMax/watermark ותמיד
// מבצע גיבוי בפועל — בקשה מפורשת של המשתמשת לא אמורה להידלג בשקט.
// force=false (ברירת מחדל, כל הריצות האוטומטיות): אם currentMax (updatedAt
// המרבי בפועל מתוך הקולקציות המגובות, ראו backupWatermark.js) אינו גדול
// מחותמת הגיבוי המוצלח האחרון (watermark) — מדלגים לגמרי על גישת Drive
// (בלי בקשת טוקן, בלי בקשת רשת).
//
// מחזירה { ok: true, skipped: true } כשדילגה, { ok: true } בהצלחה, או
// { ok: false, reason: "no-token" | "other", detail? } בכשל, כדי שהמסך היוזם
// יוכל להציג הודעת שגיאה מתאימה למקרה של קריאה יזומה. detail הוא הסיבה
// האמיתית (סטטוס HTTP + הודעת Drive) — נשמרת גם בסטטוס (lastErrorReason).
export async function runBackupOnce(uid, ensureDriveToken, { force = false, currentMax = null } = {}) {
  if (!force && currentMax != null && currentMax <= readBackupWatermark()) {
    markBackupSkipped();
    return { ok: true, skipped: true };
  }
  try {
    // נשלף טוקן טרי בזמן הריצה עצמה (ולא נלקח מ-state שנתפס מוקדם יותר)
    // — כולל רענון שקט אם נדרש, במקום להיכשל בשקט על טוקן שכבר פג.
    const token = await ensureDriveToken();
    if (!token) {
      markBackupError("no-token");
      return { ok: false, reason: "no-token" };
    }
    await runBackup(uid, token);
    markBackupSuccess();
    // "עכשיו" הוא חותמת בטוחה: הגיבוי שהושלם זה עתה כלל בהכרח כל שינוי
    // שקדם לרגע זה (ולכל היותר מפספס שינוי שקרה ממש תוך כדי בניית הקובץ —
    // חלון מירוץ צר וזניח, קיים באותה מידה בכל גישה חלופית).
    writeBackupWatermark(Date.now());
    return { ok: true };
  } catch (e) {
    console.error("[backup] failed", e);
    const detail = e?.status
      ? `HTTP ${e.status}${e.detail ? ` — ${e.detail}` : ""}`
      : String(e?.message || e);
    markBackupError(detail);
    return { ok: false, reason: "other", detail };
  }
}

export function useAutoBackup() {
  const { user, ensureDriveToken } = useAuth();
  // Phase 4 §8 — נרשמים לארבע הקולקציות המגובות דרך המאגר המשותף
  // (subscribeShared ב-data/firestore.js): אם מסך אחר כבר מנוי על אחת מהן
  // (BottomNav על income, למשל) לא נפתח מנוי Firestore נוסף — רק עוד צרכן
  // לאותו מנוי קיים. כך אפשר לחשב updatedAt מרבי בפועל בלי עלות רשת נוספת
  // מעבר למה שכבר נטען ממילא באפליקציה.
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");
  const { items: clients } = useCollectionData("clients");
  const { items: clientPackages } = useCollectionData("clientPackages");

  const currentMax = useMemo(
    () => maxUpdatedAt({ income, expenses, clients, clientPackages }),
    [income, expenses, clients, clientPackages]
  );
  // ref, לא state: הערך העדכני נדרש בתוך run() שרץ מתוך setTimeout/
  // setInterval שנקבעו פעם אחת ב-mount (תלוי רק ב-user) — closure רגיל
  // היה "תופס" את הערך מרגע היצירה בלבד ולא את העדכני בפועל בזמן הריצה.
  const currentMaxRef = useRef(currentMax);
  currentMaxRef.current = currentMax;

  useEffect(() => {
    if (IS_LOCAL || !user) return;

    function run() {
      // גיבוי אוטומטי לעולם לא יפיל או יאט את האפליקציה — הכשל כבר מטופל
      // ונרשם בתוך runBackupOnce עצמה.
      runBackupOnce(user.uid, ensureDriveToken, { currentMax: currentMaxRef.current });
    }

    const initial = setTimeout(run, 60000);
    const interval = setInterval(run, SIX_HOURS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
}
