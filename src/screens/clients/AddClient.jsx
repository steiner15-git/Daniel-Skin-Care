import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import ClientBasicFields from "./ClientBasicFields";
import DiagnosisForm from "./DiagnosisForm";
import { useCollectionData, useRepo } from "../../data";
import { normalizePhone, ageFromBirthday } from "./clientUtils";

export default function AddClient() {
  const navigate = useNavigate();
  const { items: clients } = useCollectionData("clients");
  const repo = useRepo("clients");

  const [step, setStep] = useState(1);
  const [basic, setBasic] = useState({ emailInvite: false });
  const [diagnosis, setDiagnosis] = useState({});
  const [saving, setSaving] = useState(false);

  const duplicatePhone = useMemo(() => {
    const p = normalizePhone(basic.phone);
    if (!p) return false;
    return clients.some((c) => normalizePhone(c.phone) === p);
  }, [basic.phone, clients]);

  const canProceed = (basic.firstName || "").trim().length > 0;

  async function save() {
    setSaving(true);
    const id = await repo.add({
      ...basic,
      diagnosis,
      archived: false,
    });
    navigate(`/clients/${id}`, { replace: true });
  }

  return (
    <>
      <ScreenHeader
        title={step === 1 ? "לקוחה חדשה · פרטים" : "לקוחה חדשה · אבחון עור"}
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/clients")}>
            ביטול
          </button>
        }
      />

      <div className="stepper">
        <span className={step === 1 ? "on" : ""}>1 · פרטים</span>
        <span className={step === 2 ? "on" : ""}>2 · אבחון עור</span>
      </div>

      {step === 1 ? (
        <>
          <ClientBasicFields
            value={basic}
            onChange={setBasic}
            duplicatePhone={duplicatePhone}
          />
          <div className="save-row">
            <button className="btn" disabled={!canProceed} onClick={() => setStep(2)}>
              המשך לאבחון →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="notice" style={{ marginTop: 0 }}>
            נשאב אוטומטית: {basic.firstName} {basic.lastName}
            {ageFromBirthday(basic.birthday) != null &&
              ` · גיל ${ageFromBirthday(basic.birthday)}`}
          </div>
          <DiagnosisForm value={diagnosis} onChange={setDiagnosis} />
          <div className="save-row">
            <button className="btn btn--muted" onClick={() => setStep(1)}>
              → חזרה לפרטים
            </button>
            <button className="btn" disabled={saving} onClick={save}>
              {saving ? "שומרת…" : "שמירת לקוחה"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
