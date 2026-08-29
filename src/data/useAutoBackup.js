import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { runBackup } from "./backup";
import { IS_LOCAL } from "./index";
import { markBackupSuccess, markBackupError } from "./backupStatus";

// גיבוי אוטומטי ל-Google Drive (חוברת Excel יחידה, מתעדכנת במקום).
// רץ ברקע ולא מאט את האפליקציה: גיבוי ראשוני דקה לאחר הכניסה, ואז אחת ל-6
// שעות. בסביבה סגורה / מצב תצוגה מקומי (ללא טוקן Drive) — מושבת בשקט.
const SIX_HOURS = 6 * 60 * 60 * 1000;

// ריצת גיבוי בודדת — מיוצאת כדי שגם הטיימר האוטומטי וגם כפתור "גיבוי
// עכשיו" במסך ההגדרות (addendum #7) ישתמשו באותה לוגיקה בדיוק, כולל
// עדכון סטטוס הגיבוי ב-localStorage (ראו backupStatus.js). מחזירה
// { ok: true } או { ok: false, reason: "no-token" | "other" } כדי שהמסך
// היוזם יוכל להציג הודעת שגיאה מתאימה למקרה של קריאה יזומה.
export async function runBackupOnce(uid, ensureDriveToken) {
  try {
    // נשלף טוקן טרי בזמן הריצה עצמה (ולא נלקח מ-state שנתפס מוקדם יותר)
    // — כולל רענון שקט אם נדרש, במקום להיכשל בשקט על טוקן שכבר פג.
    const token = await ensureDriveToken();
    if (!token) {
      markBackupError();
      return { ok: false, reason: "no-token" };
    }
    await runBackup(uid, token);
    markBackupSuccess();
    return { ok: true };
  } catch {
    markBackupError();
    return { ok: false, reason: "other" };
  }
}

export function useAutoBackup() {
  const { user, ensureDriveToken } = useAuth();

  useEffect(() => {
    if (IS_LOCAL || !user) return;

    function run() {
      // גיבוי אוטומטי לעולם לא יפיל או יאט את האפליקציה — הכשל כבר מטופל
      // ונרשם בתוך runBackupOnce עצמה.
      runBackupOnce(user.uid, ensureDriveToken);
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
