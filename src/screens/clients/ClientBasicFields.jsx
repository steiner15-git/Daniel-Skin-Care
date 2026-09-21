import { useMemo, useState } from "react";
import DateField from "../../components/DateField";
import { fullName, REFERRAL_SOURCE } from "./clientUtils";

const SOURCES = ["המלצה", "אינסטגרם", "פייסבוק", "גוגל", "פרסום ממומן", "פלאייר", "לקוחה חוזרת", "רשת חברתית אחרת", "אחר"];

// Phase 4 §6: כאשר מקור ההגעה הוא "המלצה" (REFERRAL_SOURCE, מוגדר ב-
// clientUtils.js), מוצג שדה נוסף לבחירת הלקוחה המפנה מתוך המאגר — מרחיב את
// שדה ה-source הטקסטואלי הקיים לקישור קונקרטי בין שתי רשומות לקוחה
// (client.referredByClientId).

// שדות פרטים בסיסיים (שלב 1). רכיב מבוקר — משמש בהוספה ובעריכה.
// clients: רשימת הלקוחות המלאה, לצורך חיפוש הלקוחה המפנה (Phase 4 §6).
// excludeClientId: מזהה הלקוחה הנוכחית (בעריכה בלבד) — נמנעת מהצעה עצמית.
export default function ClientBasicFields({
  value,
  onChange,
  duplicatePhone,
  clients = [],
  excludeClientId,
}) {
  function set(k, v) {
    onChange({ ...value, [k]: v });
  }

  // מצב חיפוש הלקוחה המפנה — שדה UI זמני בלבד, לא נשמר על הרשומה עצמה
  // (הערך הנשמר הוא רק referredByClientId שנבחר).
  const [referralQuery, setReferralQuery] = useState("");

  // שינוי מקור ההגעה. מעבר מ"המלצה" למקור אחר מאפס את הלקוחה המפנה (ואת
  // שדה החיפוש שלה) באותה פעולה — כך שלא נשארת הפניה ללא מקור "המלצה".
  function setSource(next) {
    if (next !== REFERRAL_SOURCE) {
      onChange({ ...value, source: next, referredByClientId: "" });
      setReferralQuery("");
    } else {
      onChange({ ...value, source: next });
    }
  }

  const referredClient = useMemo(
    () => clients.find((c) => c.id === value.referredByClientId) || null,
    [clients, value.referredByClientId]
  );

  const filteredReferrers = useMemo(() => {
    const term = referralQuery.trim();
    if (!term) return [];
    return clients
      .filter((c) => c.id !== excludeClientId && !c.archived && fullName(c).includes(term))
      .slice(0, 6);
  }, [clients, referralQuery, excludeClientId]);

  function pickReferrer(c) {
    set("referredByClientId", c.id);
    setReferralQuery("");
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

      <div className="field" style={{ marginBottom: 8 }}>
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
      {/* Phase 4 §7 — צ'קבוקס העדפת WhatsApp ממוקם מיד מתחת לשדה הטלפון,
          באותו דפוס בדיוק כמו צ'קבוקס האימייל מתחת לשדה האימייל למטה. */}
      <label className="inline-check">
        <input
          type="checkbox"
          checked={!!value.whatsappInvite}
          onChange={(e) => set("whatsappInvite", e.target.checked)}
        />
        <span>מעוניינת לקבל זימון תור בוואטסאפ</span>
      </label>

      <div className="field" style={{ marginBottom: 8, marginTop: 14 }}>
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
          <select value={value.source || ""} onChange={(e) => setSource(e.target.value)}>
            <option value="">— בחרי —</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Phase 4 §6 — לקוחה מפנה: מוצג רק כשמקור ההגעה הוא "המלצה" */}
      {value.source === REFERRAL_SOURCE && (
        <div className="field">
          <label>הופנתה ע״י (אופציונלי)</label>
          {referredClient ? (
            <div className="picked">
              <strong>{fullName(referredClient)}</strong>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => set("referredByClientId", "")}
              >
                שינוי
              </button>
            </div>
          ) : (
            <>
              <input
                placeholder="חיפוש לקוחה מפנה"
                value={referralQuery}
                onChange={(e) => setReferralQuery(e.target.value)}
              />
              {filteredReferrers.length > 0 && (
                <div className="suggest">
                  {filteredReferrers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="suggest__item"
                      onClick={() => pickReferrer(c)}
                    >
                      {fullName(c)}{" "}
                      {c.phone && (
                        <span className="muted" dir="ltr">
                          {c.phone}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

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
