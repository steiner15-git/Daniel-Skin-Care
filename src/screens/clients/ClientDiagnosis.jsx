import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import DiagnosisForm from "./DiagnosisForm";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { fullName, ageFromBirthday } from "./clientUtils";

export default function ClientDiagnosis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("clients");
  const repo = useRepo("clients");
  const log = useAuditLog();
  const client = items.find((c) => c.id === id);

  const [draft, setDraft] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (client && !ready) {
      setDraft(client.diagnosis || {});
      setReady(true);
    }
  }, [client, ready]);

  if (loading) return <p className="muted">טוען…</p>;
  if (!client) return <div className="empty-state">הלקוחה לא נמצאה.</div>;

  async function save() {
    // עדכון דורס — אין שמירת היסטוריית גרסאות (לפי החלטת PRD)
    await repo.update(id, { diagnosis: draft });
    await log({
      action: "client_diagnosis_edit",
      entity: { type: "client", id, desc: fullName(client) },
    });
    navigate(`/clients/${id}`);
  }

  const age = ageFromBirthday(client.birthday);

  return (
    <>
      <ScreenHeader
        title="עריכת אבחון עור"
        action={
          <button className="btn btn--ghost" onClick={() => navigate(`/clients/${id}`)}>
            ביטול
          </button>
        }
      />

      <div className="notice" style={{ marginTop: 0 }}>
        {fullName(client)}
        {age != null && ` · גיל ${age}`}
      </div>

      <DiagnosisForm value={draft} onChange={setDraft} />

      <div className="save-row">
        <button className="btn btn--muted" onClick={() => navigate(`/clients/${id}`)}>
          ביטול
        </button>
        <button className="btn" onClick={save}>
          אישור שמירה
        </button>
      </div>
    </>
  );
}
