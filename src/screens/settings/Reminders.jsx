import { useEffect, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useReminderSettings } from "../../data/useReminderSettings";

export default function Reminders() {
  const { data, loading, save } = useReminderSettings();
  const [form, setForm] = useState(data);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(data);
  }, [data]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  }

  async function onSave() {
    await save(form);
    setSaved(true);
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="תזכורות" />

      <div className="card">
        <div className="field" style={{ marginBottom: 6 }}>
          <label>מספר ימים ממועד התור עד הצגת תזכורת תשלום</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.paymentVerificationDays}
            onChange={(e) => set({ paymentVerificationDays: Number(e.target.value) || 0 })}
          />
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
          אם הכנסה לא סומנה כ"שולם" בתוך פרק הזמן הזה — תוצג תזכורת פסיבית
          בתוך האפליקציה בלבד.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>מספר חודשים מהביקור האחרון עד הצגת תזכורת "לקוחה לא ביקרה"</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.inactiveClientMonths}
            onChange={(e) => set({ inactiveClientMonths: Number(e.target.value) || 0 })}
          />
        </div>
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
          חלה רק על לקוחות פעילות (לא בארכיון) עם לפחות תור אחד שבוצע. לקוחה
          שמעולם לא היה לה תור שבוצע לא תופיע בתזכורת זו.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>באדג'ים בבר הניווט התחתון</h3>
        <label className="inline-check" style={{ marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={!!form.showPendingBadge}
            onChange={(e) => set({ showPendingBadge: e.target.checked })}
          />
          <span>הצגת מספר תורים "ממתינים לסגירה" על אייקון היומן</span>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={!!form.showUnpaidBadge}
            onChange={(e) => set({ showUnpaidBadge: e.target.checked })}
          />
          <span>הצגת מספר הכנסות "לא-מאומתות" על אייקון ניהול העסק</span>
        </label>
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
