import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc } from "../../data";
import { fillTemplate, inviteTokens, mailtoUrl, gcalUrl } from "../../utils/invite";
import { formatDateTime } from "../../utils/datetime";

export default function SendInvite() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from === "appointments" ? "appointments" : "calendar";

  const { items: appts, loading } = useCollectionData("appointments");
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

  const tokens = inviteTokens({ business, clientName: appt.clientName, appt });
  const subject = fillTemplate(invitation?.subject || "זימון לתור", tokens);
  const baseBody = fillTemplate(invitation?.body || "", tokens);

  const title = `${appt.treatmentName} · ${business?.name || "קליניקה"}`;
  const calendarLink = gcalUrl({
    title,
    start: appt.start,
    durationMin: appt.durationMin,
    details: appt.treatmentName, // ללא מחיר — פרטיות
    location: business?.address || "",
  });

  // הקישור נכנס לגוף המייל — לחיצה אחת של הלקוחה מוסיפה את התור ליומן שלה
  const body = `${baseBody}\n\nלהוספת התור ליומן שלך:\n${calendarLink}`;

  function openMail() {
    window.location.href = mailtoUrl(appt.email, subject, body);
    repo.update(appt.id, { inviteSent: true });
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
      </div>

      {!appt.email && (
        <div className="warn-text" style={{ marginTop: 12 }}>
          ⚠ ללקוחה אין אימייל. הוסיפי אימייל בכרטיסיית הלקוחה כדי לשלוח זימון.
        </div>
      )}

      <div className="notice">
        המייל נפתח מוכן עם קישור "הוסף ליומן Google" בתוכו — הלקוחה לוחצת עליו והתור נכנס
        ליומן שלה. לחיצה אחת, ללא צירוף קובץ. התוכן אינו כולל מחיר, לפי עקרון הפרטיות.
      </div>

      <div className="stack">
        <button className="btn btn--block" disabled={!appt.email} onClick={openMail}>
          ✉ פתיחת טיוטת מייל (כולל קישור ליומן)
        </button>
      </div>

      {appt.inviteSent && (
        <p className="save-row__ok" style={{ textAlign: "center", marginTop: 12 }}>
          הזימון סומן כנשלח ✓ (ניתן לשלוח שוב בכל עת)
        </p>
      )}
    </>
  );
}
