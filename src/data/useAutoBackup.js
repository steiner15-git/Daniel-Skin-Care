import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { runBackup } from "./backup";
import { IS_LOCAL } from "./index";

// גיבוי אוטומטי ל-Google Drive (חוברת Excel יחידה, מתעדכנת במקום).
// רץ ברקע ולא מאט את האפליקציה: גיבוי ראשוני דקה לאחר הכניסה, ואז אחת ל-6 שעות.
// בסביבה סגורה / מצב תצוגה מקומי (ללא טוקן Drive) — מושבת בשקט.
const SIX_HOURS = 6 * 60 * 60 * 1000;

export function useAutoBackup() {
  const { user, driveToken } = useAuth();

  useEffect(() => {
    if (IS_LOCAL || !user || !driveToken) return;

    async function run() {
      try {
        await runBackup(user.uid, driveToken);
      } catch {
        // גיבוי לעולם לא יפיל או יאט את האפליקציה
      }
    }

    const initial = setTimeout(run, 60000);
    const interval = setInterval(run, SIX_HOURS);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [user, driveToken]);
}
