import { useMemo, useRef, useState } from "react";
import { useCollectionData, useRepo, useSettingDoc, IS_LOCAL } from "../../data";
import { useAuth } from "../../auth/AuthProvider";
import { deletePhoto } from "../../data/photos";
import { useDriveUpload } from "../../data/useDriveUpload";
import { useImageSrc } from "../../data/useImageSrc";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
import { dateInputValue } from "../../utils/datetime";
import { SkeletonAlbumGrid } from "../../components/Skeleton";
import PhotoDetailModal from "../../components/PhotoDetailModal";

export default function ClientAlbum({ clientId, clientName }) {
  const { items, loading } = useCollectionData("photos");
  const repo = useRepo("photos");
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const treatmentNames = (treatmentsDoc?.items ?? []).map((t) => t.name);
  const { ensureDriveToken } = useAuth();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const fileRef = useRef(null);
  const driveUpload = useDriveUpload();
  const [openId, setOpenId] = useState(null);
  // תמונות שנמחקו אופטימית ל-Undo (מוסתרות מה-UI, נמחקות בפועל רק לאחר 5
  // שניות אם לא נלחץ "ביטול" — ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const mine = useMemo(
    () =>
      items
        .filter((p) => p.clientId === clientId && !hiddenIds.has(p.id))
        .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [items, clientId, hiddenIds]
  );

  const openPhoto = mine.find((p) => p.id === openId) || null;

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const stored = await driveUpload.upload(file, ["Clinic_Photos", clientName]);
      await repo.add({
        clientId,
        date: dateInputValue(new Date()),
        description: "",
        localData: stored.localData || null,
        driveFileId: stored.driveFileId || null,
        mimeType: stored.mimeType || "image/jpeg",
      });
    } catch {
      /* הכשל מטופל ע"י driveUpload — הודעה + כפתור פעולה מוצגים למטה */
    }
  }

  async function removePhoto(p) {
    const ok = await confirmDialog({
      title: "מחיקת תמונה",
      message: "למחוק את התמונה?",
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setOpenId(null);
    setHiddenIds((prev) => new Set(prev).add(p.id));
    toast.showUndo({
      message: "התמונה נמחקה",
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        }),
      onExpire: async () => {
        await repo.remove(p.id);
        if (!IS_LOCAL && p.driveFileId) {
          try {
            const token = await ensureDriveToken();
            if (token) await deletePhoto(token, p.driveFileId);
          } catch {
            /* מחיקת הקובץ מ-Drive נכשלה — המטא-דאטה כבר הוסרה */
          }
        }
      },
    });
  }

  return (
    <>
      <div className="save-row" style={{ marginTop: 0 }}>
        <button className="btn" disabled={driveUpload.busy} onClick={() => fileRef.current?.click()}>
          {driveUpload.label || "הוספת תמונה"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      </div>

      {driveUpload.phase === "error" && (
        <div className="upload-error">
          <p className="warn-text">
            {driveUpload.errorReason === "no-token"
              ? "⚠ העלאת התמונה נכשלה — נדרשת התחברות מחדש ל-Google."
              : "⚠ העלאת התמונה נכשלה. בדקי את החיבור לרשת ונסי שוב."}
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

      {loading ? (
        <SkeletonAlbumGrid count={6} />
      ) : mine.length === 0 ? (
        <div className="empty-state" style={{ padding: 16 }}>
          עדיין אין תמונות בלקוחה זו.
        </div>
      ) : (
        <div className="album-grid">
          {mine.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </div>
      )}

      {openPhoto && (
        <PhotoDetailModal
          photo={openPhoto}
          treatments={treatmentNames}
          onClose={() => setOpenId(null)}
          onSave={repo.update}
          onDelete={() => removePhoto(openPhoto)}
        />
      )}
    </>
  );
}

function Thumb({ photo, onOpen }) {
  const src = useImageSrc(photo.localData, photo.driveFileId);
  return (
    <button className="album-thumb" onClick={onOpen} title={photo.description || photo.date}>
      {src ? (
        <img src={src} alt={photo.description || "תמונה"} />
      ) : (
        <span className="muted">טוען…</span>
      )}
      {(photo.date || photo.treatmentName || photo.description) && (
        <span className="album-thumb__date">
          {[photo.date, photo.treatmentName, photo.description].filter(Boolean).join(" · ")}
        </span>
      )}
    </button>
  );
}
