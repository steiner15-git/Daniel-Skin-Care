export function fullName(c) {
  return [c?.firstName, c?.lastName].filter(Boolean).join(" ").trim() || "ללא שם";
}

export function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b)) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function normalizePhone(p) {
  return (p || "").replace(/[^\d]/g, "");
}

// ---------- הפניות (Phase 4 §6) ----------
// "הופנתה ע״י" (referredByClientId) תקף רק כשמקור ההגעה הוא "המלצה". שינוי
// מקור ההגעה למשהו אחר חייב לבטל את ההפניה — אחרת נשארת הפניה "יתומה" על
// הרשומה, שמוצגת בכרטיסיית הלקוחה ונספרת כהפניה למרות שאין לקוחה מפנה.
export const REFERRAL_SOURCE = "המלצה";

// האם ללקוחה יש הפניה תקפה (מקור "המלצה" + לקוחה מפנה מוגדרת). משמש גם
// בתצוגה וגם בספירת הפניות — כך רשומות "מלוכלכות" שנוצרו לפני התיקון
// מתעלמים מהן בקריאה, בלי מיגרציה.
export function isReferred(c) {
  return c?.source === REFERRAL_SOURCE && !!c?.referredByClientId;
}

// מנרמל רשומת לקוחה לפני שמירה: אם מקור ההגעה אינו "המלצה" — מאפס את
// הלקוחה המפנה. מחזיר את אותו אובייקט כשאין מה לנקות.
export function normalizeReferral(client) {
  if (client?.source === REFERRAL_SOURCE || !client?.referredByClientId) return client;
  return { ...client, referredByClientId: "" };
}
