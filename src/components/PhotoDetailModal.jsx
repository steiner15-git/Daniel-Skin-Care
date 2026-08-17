import { useState } from "react";
import { useImageSrc } from "../data/useImageSrc";
import ImageModal from "./ImageModal";

// מודל פרטי תמונה משותף לאלבום הלקוחה ולאלבום הכללי:
// תצוגת התמונה + עריכת שיוך-לקוחה (אופציונלי, רק כשמועברת רשימת clients)
// + תאריך/סוג טיפול/תיאור + מחיקה.
export default function PhotoDetailModal({
  photo,
  treatments = [],
  clients,
  clientName,
  onSave,
  onDelete,
  onClose,
}) {
  const editableClient = Array.isArray(clients);
  const src = useImageSrc(photo.localData, photo.driveFileId, true);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const [clientId, setClientId] = useState(photo.clientId || "");
  const [date, setDate] = useState(photo.date || "");
  const [treatmentName, setTreatmentName] = useState(photo.treatmentName || "");
  const [description, setDescription] = useState(photo.description || "");
  const dirty =
    (editableClient && clientId !== (photo.clientId || "")) ||
    date !== (photo.date || "") ||
    treatmentName !== (photo.treatmentName || "") ||
    description !== (photo.description || "");

  async function sharePhoto() {
    if (!src) return;
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], `photo-${photo.date || "image"}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: photo.description || "תמונה" });
      } else {
        await navigator.share({ title: photo.description || "תמונה" });
      }
    } catch {
      /* המשתמשת ביטלה את השיתוף או שאינו נתמך */
    }
  }

  return (
    <ImageModal src={src} onClose={onClose}>
      {editableClient ? (
        <div className="field" style={{ marginTop: 12 }}>
          <label>לקוחה</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— ללא שיוך —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        clientName && (
          <div className="read-row" style={{ marginTop: 12 }}>
            <span className="muted">לקוחה</span>
            <span>{clientName}</span>
          </div>
        )
      )}
      <div className="field">
        <label>תאריך</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>סוג טיפול</label>
        <select value={treatmentName} onChange={(e) => setTreatmentName(e.target.value)}>
          <option value="">— ללא —</option>
          {treatments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>תיאור</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="save-row" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn--muted" onClick={onDelete}>
            מחיקה
          </button>
          {canShare && (
            <button className="btn btn--ghost" disabled={!src} onClick={sharePhoto}>
              שיתוף
            </button>
          )}
        </div>
        <button
          className="btn"
          disabled={!dirty}
          onClick={async () => {
            const patch = { date, treatmentName, description };
            if (editableClient) patch.clientId = clientId;
            await onSave(photo.id, patch);
            onClose();
          }}
        >
          שמירה
        </button>
      </div>
    </ImageModal>
  );
}
