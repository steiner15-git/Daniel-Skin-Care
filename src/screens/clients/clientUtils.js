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
