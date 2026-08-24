import { createContext, useContext, useState } from "react";

// מחליף את confirm()/alert() המובנים של הדפדפן ברכיב מודאלי מותאם עיצובית.
// שימוש: const confirmDialog = useConfirm();
//        const ok = await confirmDialog({ title, message, confirmLabel, danger, secondConfirm });
// alert-בלבד (הודעת שגיאה, בלי אפשרות ביטול): confirmDialog({ title, message, alertOnly: true }).
// secondConfirm (אופציונלי): שלב אישור שני, לפעולות בלתי-הפיכות (למשל מחיקת לקוחה סופית).
const ConfirmDialogContext = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null); // { options, resolve, step }

  function confirmDialog(options) {
    return new Promise((resolve) => {
      setState({ options, resolve, step: 1 });
    });
  }

  function close(result) {
    state?.resolve(result);
    setState(null);
  }

  function handlePrimary() {
    if (state.step === 1 && state.options.secondConfirm) {
      setState({ ...state, step: 2 });
    } else {
      close(true);
    }
  }

  const current =
    state && (state.step === 2 ? state.options.secondConfirm : state.options);

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
            <div className="confirm-dialog__actions">
              {!current.alertOnly && (
                <button className="btn btn--muted" onClick={() => close(false)}>
                  {current.cancelLabel || "ביטול"}
                </button>
              )}
              <button
                className={"btn" + (current.danger ? " btn--danger" : "")}
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
