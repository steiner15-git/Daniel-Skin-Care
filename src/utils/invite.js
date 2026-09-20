import { endDate, pad } from "./datetime";
import { normalizePhone } from "../screens/clients/clientUtils";

// חותמת זמן UTC בפורמט לוח שנה: YYYYMMDDTHHMMSSZ
function calStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// ברירות מחדל לתוכן הזימון — משמשות ב-2 מקומות: כתצוגת פתיחה במסך ההגדרות
// (Invitation.jsx), וכ"רשת ביטחון" בפועל ב-SendInvite.jsx אם מסמך ה-settings
// מעולם לא נשמר בפועל (invitation?.body/subject הם undefined). בלי הרשת הזו,
// מייל שנשלח לפני ביקור ראשון במסך ההגדרות היה יוצא כמעט ריק.
// Phase 4 §7 — אותה תבנית (subject/body) משמשת גם את הודעת ה-WhatsApp
// (ל-WhatsApp אין שדה "נושא" נפרד — רק גוף ההודעה נשלח, ראו SendInvite.jsx).
export const DEFAULT_INVITATION_SUBJECT = "תזכורת לתור ב{שם_עסק}";
export const DEFAULT_INVITATION_BODY =
  "שלום {שם_לקוחה},\n" +
  "זהו זימון לתור ל{סוג_טיפול}.\n" +
  "תאריך: {תאריך}\n" +
  "שעה: {שעה}\n" +
  "כתובת: {כתובת_עסק}\n\n" +
  "נתראה!\n{שם_עסק}";

// מילוי תבנית הזימון בשדות דינמיים. לעולם ללא מחיר/עלות/רווח.
export function fillTemplate(text, tokens) {
  return String(text || "").replace(/\{([^}]+)\}/g, (m, key) =>
    tokens[key] != null ? tokens[key] : m
  );
}

export function inviteTokens({ business, clientName, appt }) {
  const d = new Date(appt.start);
  return {
    שם_לקוחה: clientName || "",
    תאריך: d.toLocaleDateString("he-IL"),
    שעה: d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    סוג_טיפול: appt.treatmentName || "",
    שם_עסק: business?.name || "",
    כתובת_עסק: business?.address || "",
  };
}

// קישור "הוסף ליומן Google" — הלקוחה לוחצת והתור נכנס ליומן שלה (ללא צירוף קובץ).
export function gcalUrl({ title, start, durationMin, details, location }) {
  const s = new Date(start);
  const e = endDate(start, durationMin);
  const dates = `${calStamp(s)}/${calStamp(e)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title || "",
    dates,
  });
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// קידוד ידני ל-mailto לפי RFC 6068: encodeURIComponent (לא application/x-www-form
// -urlencoded של URLSearchParams, שמקודד רווח כ-"+" ולא כ-"%20"). כמו כן ממירים
// ירידת שורה ל-CRLF (%0D%0A) כפי שדורש התקן.
function mailtoEncode(s) {
  return encodeURIComponent(s || "").replace(/%0A/g, "%0D%0A");
}

export function mailtoUrl(to, subject, body) {
  const parts = [];
  if (subject) parts.push(`subject=${mailtoEncode(subject)}`);
  if (body) parts.push(`body=${mailtoEncode(body)}`);
  const query = parts.length ? `?${parts.join("&")}` : "";
  return `mailto:${to || ""}${query}`;
}

// ---------- WhatsApp (Phase 4 §7) ----------
// ממיר מספר טלפון מקומי ישראלי לפורמט בינלאומי ללא תווים מיוחדים, כפי
// שדורש wa.me (972XXXXXXXXX). משתמש ב-normalizePhone הקיים כבר ב-clientUtils
// (שנועד במקור להשוואת כפילויות טלפון) במקום לשכפל ניקוי-ספרות עצמאי —
// אותה מדיניות "מספר = ספרות בלבד" בכל מקום באפליקציה. אם המספר כבר מתחיל
// ב-972 (או בכל קידומת אחרת שאינה 0), הוא מוחזר כמות שהוא. המרה בסיסית
// מכוונת לישראל בלבד — תואם לכך שהאפליקציה כולה מיועדת לעסק ישראלי יחיד.
export function toWhatsappPhone(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return "";
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
}

// קישור פתיחת הודעת WhatsApp (wa.me) — הלקוחה/המפעילה עדיין צריכות ללחוץ
// "שליחה" בפועל באפליקציית WhatsApp, בדיוק כמו ה-mailto הקיים; אין שליחה
// אוטומטית/שרת מעורב. text אופציונלי — קישור בלי טקסט (undefined) פותח שיחה
// חופשית עם מספר הלקוחה, לשימוש בכפתור "שליחת הודעה בוואטסאפ" בכרטיסיית
// הלקוחה (ClientCard.jsx), בנפרד מהזימון המובנה עם קישור-ליומן ב-SendInvite.jsx.
export function whatsappUrl(phone, text) {
  const num = toWhatsappPhone(phone);
  const query = text ? `?${new URLSearchParams({ text }).toString()}` : "";
  return `https://wa.me/${num}${query}`;
}
