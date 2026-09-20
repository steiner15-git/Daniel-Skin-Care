import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc } from "../../data";
import {
  fillTemplate,
  inviteTokens,
  mailtoUrl,
  gcalUrl,
  whatsappUrl,
  DEFAULT_INVITATION_SUBJECT,
  DEFAULT_INVITATION_BODY,
} from "../../utils/invite";
import { formatDateTime } from "../../utils/datetime";

export default function SendInvite() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from === "appointments" ? "appointments" : "calendar";

  const { items: appts, loading } = useCollectionData("appointments");
  const { items: clients } = useCollectionData("clients");
  const repo = useRepo("appointments");
  const { data: business } = useSettingDoc("business");
  const { data: invitation } = useSettingDoc("invitation");

  const appt = appts.find((a) => a.id === id);

  function goBack() {
    navigate(from === "appointments" ? "/appointments" : "/calendar");
  }

  if (loading) return <p className="muted">טוען…</p>;
  if (!appt)
    return (
      <>
        <ScreenHeader title="שליחת זימון" />
        <div className="empty-state">התור לא נמצא.</div>
      </>
    );

  // Phase 4 §7 — טלפון: ללקוחה קיימת נשאב מכרטיס הלקוחה (הוא לא נשמר על
  // רשומת התור עבור לקוחה קיימת); ללקוחה שהוזנה ידנית appt.phone כבר מכיל
  // אותו ישירות (ראו AppointmentForm.jsx).
  const client = appt.clientId ? clients.find((c) => c.id === appt.clientId) : null;
  const phone = client?.phone || appt.phone || "";

  const tokens = inviteTokens({ business, clientName: appt.clientName, appt });
  // אם מסך ההגדרות "תוכן זימון" מעולם לא נשמר בפועל (המסמך לא קיים ב-Firestore),
  // invitation?.subject/body הם undefined — נופלים לברירת מחדל מלאה בקוד, כדי
  // שהמייל תמיד יכלול את כל פרטי התור ולא רק את הקישור ליומן.
  const subject = fillTemplate(invitation?.subject || DEFAULT_INVITATION_SUBJECT, tokens);
  const baseBody = fillTemplate(invitation?.body || DEFAULT_INVITATION_BODY, tokens);

  const title = `${appt.treatmentName} · ${business?.name || "קליניקה"}`;
  const calendarLink = gcalUrl({
    title,
    start: appt.start,
    durationMin: appt.durationMin,
    details: appt.treatmentName, // ללא מחיר — פרטיות
    location: business?.address || "",
  });

  // הקישור נכנס לגוף ההודעה — לחיצה אחת של הלקוחה מוסיפה את התור ליומן שלה.
  // אותו טקסט משמש גם למייל וגם להודעת WhatsApp (ל-WhatsApp אין נושא נפרד).
  const body = `${baseBody}\n\nלהוספת התור ליומן שלך:\n${calendarLink}`;

  function openMail() {
    const url = mailtoUrl(appt.email, subject, body);
    // פתיחה דרך אלמנט <a> זמני + click(), במקום window.location.href ישירות.
    // עוקף בעיה ידועה ב-PWA/WebView באנדרואיד: ניווט ישיר ל-mailto: דרך
    // location.href לפעמים "בולע" את פרמטרי ה-subject/body ומעביר לאפליקציית
    // המייל רק את כתובת הנמען, בלי כותרת ותוכן.
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    repo.update(appt.id, { inviteSent: true });
  }

  // Phase 4 §7 — פתיחת wa.me בכרטיסייה/חלון חדש (לא ניווט ישיר בעמוד
  // הנוכחי) כדי לא לאבד את מסך "שליחת זימון" אם המשתמשת חוזרת אחורה.
  function openWhatsapp() {
    const url = whatsappUrl(phone, body);
    window.open(url, "_blank", "noopener");
    repo.update(appt.id, { inviteSentWhatsapp: true });
  }

  return (
    <>
      <ScreenHeader
        title="שליחת זימון"
        action={
          <button className="btn btn--ghost" onClick={goBack}>
            {from === "appointments" ? "לתיאום תור" : "ליומן"}
          </button>
        }
      />

      <div className="card">
        <div className="read-row">
          <span className="muted">לקוחה</span>
          <span>{appt.clientName}</span>
        </div>
        <div className="read-row">
          <span className="muted">טיפול</span>
          <span>{appt.treatmentName}</span>
        </div>
        <div className="read-row">
          <span className="muted">מועד</span>
          <span>{formatDateTime(appt.start)}</span>
        </div>
        <div className="read-row">
          <span className="muted">אימייל</span>
          <span dir="ltr">{appt.email || "— חסר —"}</span>
        </div>
        <div className="read-row">
          <span className="muted">טלפון</span>
          <span dir="ltr">{phone || "— חסר —"}</span>
        </div>
      </div>

      {!appt.email && (
        <div className="warn-text" style={{ marginTop: 12 }}>
          ⚠ ללקוחה אין אימייל. הוסיפי אימייל בכרטיסיית הלקוחה כדי לשלוח זימון במייל.
        </div>
      )}
      {!phone && (
        <div className="warn-text" style={{ marginTop: 12 }}>
          ⚠ ללקוחה אין מספר טלפון. הוסיפי טלפון בכרטיסיית הלקוחה כדי לשלוח זימון בוואטסאפ.
        </div>
      )}

      <div className="notice">
        ההודעה נפתחת מוכנה עם קישור "הוסף ליומן Google" בתוכה — הלקוחה לוחצת עליו והתור נכנס
        ליומן שלה. לחיצה אחת, ללא צירוף קובץ. התוכן אינו כולל מחיר, לפי עקרון הפרטיות.
      </div>

      <div className="stack">
        <button className="btn btn--block" disabled={!appt.email} onClick={openMail}>
          ✉ פתיחת טיוטת מייל (כולל קישור ליומן)
        </button>
        <button className="btn btn--block btn--ghost" disabled={!phone} onClick={openWhatsapp}>
          💬 פתיחת הודעת WhatsApp (כולל קישור ליומן)
        </button>
      </div>

      {appt.inviteSent && (
        <p className="save-row__ok" style={{ textAlign: "center", marginTop: 12 }}>
          הזימון במייל סומן כנשלח ✓ (ניתן לשלוח שוב בכל עת)
        </p>
      )}
      {appt.inviteSentWhatsapp && (
        <p className="save-row__ok" style={{ textAlign: "center", marginTop: 4 }}>
          הזימון בוואטסאפ סומן כנשלח ✓ (ניתן לשלוח שוב בכל עת)
        </p>
      )}
    </>
  );
}
