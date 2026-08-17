import { useEffect, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function defaultDays() {
  const days = {};
  for (let i = 0; i < 7; i++) {
    const workday = i >= 0 && i <= 4; // א'–ה'
    days[i] = { enabled: workday, start: "09:00", end: "18:00" };
  }
  return days;
}

export default function WorkingHours() {
  const { data, loading, save } = useSettingDoc("workingHours");
  const [days, setDays] = useState(defaultDays());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.days) setDays({ ...defaultDays(), ...data.days });
  }, [data]);

  function update(i, patch) {
    setDays((d) => ({ ...d, [i]: { ...d[i], ...patch } }));
    setSaved(false);
  }

  async function onSave() {
    await save({ days });
    setSaved(true);
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="שעות פעילות" />

      <div className="notice" style={{ marginTop: 0 }}>
        משמש כברירת מחדל להתראה בלבד — תור מחוץ לשעות הפעילות יציג אזהרה ולא יחסום.
      </div>

      <div className="list">
        {DAY_NAMES.map((name, i) => (
          <div key={i} className="card day-row">
            <label className="day-row__toggle">
              <input
                type="checkbox"
                checked={days[i].enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
              <strong>יום {name}</strong>
            </label>
            {days[i].enabled ? (
              <div className="day-row__times">
                <input
                  type="time"
                  value={days[i].start}
                  onChange={(e) => update(i, { start: e.target.value })}
                />
                <span className="muted">עד</span>
                <input
                  type="time"
                  value={days[i].end}
                  onChange={(e) => update(i, { end: e.target.value })}
                />
              </div>
            ) : (
              <span className="muted">סגור</span>
            )}
          </div>
        ))}
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
