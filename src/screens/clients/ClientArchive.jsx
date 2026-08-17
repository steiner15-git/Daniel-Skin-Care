import { useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { fullName } from "./clientUtils";

export default function ClientArchive() {
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("clients");
  const repo = useRepo("clients");
  const log = useAuditLog();

  const archived = items.filter((c) => c.archived);

  async function restore(c) {
    await repo.update(c.id, { archived: false });
    await log({
      action: "client_restore",
      entity: { type: "client", id: c.id, desc: fullName(c) },
    });
  }

  async function permanentDelete(c) {
    if (!confirm(`למחוק סופית את ${fullName(c)}? פעולה זו בלתי הפיכה.`)) return;
    if (!confirm("אישור סופי: כל נתוני הלקוחה יימחקו לצמיתות. להמשיך?")) return;
    await repo.remove(c.id);
    await log({
      action: "client_delete_permanent",
      entity: { type: "client", id: c.id, desc: fullName(c) },
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
                {c.phone && <span className="muted" dir="ltr">{c.phone}</span>}
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
