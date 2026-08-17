// עבודה עם תאריך/שעה. start נשמר כמחרוזת מקומית "YYYY-MM-DDTHH:MM" (ללא אזור זמן),
// מתאים לאפליקציה חד-משתמשתית בזמן מקומי.

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function combine(date, time) {
  return `${date}T${time || "00:00"}`;
}

export function startDate(startStr) {
  return new Date(startStr);
}

export function endDate(startStr, durationMin) {
  return new Date(new Date(startStr).getTime() + (Number(durationMin) || 0) * 60000);
}

export function overlaps(aStart, aDur, bStart, bDur) {
  const a1 = new Date(aStart).getTime();
  const a2 = a1 + (Number(aDur) || 0) * 60000;
  const b1 = new Date(bStart).getTime();
  const b2 = b1 + (Number(bDur) || 0) * 60000;
  return a1 < b2 && b1 < a2;
}

export function weekday(startStr) {
  return new Date(startStr).getDay(); // 0=ראשון
}

export function dateInputValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeInputValue(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(startStr) {
  return new Date(startStr).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatTime(startStr) {
  return new Date(startStr).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(startStr) {
  return `${formatDate(startStr)} · ${formatTime(startStr)}`;
}

export function sameDay(startStr, d) {
  const s = new Date(startStr);
  return (
    s.getFullYear() === d.getFullYear() &&
    s.getMonth() === d.getMonth() &&
    s.getDate() === d.getDate()
  );
}

export function monthLabel(d) {
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}
