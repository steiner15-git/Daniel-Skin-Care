import { createContext, useContext, useRef, useState } from "react";

// Toast עם אפשרות "ביטול" (Undo) ל-5 שניות, למחיקות הפיכות-בקלות בלבד
// (הכנסה/הוצאה/אירוע/תמונה/סדרה/חבילה — לא למחיקה סופית של לקוחה, ולא
// למחיקות עם side-effects כמו הכנסה שקושרת גם מחיקת תור/חבילה).
//
// דפוס עבודה (optimistic delay): המסך הקורא מסתיר את הפריט מה-UI מיד
// (state מקומי, לא Firestore), ומעביר onExpire שמבצע את המחיקה האמיתית רק
// אם לא נלחץ "ביטול" תוך 5 שניות. onUndo מחזיר את הפריט לתצוגה.
//
// נוסף: showMessage(text) — הודעת הצלחה קצרה ("נשמר ✓") ללא כפתור, שנשארת
// גם אחרי מעבר מסך (ה-Provider שורד ניווט).
//
// נוסף: כשל ב-onExpire (למשל רשת) כבר לא נבלע בשקט — הפריט שהוסתר מוחזר
// למסך (דרך onUndo) ומוצגת הודעה. כך מחיקה שנכשלה לא "נעלמת" עד הרענון הבא.
const ToastContext = createContext(null);
const DURATION_MS = 5000;
const MESSAGE_MS = 2500;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, onUndo, onExpire }
  const [message, setMessage] = useState(null); // טקסט הודעת הצלחה
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const messageTimerRef = useRef(null);

  function showMessage(text, duration = MESSAGE_MS) {
    clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = setTimeout(() => setMessage(null), duration);
  }

  // מבצע את הפעולה הדחויה; כשל → מחזיר את הפריט למסך ומודיע.
  async function runExpire(entry) {
    try {
      await entry.onExpire?.();
    } catch (e) {
      console.error("[toast] deferred action failed", e);
      entry.onUndo?.();
      showMessage("הפעולה נכשלה — הפריט הוחזר", 4000);
    }
  }

  function flushPrevious() {
    if (pendingRef.current) {
      clearTimeout(timerRef.current);
      const prev = pendingRef.current;
      pendingRef.current = null;
      runExpire(prev);
    }
  }

  function showUndo({ message: text, onUndo, onExpire, duration = DURATION_MS }) {
    // אם כבר יש Undo פעיל ממתין — מבצעים אותו מיד לפני שמתחילים חדש, כדי
    // לא לנהל כמה מחיקות ממתינות בבת אחת (מקרה נדיר, משתמשת יחידה).
    flushPrevious();
    const entry = { message: text, onUndo, onExpire };
    pendingRef.current = entry;
    setToast(entry);
    timerRef.current = setTimeout(() => {
      if (pendingRef.current === entry) {
        pendingRef.current = null;
        setToast(null);
        runExpire(entry);
      }
    }, duration);
  }

  function handleUndo() {
    if (!pendingRef.current) return;
    clearTimeout(timerRef.current);
    const entry = pendingRef.current;
    pendingRef.current = null;
    setToast(null);
    entry.onUndo?.();
  }

  return (
    <ToastContext.Provider value={{ showUndo, showMessage }}>
      {children}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          <button className="toast__undo" onClick={handleUndo}>
            ביטול
          </button>
        </div>
      )}
      {message && (
        <div
          className="toast"
          role="status"
          style={{
            // כשיש גם Toast של Undo — הודעת ההצלחה מוצגת מעליו.
            bottom: toast ? "calc(var(--nav-h) + env(safe-area-inset-bottom) + 76px)" : undefined,
            justifyContent: "center",
          }}
        >
          <span>{message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
