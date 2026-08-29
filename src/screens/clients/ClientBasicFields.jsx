import DateField from "../../components/DateField";

const SOURCES = ["המלצה", "אינסטגרם", "פייסבוק", "גוגל", "פרסום ממומן", "פלאייר", "לקוחה חוזרת", "רשת חברתית אחרת", "אחר"];

// שדות פרטים בסיסיים (שלב 1). רכיב מבוקר — משמש בהוספה ובעריכה.
export default function ClientBasicFields({ value, onChange, duplicatePhone }) {
  function set(k, v) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="card">
      <div className="row-2">
        <div className="field">
          <label>שם פרטי</label>
          <input value={value.firstName || ""} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div className="field">
          <label>שם משפחה</label>
          <input value={value.lastName || ""} onChange={(e) => set("lastName", e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>טלפון</label>
        <input
          type="tel"
          dir="ltr"
          value={value.phone || ""}
          onChange={(e) => set("phone", e.target.value)}
        />
        {duplicatePhone && (
          <p className="warn-text">⚠ מספר טלפון זה כבר קיים אצל לקוחה אחרת (ניתן להמשיך).</p>
        )}
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <label>אימייל</label>
        <input
          type="email"
          dir="ltr"
          value={value.email || ""}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>
      {/* צ'קבוקס הזימון ממוקם מיד מתחת לשדה האימייל (דרישת UX) */}
      <label className="inline-check">
        <input
          type="checkbox"
          checked={!!value.emailInvite}
          onChange={(e) => set("emailInvite", e.target.checked)}
        />
        <span>מעוניינת לקבל זימון תור במייל</span>
      </label>

      <div className="row-2" style={{ marginTop: 14 }}>
        <div className="field">
          <label>תאריך לידה</label>
          <DateField value={value.birthday || ""} onChange={(v) => set("birthday", v)} />
        </div>
        <div className="field">
          <label>מקור הגעה</label>
          <select value={value.source || ""} onChange={(e) => set("source", e.target.value)}>
            <option value="">— בחרי —</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>הערות פנימיות חסויות (גלוי רק לך, לעולם לא נשלח החוצה)</label>
        <textarea
          rows={3}
          value={value.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </div>
  );
}
