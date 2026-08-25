import { createContext, useContext, useEffect, useRef, useState } from "react";

// "מצב קליניקה" — טשטוש ויזואלי מהיר (לא הצפנה/הסתרה אמיתית) של מידע רגיש
// (מחירים, טלפון, אימייל, הערות פנימיות, אבחון עור) כשהמפעילה מסתכלת בטלפון
// מול לקוחה. מצב נשמר ב-localStorage ונטען מחדש בכל כניסה לאפליקציה.
const STORAGE_KEY = "dsc:clinicMode";
const REVEAL_MS = 3000;

const ClinicModeContext = createContext(null);

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ClinicModeProvider({ children }) {
  const [enabled, setEnabled] = useState(readStored);
  // מעקב אחר טיימרים פר-אלמנט לחשיפה נקודתית — לא React state, כדי לא
  // לגרום ל-re-render בכל לחיצה על שדה רגיש בכל מקום באפליקציה.
  const revealTimers = useRef(new Map());

  useEffect(() => {
    document.body.classList.toggle("clinic-mode", enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* localStorage לא זמין (מצב פרטי וכו') — המצב פשוט לא ישמר */
    }
  }, [enabled]);

  // חשיפה נקודתית: קליק על אלמנט .sensitive בודד מסיר ממנו את הטשטוש ל-3
  // שניות ואז מחזיר אוטומטית. מאזין קליק גלובלי יחיד (event delegation) —
  // כך שכל מקום באפליקציה שרוצה שדה רגיש רק מוסיף className="sensitive",
  // בלי צורך ברכיב עטיפה ייעודי או ב-state נפרד לכל שדה.
  useEffect(() => {
    if (!enabled) return;
    function onClick(e) {
      const el = e.target.closest(".sensitive");
      if (!el) return;
      // שדה רגיש עשוי לשבת בתוך אלמנט לחיץ אחר (למשל טלפון בתוך כרטיס
      // לקוחה שמנווט לכרטיסייה) — קליק לחשיפה לא אמור גם להפעיל את הפעולה
      // שמתחתיו (ניווט/שליחת טופס וכו').
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("revealed");
      const prevTimer = revealTimers.current.get(el);
      if (prevTimer) clearTimeout(prevTimer);
      const timer = setTimeout(() => {
        el.classList.remove("revealed");
        revealTimers.current.delete(el);
      }, REVEAL_MS);
      revealTimers.current.set(el, timer);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      revealTimers.current.forEach((t) => clearTimeout(t));
      revealTimers.current.clear();
    };
  }, [enabled]);

  function toggle() {
    setEnabled((v) => !v);
  }

  return (
    <ClinicModeContext.Provider value={{ enabled, toggle }}>
      {children}
    </ClinicModeContext.Provider>
  );
}

export function useClinicMode() {
  const ctx = useContext(ClinicModeContext);
  if (!ctx) throw new Error("useClinicMode must be used within ClinicModeProvider");
  return ctx;
}
