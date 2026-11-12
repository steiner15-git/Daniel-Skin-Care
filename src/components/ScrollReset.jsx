import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// כל מסך חדש נפתח מלמעלה (דרישת ניווט גלובלית, PRD §3) — אבל חזרה אחורה
// (POP: כפתור חזרה בדפדפן או navigate(-1)) משחזרת את מיקום הגלילה שהיה במסך
// כשעזבנו אותו. שינוי URL באותו נתיב (למשל סנכרון טאב/תאריך ל-?query ב-replace)
// אינו מאפס גלילה.
//
// positions: מיקום גלילה לפי נתיב+query. בזמן שחזור (חלון קצר) מתעלמים
// מאירועי גלילה, כדי שגלילה "חסומה" (תוכן שעדיין נטען ועמוד קצר) לא תדרוס
// את המיקום השמור.
const positions = new Map();
const RESTORE_WINDOW_MS = 600;

export default function ScrollReset() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const urlKey = pathname + search;
  const prevPath = useRef(null);
  const restoringUntil = useRef(0);

  useEffect(() => {
    function onScroll() {
      if (Date.now() < restoringUntil.current) return;
      positions.set(urlKey, window.scrollY);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [urlKey]);

  useEffect(() => {
    const pathChanged = prevPath.current !== pathname;
    prevPath.current = pathname;
    const timers = [];

    if (navType === "POP") {
      const y = positions.get(urlKey) ?? 0;
      restoringUntil.current = Date.now() + RESTORE_WINDOW_MS;
      // כמה ניסיונות: רשימות נטענות אסינכרונית ועמוד קצר לא יכול לגלול עד y.
      [0, 60, 200, 450].forEach((d) => timers.push(setTimeout(() => window.scrollTo(0, y), d)));
    } else if (pathChanged) {
      window.scrollTo(0, 0);
      positions.set(urlKey, 0);
    } else if (!positions.has(urlKey)) {
      // החלפת query באותו נתיב: מעבירים את המיקום הנוכחי למפתח החדש.
      positions.set(urlKey, window.scrollY);
    }
    return () => timers.forEach(clearTimeout);
  }, [pathname, search, navType]);

  return null;
}
