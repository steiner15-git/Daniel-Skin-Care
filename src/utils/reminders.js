import { isReferred } from "../screens/clients/clientUtils";

// חישובים משותפים לתזכורות — משמשים גם את מסך הבית (Dashboard), גם את
// הבאדג'ים בבר הניווט (BottomNav), וגם את סינון "לקוחות לא פעילות"
// ברשימת הלקוחות (ClientsList). ריכוז כאן מונע שכפול לוגיקה בין המסכים.

// תורים "ממתינים לסגירה": מועדם עבר וטרם סומנו כ-done/cancelled.
export function pendingClosureAppts(appts, now = Date.now()) {
  return appts.filter(
    (x) => x.status !== "cancelled" && x.status !== "done" && new Date(x.start).getTime() < now
  );
}

// הכנסות "לא שולם" שעברו את סף ימי אימות התשלום.
export function unverifiedIncome(income, verifDays, now = Date.now()) {
  return income.filter((r) => {
    if (r.paid) return false;
    const age = (now - new Date(r.date).getTime()) / 86400000;
    return age >= verifDays;
  });
}

// Map: clientId → תאריך התור האחרון שבוצע (status "done") עבור אותה לקוחה.
function lastDoneApptByClient(appts) {
  const map = new Map();
  for (const a of appts) {
    if (a.status !== "done" || !a.clientId) continue;
    const prev = map.get(a.clientId);
    if (!prev || new Date(a.start) > new Date(prev)) map.set(a.clientId, a.start);
  }
  return map;
}

function monthsBetween(dateStr, now) {
  const d = new Date(dateStr);
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

// לקוחות פעילות (לא בארכיון) עם לפחות תור אחד שבוצע, שעברו יותר מ-`months`
// חודשים מהתור האחרון שבוצע. לקוחה בלי אף תור שבוצע מעולם — לא נכללת כלל.
// מחזיר [{ client, lastVisit, monthsSince }], ממוינות מהוותיקה ביותר.
export function inactiveClients(clients, appts, months, now = new Date()) {
  const lastDone = lastDoneApptByClient(appts);
  return clients
    .filter((c) => !c.archived && lastDone.has(c.id))
    .map((c) => {
      const lastVisit = lastDone.get(c.id);
      return { client: c, lastVisit, monthsSince: monthsBetween(lastVisit, now) };
    })
    .filter((x) => x.monthsSince >= months)
    .sort((a, b) => b.monthsSince - a.monthsSince);
}

// חבילות שעומדות לפוג בקרוב (או כבר פקעו) — status="active" כפי שמאוחסן
// בפועל (לא הסטטוס הנגזר לתצוגה), יתרת מפגשים חיובית, תאריך תוקף מוגדר,
// ועד `days` ימים עד לפקיעה. אין גבול תחתון — חבילות שכבר עברו את תאריך
// התוקף (הפרש שלילי) נכללות גם הן, לפי דרישת ה-addendum.
export function expiringPackages(packages, days, now = new Date()) {
  const today = new Date(now.toDateString());
  return packages
    .filter((p) => p.status === "active" && (p.remainingSessions ?? 0) > 0 && p.expiryDate)
    .map((p) => ({
      pkg: p,
      daysUntil: Math.ceil((new Date(p.expiryDate) - today) / 86400000),
    }))
    .filter((x) => x.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

// Phase 4 §4 — מוצרים שאזלו מהמלאי או ירדו לסף ההתראה. אותו קריטריון
// בדיוק כמו התגית "אזל מהמלאי"/"מלאי נמוך" שכבר מוצגת במסך המוצרים
// (Products.jsx: p.stock<=0 → "אזל", אחרת p.stock<=lowStockThreshold →
// "מלאי נמוך") — ריכוז כאן כדי שגם הדשבורד ישתמש באותה לוגיקה בדיוק,
// בלי לשכפל אותה. מוצר בלי סף מוגדר (lowStockThreshold=0, ברירת מחדל)
// נכלל רק כשהמלאי אזל לגמרי. ממוין מהחסר ביותר.
export function lowStockProducts(products) {
  return products
    .filter((p) => (p.stock ?? 0) <= 0 || (p.stock ?? 0) <= (p.lowStockThreshold || 0))
    .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
}

// ---------- תגמול על הפניות ----------
// הפניה נספרת רק אם הלקוחה שהופנתה השלימה לפחות תור אחד שבוצע (status
// "done") — כך לא מתגמלים על רישום בלבד. הפניה תקפה לפי isReferred
// (מקור "המלצה" + לקוחה מפנה), ולקוחה שהופנתה ונמצאת בארכיון אינה נספרת
// (עקבי עם הרשימה "לקוחות שהופנו" בכרטיסיית הלקוחה המפנה).

// Set של מזהי לקוחות עם לפחות תור אחד שבוצע.
export function doneClientIds(appts) {
  const ids = new Set();
  for (const a of appts) {
    if (a.status === "done" && a.clientId) ids.add(a.clientId);
  }
  return ids;
}

// Map: מזהה לקוחה מפנה → מספר ההפניות שהושלמו שלה.
export function completedReferralCounts(clients, appts) {
  const done = doneClientIds(appts);
  const counts = new Map();
  for (const c of clients) {
    if (c.archived || !isReferred(c) || !done.has(c.id)) continue;
    counts.set(c.referredByClientId, (counts.get(c.referredByClientId) || 0) + 1);
  }
  return counts;
}

// מצב התגמולים של לקוחה מפנה: כמה מגיעים לה (earned), כמה כבר ניתנו
// (given — השדה referralRewardsGiven על הלקוחה), וכמה ממתינים (pending).
// threshold <= 0 מכבה את המנגנון (earned=0).
export function referralRewardState(client, completedCount, threshold) {
  const t = Number(threshold) || 0;
  const given = Number(client?.referralRewardsGiven) || 0;
  const earned = t > 0 ? Math.floor(completedCount / t) : 0;
  return { earned, given, pending: Math.max(0, earned - given) };
}

// לקוחות מפנות פעילות עם תגמול ממתין לאישור. מחזיר
// [{ client, completedCount, earned, given, pending }], ממוינות לפי מספר
// התגמולים הממתינים ואז לפי מספר ההפניות. התראה/באדג' פעילים כל עוד
// pending > 0 — עד שהמשתמשת מאשרת (referralRewardsGiven גדל).
export function referralRewards(clients, appts, threshold) {
  if (!(Number(threshold) > 0)) return [];
  const counts = completedReferralCounts(clients, appts);
  const byId = new Map(clients.map((c) => [c.id, c]));
  const out = [];
  for (const [referrerId, completedCount] of counts) {
    const client = byId.get(referrerId);
    if (!client || client.archived) continue;
    const st = referralRewardState(client, completedCount, threshold);
    if (st.pending > 0) out.push({ client, completedCount, ...st });
  }
  return out.sort((a, b) => b.pending - a.pending || b.completedCount - a.completedCount);
}
