import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
import { fullName } from "./clientUtils";

export default function ClientArchive() {
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("clients");
  const repo = useRepo("clients");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  // לקוחות שסומנו למחיקה סופית ל-Undo (ראו ToastProvider). לאחר חלון ה-5
  // שניות המחיקה עדיין בלתי-הפיכה כפי שהייתה — ה-Undo נותן רק חלון חרטה קצר.
  const [hiddenIds, setHiddenIds] = useState(() => new Set());

  const archived = items.filter((c) => c.archived && !hiddenIds.has(c.id));

  async function restore(c) {
    await repo.update(c.id, { archived: false });
    await log({
      action: "client_restore",
      entity: { type: "client", id: c.id, desc: fullName(c) },
    });
  }

  async function permanentDelete(c) {
    const ok = await confirmDialog({
      title: "מחיקה סופית",
      message: `למחוק סופית את ${fullName(c)}? פעולה זו בלתי הפיכה.`,
      confirmLabel: "המשך",
      danger: true,
      secondConfirm: {
        title: "אישור סופי",
        message: "כל נתוני הלקוחה יימחקו לצמיתות. להמשיך?",
        confirmLabel: "מחיקה סופית",
        danger: true,
      },
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(c.id));
    toast.showUndo({
      message: `${fullName(c)} נמחקה לצמיתות`,
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(c.id);
          return next;
        }),
      onExpire: async () => {
        await repo.remove(c.id);
        await log({
          action: "client_delete_permanent",
          entity: { type: "client", id: c.id, desc: fullName(c) },
        });
      },
    });
  }

  return (
    <>
      <ScreenHeader
        title="ארכיון לקוחות"
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/clients")}>
            חזרה
          </button>
        }
      />

      {loading ? (
        <p className="muted">טוען…</p>
      ) : archived.length === 0 ? (
        <div className="empty-state">הארכיון ריק.</div>
      ) : (
        <div className="list">
          {archived.map((c) => (
            <div key={c.id} className="card list-item">
              <div className="list-item__main">
                <strong>{fullName(c)}</strong>
                {c.phone && <span className="muted sensitive" dir="ltr">{c.phone}</span>}
              </div>
              <div className="list-item__actions">
                <button className="btn btn--ghost" onClick={() => restore(c)}>
                  שחזור
                </button>
                <button className="btn btn--danger" onClick={() => permanentDelete(c)}>
                  מחיקה סופית
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
