import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { IS_LOCAL } from "../data";
import { deletePhoto } from "../data/photos";
import { useDriveUpload } from "../data/useDriveUpload";
import { useImageSrc } from "../data/useImageSrc";
import ImageModal from "./ImageModal";

export function hasReceipt(r) {
  return !!(r?.receiptData || r?.receiptFileId);
}

function ReceiptModal({ value, onClose }) {
  const src = useImageSrc(value?.receiptData, value?.receiptFileId, true);
  return <ImageModal src={src} onClose={onClose} />;
}

// שדה צירוף תמונת חשבונית לטופס הכנסה/הוצאה — ידני, ללא AI.
export default function ReceiptField({ value, onChange, folderName = "Invoices" }) {
  const { ensureDriveToken } = useAuth();
  const fileRef = useRef(null);
  const [viewing, setViewing] = useState(false);
  const driveUpload = useDriveUpload();

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const stored = await driveUpload.upload(file, [folderName]);
      onChange({
        receiptData: stored.localData || null,
        receiptFileId: stored.driveFileId || null,
        receiptMime: stored.mimeType || null,
      });
    } catch {
      /* הכשל מטופל ע"י driveUpload — הודעה + כפתור פעולה מוצגים למטה */
    }
  }

  async function removeReceipt() {
    const fileId = value?.receiptFileId;
    onChange({ receiptData: null, receiptFileId: null, receiptMime: null });
    driveUpload.reset();
    if (!IS_LOCAL && fileId) {
      try {
        const token = await ensureDriveToken();
        if (token) await deletePhoto(token, fileId);
      } catch {
        /* מחיקה מ-Drive נכשלה — הקישור כבר הוסר מהרשומה */
      }
    }
  }

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>תמונה (אופציונלי)</label>
      {hasReceipt(value) ? (
        <div className="picked">
          <span className="badge badge--info">📎 תמונה מצורפת</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn btn--ghost" onClick={() => setViewing(true)}>
              צפייה
            </button>
            <button className="btn btn--muted" onClick={removeReceipt}>
              הסרה
            </button>
          </span>
        </div>
      ) : (
        <button
          className="btn btn--ghost"
          disabled={driveUpload.busy}
          onClick={() => fileRef.current?.click()}
        >
          {driveUpload.label || "צירוף תמונה"}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPick}
      />
      {driveUpload.phase === "error" && (
        <div className="upload-error">
          <p className="warn-text" style={{ marginTop: 8 }}>
            {driveUpload.errorReason === "no-token"
              ? "⚠ צירוף התמונה נכשל — נדרשת התחברות מחדש ל-Google."
              : "⚠ צירוף התמונה נכשל. בדקי את החיבור לרשת ונסי שוב."}
          </p>
          <div className="upload-error__actions">
            {driveUpload.errorReason === "no-token" ? (
              <button className="btn btn--sm" onClick={() => driveUpload.reconnect()}>
                התחברות מחדש
              </button>
            ) : (
              <button className="btn btn--sm" onClick={() => driveUpload.retry()}>
                נסי שוב
              </button>
            )}
            <button className="btn btn--muted btn--sm" onClick={() => driveUpload.reset()}>
              ביטול
            </button>
          </div>
        </div>
      )}
      {viewing && <ReceiptModal value={value} onClose={() => setViewing(false)} />}
    </div>
  );
}

// סימון "קיימת חשבונית" ברשימות — צפייה בלחיצה. לא מציג preview עד ללחיצה.
export function ReceiptBadge({ value }) {
  const [open, setOpen] = useState(false);
  if (!hasReceipt(value)) return null;
  return (
    <>
      <button
        className="receipt-chip"
        title="צפייה בתמונה"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        📎 תמונה
      </button>
      {open && <ReceiptModal value={value} onClose={() => setOpen(false)} />}
    </>
  );
}
