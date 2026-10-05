import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc } from "../data";
import {
  fillTemplate,
  voucherTokens,
  mailtoUrl,
  whatsappUrl,
  DEFAULT_VOUCHER_SUBJECT,
  DEFAULT_VOUCHER_BODY,
} from "../utils/invite";
import { formatILS } from "../utils/money";

// שליחת שובר מתנה למקבלת (addendum שוברים/זיכוי, S-1..S-7) — בנוי כמו
// SendInvite.jsx: פתיחת טיוטת מייל / הודעת WhatsApp עם תוכן מוכן, והמפעילה
// עדיין צריכה ללחוץ "שליחה" בפועל. אין קישור "הוסף ליומן" בהודעת שובר.
// הנמענת היא המקבלת (credits.clientId); אימייל וטלפון נשאבים מכרטיס הלקוחה.
export default function SendVoucher() {
  const { creditId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from === "purchase" ? "purchase" : "list";

  const { items: credits, loading } = useCollectionData("credits");
  const { items: clients } = useCollectionData("clients");
  const repo = useRepo("credits");
  const { data: business } = useSettingDoc("business");
  const { data: invitation } = useSettingDoc("invitation");

  const credit = credits.find((c) => c.id === creditId);

  function goBack() {
    navigate("/vouchers");
  }

  if (loading) return <p className="muted">טוען…</p>;
  if (!credit || credit.source !== "voucher")
    return (
      <>
        <ScreenHeader title="שליחת שובר" />
        <div className="empty-state">השובר לא נמצא.</div>
      </>
    );

  const client = clients.find((c) => c.id === credit.clientId);
  const email = client?.email || "";
  const phone = client?.phone || "";

  const tokens = voucherTokens({
    business,
    recipientName: credit.clientName,
    buyerName: credit.giftFromName,
    amount: credit.amount,
    expiryDate: credit.expiryDate,
  });
  // אם מסך "תבניות" מעולם לא נשמר בפועל, voucherSubject/voucherBody הם
  // undefined — נופלים לברירת המחדל בקוד (T-3), כמו ב-SendInvite.
  const subject = fillTemplate(invitation?.voucherSubject || DEFAULT_VOUCHER_SUBJECT, tokens);
  const body = fillTemplate(invitation?.voucherBody || DEFAULT_VOUCHER_BODY, tokens);

  function openMail() {
    const url = mailtoUrl(email, subject, body);
    // פתיחה דרך אלמנט <a> זמני + click() — עוקף בעיה ידועה ב-PWA/WebView
    // באנדרואיד שבה ניווט ישיר ל-mailto: "בולע" את ה-subject/body (ראו SendInvite).
    const link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    repo.update(credit.id, { voucherSentEmail: true });
  }

  function openWhatsapp() {
    window.open(whatsappUrl(phone, body), "_blank", "noopener");
    repo.update(credit.id, { voucherSentWhatsapp: true });
  }

  return (
    <>
      <ScreenHeader
        title="שליחת שובר"
        action={
          <button className="btn btn--ghost" onClick={goBack}>
            {from === "purchase" ? "לשוברים" : "חזרה"}
          </button>
        }
      />

      <div className="card">
        <div className="read-row">
          <span className="muted">מקבלת</span>
          <span>{credit.clientName}</span>
        </div>
        <div className="read-row">
          <span className="muted">מתנה מ</span>
          <span>{credit.giftFromName || "—"}</span>
        </div>
        <div className="read-row">
          <span className="muted">סכום</span>
          <span className="sensitive">{formatILS(credit.amount)}</span>
        </div>
        <div className="read-row">
          <span className="muted">תוקף</span>
          <span>{tokens["תוקף"]}</span>
        </div>
        <div className="read-row">
          <span className="muted">אימייל</span>
          <span dir="ltr">{email || "— חסר —"}</span>
        </div>
        <div className="read-row">
          <span className="muted">טלפון</span>
          <span dir="ltr">{phone || "— חסר —"}</span>
        </div>
      </div>

      {!email && (
        <div className="warn-text" style={{ marginTop: 12 }}>
          ⚠ למקבלת אין אימייל. הוסיפי אימייל בכרטיסיית הלקוחה כדי לשלוח במייל.
        </div>
      )}
      {!phone && (
        <div className="warn-text" style={{ marginTop: 12 }}>
          ⚠ למקבלת אין מספר טלפון. הוסיפי טלפון בכרטיסיית הלקוחה כדי לשלוח בוואטסאפ.
        </div>
      )}

      <div className="notice">
        ההודעה נפתחת מוכנה לשליחה לפי התבנית "תוכן שובר" (הגדרות ← תבניות). מופיע בה סכום
        השובר בלבד — לא מחירי טיפולים.
      </div>

      <div className="stack">
        <button className="btn btn--block" disabled={!email} onClick={openMail}>
          ✉ פתיחת טיוטת מייל
        </button>
        <button className="btn btn--block btn--ghost" disabled={!phone} onClick={openWhatsapp}>
          💬 פתיחת הודעת WhatsApp
        </button>
      </div>

      {credit.voucherSentEmail && (
        <p className="save-row__ok" style={{ textAlign: "center", marginTop: 12 }}>
          השובר במייל סומן כנשלח ✓ (ניתן לשלוח שוב בכל עת)
        </p>
      )}
      {credit.voucherSentWhatsapp && (
        <p className="save-row__ok" style={{ textAlign: "center", marginTop: 4 }}>
          השובר בוואטסאפ סומן כנשלח ✓ (ניתן לשלוח שוב בכל עת)
        </p>
      )}
    </>
  );
}
