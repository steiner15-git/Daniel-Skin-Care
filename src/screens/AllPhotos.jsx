import { useMemo, useRef, useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import PhotoDetailModal from "../components/PhotoDetailModal";
import { useCollectionData, useRepo, useSettingDoc, IS_LOCAL } from "../data";
import { useAuth } from "../auth/AuthProvider";
import { storeImage, deletePhoto } from "../data/photos";
import { useImageSrc } from "../data/useImageSrc";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { useToast } from "../context/ToastProvider";
import { fullName } from "./clients/clientUtils";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AllPhotos() {
  const { items: photos, loading } = useCollectionData("photos");
  const { items: clients } = useCollectionData("clients");
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const repo = useRepo("photos");
  const { ensureDriveToken } = useAuth();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [openId, setOpenId] = useState(null);

  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [treatmentFilter, setTreatmentFilter] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  // תמונות שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const treatmentNames = (treatmentsDoc?.items ?? []).map((t) => t.name);

  const clientName = useMemo(() => {
    const map = {};
    for (const c of clients) map[c.id] = fullName(c);
    return map;
  }, [clients]);

  const view = useMemo(() => {
    const term = q.trim().toLowerCase();
    return photos
      .map((p) => ({ ...p, clientName: p.clientId ? clientName[p.clientId] || "לקוחה לא ידועה" : "" }))
      .filter((p) => {
        if (hiddenIds.has(p.id)) return false;
        if (clientFilter && p.clientId !== clientFilter) return false;
        if (treatmentFilter && (p.treatmentName || "") !== treatmentFilter) return false;
        if (term) {
          const hay = `${p.clientName} ${p.description || ""} ${p.treatmentName || ""}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmp = (a.date || "").localeCompare(b.date || "");
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [photos, clientName, q, clientFilter, treatmentFilter, sortDir, hiddenIds]);

  const openPhoto = view.find((p) => p.id === openId) || null;

  const clientsWithPhotos = useMemo(() => {
    const ids = new Set(photos.map((p) => p.clientId));
    return clients
      .filter((c) => ids.has(c.id))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "he"));
  }, [photos, clients]);

  const clientOptions = useMemo(
    () =>
      clients
        .filter((c) => !c.archived)
        .sort((a, b) => fullName(a).localeCompare(fullName(b), "he"))
        .map((c) => ({ id: c.id, name: fullName(c) })),
    [clients]
  );

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const stored = await storeImage(file, {
        folders: ["Clinic_Photos", "ללא שיוך"],
        ensureDriveToken,
      });
      // תמונה חדשה נוצרת ללא שיוך; החלונית שנפתחת מיד מאפשרת למלא לקוחה/פרטים.
      const newId = await repo.add({
        clientId: "",
        date: todayInput(),
        treatmentName: "",
        description: "",
        localData: stored.localData || null,
        driveFileId: stored.driveFileId || null,
        mimeType: stored.mimeType || "image/jpeg",
      });
      setOpenId(newId);
    } catch {
      setError("העלאת התמונה נכשלה. נסי שוב (בענן ייתכן שתידרש התחברות מחדש ל-Google).");
    } finally {
      setBusy(false);
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
      <ScreenHeader title="אלבום תמונות" />

      <div className="album-add">
        <button
          className="btn btn--ghost btn--sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "מעלה…" : "+ הוספת תמונה"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
      </div>
      {error && <p className="warn-text">{error}</p>}

      <div className="toolbar">
        <input
          placeholder="חיפוש: לקוחה / תיאור / טיפול"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="toolbar__row">
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">כל הלקוחות</option>
            {clientsWithPhotos.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
              </option>
            ))}
          </select>
          <select value={treatmentFilter} onChange={(e) => setTreatmentFilter(e.target.value)}>
            <option value="">כל הטיפולים</option>
            {treatmentNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
            <option value="desc">חדש לישן</option>
            <option value="asc">ישן לחדש</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : view.length === 0 ? (
        <div className="empty-state">אין תמונות התואמות לסינון.</div>
      ) : (
        <div className="album-grid">
          {view.map((p) => (
            <Thumb key={p.id} photo={p} onOpen={() => setOpenId(p.id)} />
          ))}
        </div>
      )}

      {openPhoto && (
        <PhotoDetailModal
          photo={openPhoto}
          treatments={treatmentNames}
          clients={clientOptions}
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
  const caption = [photo.date, photo.treatmentName].filter(Boolean).join(" · ");
  return (
    <div className="album-item">
      <button className="album-thumb" onClick={onOpen} title={photo.description || photo.clientName}>
        {src ? (
          <img src={src} alt={photo.description || "תמונה"} />
        ) : (
          <span className="muted">טוען…</span>
        )}
        {caption && <span className="album-thumb__date">{caption}</span>}
      </button>
      <span className="album-item__client">{photo.clientName || "— ללא שיוך —"}</span>
    </div>
  );
}
