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

export function mailtoUrl(to, subject, body) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  return `mailto:${to || ""}?${params.toString()}`;
}
