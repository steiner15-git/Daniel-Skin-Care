import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { IS_LOCAL } from "../data";
import { storeImage, deletePhoto } from "../data/photos";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState(false);

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const stored = await storeImage(file, { folders: [folderName], ensureDriveToken });
      onChange({
        receiptData: stored.localData || null,
        receiptFileId: stored.driveFileId || null,
        receiptMime: stored.mimeType || null,
      });
    } catch {
      setError("צירוף התמונה נכשל. נסי שוב (בענן ייתכן שתידרש התחברות מחדש ל-Google).");
    } finally {
      setBusy(false);
    }
  }

  async function removeReceipt() {
    const fileId = value?.receiptFileId;
    onChange({ receiptData: null, receiptFileId: null, receiptMime: null });
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
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "מצרפת…" : "צירוף תמונה"}
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
      {error && <p className="warn-text">{error}</p>}
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
