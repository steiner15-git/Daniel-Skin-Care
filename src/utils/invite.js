import { endDate, pad } from "./datetime";

// חותמת זמן UTC בפורמט לוח שנה: YYYYMMDDTHHMMSSZ
function calStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

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
// -urlencoded של URLSearchParams, שמקודד רווח כ-"+" ולא כ-"%20" — הבדל שגורם
// לחלק ניכר מלקוחות המייל, בעיקר בנייד, "לבלוע" או לקטוע את תוכן הגוף).
// כמו כן ממירים ירידת שורה ל-CRLF (%0D%0A) כפי שדורש תקן ה-mailto.
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
