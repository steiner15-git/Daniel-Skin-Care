import { createContext, useContext, useState } from "react";

// מחליף את confirm()/alert() המובנים של הדפדפן ברכיב מודאלי מותאם עיצובית.
// שימוש: const confirmDialog = useConfirm();
//        const ok = await confirmDialog({ title, message, confirmLabel, danger, secondConfirm });
// alert-בלבד (הודעת שגיאה, בלי אפשרות ביטול): confirmDialog({ title, message, alertOnly: true }).
// secondConfirm (אופציונלי): שלב אישור שני, לפעולות בלתי-הפיכות (למשל מחיקת לקוחה סופית).
//
// reasonOptions (אופציונלי, Phase 4 §5 — מעקב ביטולים): מערך [{ value, label }].
// כשמוגדר, מוצגת בחירת-יחיד (chips) מתחת להודעה, וכפתור הפעולה הראשי ננעל
// עד שנבחרה סיבה. במקרה זה ה-Promise שמוחזר מתפתר לערך (value) שנבחר בהצלחה
// (ולא ל-true כמו בזרימה הרגילה) — עדיין false בביטול. שימוש:
//   const reason = await confirmDialog({ ..., reasonOptions: CANCEL_REASONS });
//   if (!reason) return; // בוטל
// נתמך רק בשלב הראשון של הדיאלוג — לא בתוך secondConfirm (אין כרגע מקרה
// שדורש שילוב של שני המנגנונים יחד באפליקציה).
const ConfirmDialogContext = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null); // { options, resolve, step, selectedReason }

  function confirmDialog(options) {
    return new Promise((resolve) => {
      setState({ options, resolve, step: 1, selectedReason: null });
    });
  }

  function close(result) {
    state?.resolve(result);
    setState(null);
  }

  function handlePrimary() {
    if (state.step === 1 && state.options.secondConfirm) {
      setState({ ...state, step: 2 });
    } else if (state.step === 1 && state.options.reasonOptions) {
      close(state.selectedReason);
    } else {
      close(true);
    }
  }

  const current =
    state && (state.step === 2 ? state.options.secondConfirm : state.options);

  // reasonOptions נתמך רק בשלב 1 (לא בתוך secondConfirm) — ראו הערה למעלה.
  const showReasons = !!(state && state.step === 1 && state.options.reasonOptions);
  const primaryDisabled = showReasons && !state.selectedReason;

  return (
    <ConfirmDialogContext.Provider value={confirmDialog}>
      {children}
      {state && (
        <div className="modal-backdrop" onClick={() => !current.alertOnly && close(false)}>
          <div className="modal confirm-dialog" onClick={(e) => e.stopPropagation()}>
            {current.title && <h3 className="confirm-dialog__title">{current.title}</h3>}
            {current.message && (
              <p className="confirm-dialog__message">{current.message}</p>
            )}
            {showReasons && (
              <div className="chips" style={{ marginBottom: 16 }}>
                {state.options.reasonOptions.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={"chip" + (state.selectedReason === r.value ? " chip--on" : "")}
                    onClick={() => setState({ ...state, selectedReason: r.value })}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <div className="confirm-dialog__actions">
              {!current.alertOnly && (
                <button className="btn btn--muted" onClick={() => close(false)}>
                  {current.cancelLabel || "ביטול"}
                </button>
              )}
              <button
                className={"btn" + (current.danger ? " btn--danger" : "")}
                disabled={primaryDisabled}
                onClick={handlePrimary}
              >
                {current.confirmLabel || (current.alertOnly ? "הבנתי" : "אישור")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx;
}
