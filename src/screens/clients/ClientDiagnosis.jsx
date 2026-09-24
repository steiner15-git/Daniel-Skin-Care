import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import DiagnosisForm from "./DiagnosisForm";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { fullName, ageFromBirthday } from "./clientUtils";

export default function ClientDiagnosis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("clients");
  const repo = useRepo("clients");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const client = items.find((c) => c.id === id);

  const [draft, setDraft] = useState({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (client && !ready) {
      setDraft(client.diagnosis || {});
      setReady(true);
    }
  }, [client, ready]);

  if (loading) return <p className="muted">טוען…</p>;
  if (!client) return <div className="empty-state">הלקוחה לא נמצאה.</div>;

  // תוקן QA (2026-09): נוסף try/catch. הטופס ארוך (כל שאלון האבחון) — לפני
  // התיקון, כשל רשת/Firestore באמצע שמירה היה גורם לאיבוד שקט של כל
  // העריכה בלי שום הודעה, כי לא היה ניווט חזרה אך גם לא הייתה הודעת שגיאה
  // שמסבירה למה כלום לא קרה.
  async function save() {
    setSaving(true);
    try {
      // עדכון דורס — אין שמירת היסטוריית גרסאות (לפי החלטת PRD)
      await repo.update(id, { diagnosis: draft });
      await log({
        action: "client_diagnosis_edit",
        entity: { type: "client", id, desc: fullName(client) },
      });
      navigate(`/clients/${id}`);
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת האבחון נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    }
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
        <button className="btn" disabled={saving} onClick={save}>
          {saving ? "שומרת…" : "אישור שמירה"}
        </button>
      </div>
    </>
  );
}
