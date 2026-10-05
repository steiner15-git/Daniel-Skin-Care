import { useEffect, useRef, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import {
  DEFAULT_INVITATION_SUBJECT,
  DEFAULT_INVITATION_BODY,
  DEFAULT_VOUCHER_SUBJECT,
  DEFAULT_VOUCHER_BODY,
} from "../../utils/invite";

// שדות דינמיים לפי טאב (T-4, T-5): הצ'יפים מציגים רק את הטוקנים הרלוונטיים
// לטאב הפעיל. {טלפון_עסק} ו-{אימייל_עסק} זמינים בשתי התבניות.
const INVITE_FIELDS = [
  "{שם_לקוחה}",
  "{תאריך}",
  "{שעה}",
  "{סוג_טיפול}",
  "{שם_עסק}",
  "{כתובת_עסק}",
  "{טלפון_עסק}",
  "{אימייל_עסק}",
];

const VOUCHER_FIELDS = [
  "{שם_מקבלת}",
  "{שם_קונה}",
  "{סכום_שובר}",
  "{תוקף}",
  "{שם_עסק}",
  "{כתובת_עסק}",
  "{טלפון_עסק}",
  "{אימייל_עסק}",
];

const DEFAULT = {
  subject: DEFAULT_INVITATION_SUBJECT,
  body: DEFAULT_INVITATION_BODY,
  voucherSubject: DEFAULT_VOUCHER_SUBJECT,
  voucherBody: DEFAULT_VOUCHER_BODY,
};

// מסך "תבניות" (T-1): היה "תוכן זימון". הנתיב /settings/invitation וכן מסמך
// ההגדרות "invitation" נשארים — שדות השובר נוספים לאותו מסמך, ללא מיגרציה.
export default function Invitation() {
  const { data, loading, save } = useSettingDoc("invitation");
  const confirmDialog = useConfirm();
  const [form, setForm] = useState(DEFAULT);
  const [tab, setTab] = useState("invite"); // invite | voucher
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (data) setForm({ ...DEFAULT, ...data });
  }, [data]);

  const isVoucher = tab === "voucher";
  const subjectKey = isVoucher ? "voucherSubject" : "subject";
  const bodyKey = isVoucher ? "voucherBody" : "body";
  const fields = isVoucher ? VOUCHER_FIELDS : INVITE_FIELDS;

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  function insertField(token) {
    const current = form[bodyKey] || "";
    const el = bodyRef.current;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    setField(bodyKey, current.slice(0, start) + token + current.slice(end));
  }

  // שמירה אחת לשני הטאבים (T-2), עם try/catch לפי §4.7.1.
  async function onSave() {
    try {
      await save(form);
      setSaved(true);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת התבניות נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    }
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="תבניות" />

      <div className="seg" style={{ marginBottom: 16 }}>
        <button
          className={"seg__btn" + (tab === "invite" ? " on" : "")}
          onClick={() => setTab("invite")}
        >
          תוכן זימון
        </button>
        <button
          className={"seg__btn" + (tab === "voucher" ? " on" : "")}
          onClick={() => setTab("voucher")}
        >
          תוכן שובר
        </button>
      </div>

      <div className="card">
        <div className="field">
          <label>{isVoucher ? "נושא ההודעה (מייל)" : "נושא המייל"}</label>
          <input
            value={form[subjectKey] || ""}
            onChange={(e) => setField(subjectKey, e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>{isVoucher ? "גוף ההודעה" : "גוף המייל"}</label>
          <textarea
            ref={bodyRef}
            rows={isVoucher ? 10 : 9}
            value={form[bodyKey] || ""}
            onChange={(e) => setField(bodyKey, e.target.value)}
          />
        </div>

        <p className="muted" style={{ fontSize: 13, margin: "8px 0 6px" }}>
          הוספת שדה דינמי:
        </p>
        <div className="chips">
          {fields.map((f) => (
            <button key={f} className="chip" onClick={() => insertField(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {isVoucher ? (
        <div className="notice">
          {"{סכום_שובר}"} מוצג כמספר בלבד, בלי סמל מטבע — את ה-₪ יש לכתוב בטקסט מיד אחריו
          (כמו בברירת המחדל). בהודעת השובר מופיע סכום השובר בלבד, לעולם לא מחיר טיפול, עלות או
          רווח. אין בהודעה קישור "הוסף ליומן". אותה הודעה משמשת גם את שליחת ה-WhatsApp (ל-WhatsApp
          אין שדה "נושא").
        </div>
      ) : (
        <div className="notice">
          לפי עקרון הפרטיות — תוכן הזימון לעולם לא כולל מחיר, עלות או רווח. הלקוחה
          מקבלת רק שם קליניקה, טיפול, תאריך ושעה.
          <br />
          תוכן זה (גוף ההודעה) משמש גם את זימון ה-WhatsApp במסך "שליחת זימון" —
          ל-WhatsApp אין שדה "נושא" נפרד, רק גוף ההודעה שלמעלה.
        </div>
      )}

      <div className="save-row">
        {saved && <span className="save-row__ok">נשמר ✓</span>}
        <button className="btn" onClick={onSave}>
          שמירה
        </button>
      </div>
    </>
  );
}
