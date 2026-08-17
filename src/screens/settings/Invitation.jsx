import { useEffect, useRef, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";

const FIELDS = [
  "{שם_לקוחה}",
  "{תאריך}",
  "{שעה}",
  "{סוג_טיפול}",
  "{שם_עסק}",
  "{כתובת_עסק}",
];

const DEFAULT = {
  subject: "תזכורת לתור ב{שם_עסק}",
  body:
    "שלום {שם_לקוחה},\n" +
    "זהו זימון לתור ל{סוג_טיפול}.\n" +
    "תאריך: {תאריך}\n" +
    "שעה: {שעה}\n" +
    "כתובת: {כתובת_עסק}\n\n" +
    "נתראה!\n{שם_עסק}",
};

export default function Invitation() {
  const { data, loading, save } = useSettingDoc("invitation");
  const [form, setForm] = useState(DEFAULT);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (data) setForm({ ...DEFAULT, ...data });
  }, [data]);

  function insertField(token) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? form.body.length;
    const end = el?.selectionEnd ?? form.body.length;
    const next = form.body.slice(0, start) + token + form.body.slice(end);
    setForm((f) => ({ ...f, body: next }));
    setSaved(false);
  }

  async function onSave() {
    await save(form);
    setSaved(true);
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="תוכן זימון" />

      <div className="card">
        <div className="field">
          <label>נושא המייל</label>
          <input
            value={form.subject}
            onChange={(e) => {
              setForm({ ...form, subject: e.target.value });
              setSaved(false);
            }}
          />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>גוף המייל</label>
          <textarea
            ref={bodyRef}
            rows={9}
            value={form.body}
            onChange={(e) => {
              setForm({ ...form, body: e.target.value });
              setSaved(false);
            }}
          />
        </div>

        <p className="muted" style={{ fontSize: 13, margin: "8px 0 6px" }}>
          הוספת שדה דינמי:
        </p>
        <div className="chips">
          {FIELDS.map((f) => (
            <button key={f} className="chip" onClick={() => insertField(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="notice">
        לפי עקרון הפרטיות — תוכן הזימון לעולם לא כולל מחיר, עלות או רווח. הלקוחה
        מקבלת רק שם קליניקה, טיפול, תאריך ושעה.
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
