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
