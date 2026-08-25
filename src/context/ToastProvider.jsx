import { createContext, useContext, useRef, useState } from "react";

// Toast עם אפשרות "ביטול" (Undo) ל-5 שניות, למחיקות הפיכות-בקלות בלבד
// (הכנסה/הוצאה/אירוע/תמונה/סדרה/חבילה — לא למחיקה סופית של לקוחה, ולא
// למחיקות עם side-effects כמו הכנסה שקושרת גם מחיקת תור/חבילה).
//
// דפוס עבודה (optimistic delay): המסך הקורא מסתיר את הפריט מה-UI מיד
// (state מקומי, לא Firestore), ומעביר onExpire שמבצע את המחיקה האמיתית רק
// אם לא נלחץ "ביטול" תוך 5 שניות. onUndo מחזיר את הפריט לתצוגה.
const ToastContext = createContext(null);
const DURATION_MS = 5000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, onUndo, onExpire }
  const timerRef = useRef(null);
  const pendingRef = useRef(null);

  function flushPrevious() {
    if (pendingRef.current) {
      clearTimeout(timerRef.current);
      const prev = pendingRef.current;
      pendingRef.current = null;
      prev.onExpire?.();
    }
  }

  function showUndo({ message, onUndo, onExpire, duration = DURATION_MS }) {
    // אם כבר יש Undo פעיל ממתין — מבצעים אותו מיד לפני שמתחילים חדש, כדי
    // לא לנהל כמה מחיקות ממתינות בבת אחת (מקרה נדיר, משתמשת יחידה).
    flushPrevious();
    const entry = { message, onUndo, onExpire };
    pendingRef.current = entry;
    setToast(entry);
    timerRef.current = setTimeout(() => {
      if (pendingRef.current === entry) {
        pendingRef.current = null;
        setToast(null);
        entry.onExpire?.();
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
    <ToastContext.Provider value={{ showUndo }}>
      {children}
      {toast && (
        <div className="toast">
          <span>{toast.message}</span>
          <button className="toast__undo" onClick={handleUndo}>
            ביטול
          </button>
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
