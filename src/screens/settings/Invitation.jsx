import { useEffect, useRef, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { DEFAULT_INVITATION_SUBJECT, DEFAULT_INVITATION_BODY } from "../../utils/invite";

const FIELDS = [
  "{שם_לקוחה}",
  "{תאריך}",
  "{שעה}",
  "{סוג_טיפול}",
  "{שם_עסק}",
  "{כתובת_עסק}",
];

const DEFAULT = {
  subject: DEFAULT_INVITATION_SUBJECT,
  body: DEFAULT_INVITATION_BODY,
};

export default function Invitation() {
  const { data, loading, save } = useSettingDoc("invitation");
  const confirmDialog = useConfirm();
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

  // תוקן QA (2026-09): נוסף try/catch.
  async function onSave() {
    try {
      await save(form);
      setSaved(true);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת תוכן הזימון נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    }
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
        <br />
        תוכן זה (גוף ההודעה) משמש גם את זימון ה-WhatsApp במסך "שליחת זימון" —
        ל-WhatsApp אין שדה "נושא" נפרד, רק גוף ההודעה שלמעלה.
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
