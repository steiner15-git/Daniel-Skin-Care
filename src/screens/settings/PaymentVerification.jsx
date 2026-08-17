import { useEffect, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";

export default function PaymentVerification() {
  const { data, loading, save } = useSettingDoc("paymentVerification");
  const [days, setDays] = useState(7);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.days != null) setDays(data.days);
  }, [data]);

  async function onSave() {
    await save({ days: Number(days) || 0 });
    setSaved(true);
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="אימות תשלום" />

      <div className="card">
        <div className="field" style={{ marginBottom: 6 }}>
          <label>מספר ימים ממועד התור עד הצגת תזכורת תשלום</label>
          <input
            type="number"
            inputMode="numeric"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          אם הכנסה לא סומנה כ"שולם" בתוך פרק הזמן הזה — תוצג תזכורת פסיבית בתוך
          האפליקציה בלבד.
        </p>
      </div>

      <div className="save-row">
        {saved && <span className="save-row__ok">נשמר ✓</span>}
        <button className="btn" onClick={onSave}>
          שמירה
        </button>
      </div>
    </>
  );
}
