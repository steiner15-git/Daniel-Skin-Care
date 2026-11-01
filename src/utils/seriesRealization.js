import { round2 } from "./credits";

// הצגת מימוש סדרות — שכבה ניהולית בלבד, לעולם לא מחוברת לסך ההכנסות.
// בסיס ההכנסה הרשמי נשאר תקבולים (ההכנסה נרשמת ברכישת הסדרה). כאן מחושב מה
// נוצל בפועל ומה עדיין פתוח, מנתונים קיימים בלבד (clientPackages, ההכנסה
// שלהן ותורים שחויבו מחבילה), בלי שינוי במודל הנתונים.
//
// שווי מפגש = סכום ההכנסה של הרכישה / מספר המפגשים הכולל. ההכנסה נלקחת כפי
// שהיא נרשמה: סכום ששולם בפועל (החלק ששולם מיתרה אינו מיוחס, כדי לא לספור
// פעמיים את השובר). incomeById: { [id]: { amount } } — הקורא קובע אם amount
// הוא סכום כולל או נטו (ראו incomeRevenue ב-utils/vat.js).

export function packageSessionValue(pkg, incomeById) {
  const inc = pkg?.incomeId ? incomeById[pkg.incomeId] : null;
  const total = Number(pkg?.totalSessions) || 0;
  if (!inc || total <= 0) return 0;
  return round2((Number(inc.amount) || 0) / total);
}

// התחייבות פתוחה: שווי המפגשים שנותרו בחבילות פעילות שלא פגו; חבילות שפג
// תוקפן עם מפגשים שלא נוצלו מוצגות בנפרד ואינן נרשמות אוטומטית כהכנסה.
export function openSeriesLiability(packages, incomeById, today = new Date()) {
  const t0 = new Date(today.toDateString());
  let value = 0;
  let sessions = 0;
  let count = 0;
  let expiredValue = 0;
  let expiredSessions = 0;
  for (const p of packages) {
    const remaining = Number(p.remainingSessions) || 0;
    if (remaining <= 0 || p.status !== "active") continue;
    const per = packageSessionValue(p, incomeById);
    const expired = p.expiryDate && new Date(p.expiryDate) < t0;
    if (expired) {
      expiredValue += per * remaining;
      expiredSessions += remaining;
    } else {
      value += per * remaining;
      sessions += remaining;
      count += 1;
    }
  }
  return {
    value: round2(value),
    sessions,
    count,
    expiredValue: round2(expiredValue),
    expiredSessions,
  };
}

// שווי המפגשים שמומשו בטווח: תורים שנסגרו וחויבו מחבילה, לפי תאריך התור.
// מפגשים שהופחתו ידנית דרך עריכת החבילה (בלי תור) אינם נכללים.
export function realizedSeriesValue(appts, packages, incomeById, inRange) {
  const pkgById = new Map(packages.map((p) => [p.id, p]));
  let total = 0;
  for (const a of appts) {
    if (a.status !== "done" || !a.chargedFromPackage || !a.clientPackageId) continue;
    if (!inRange(a.start)) continue;
    const pkg = pkgById.get(a.clientPackageId);
    if (!pkg) continue;
    total += packageSessionValue(pkg, incomeById);
  }
  return round2(total);
}

// משך מימוש סדרות שהושלמו: ימים מרכישת החבילה ועד המפגש האחרון שחויב ממנה.
// נספרות רק חבילות שנוצלו במלואן ויש להן לפחות תור שחויב מהן (חבילה שהופחתה
// ידנית בלי תורים אינה נכללת). מחזיר { samples, avgDays, minDays, maxDays }.
export function seriesCompletionStats(packages, appts) {
  const lastByPkg = new Map();
  for (const a of appts) {
    if (a.status !== "done" || !a.chargedFromPackage || !a.clientPackageId) continue;
    const prev = lastByPkg.get(a.clientPackageId);
    if (!prev || new Date(a.start) > new Date(prev)) lastByPkg.set(a.clientPackageId, a.start);
  }
  const days = [];
  for (const p of packages) {
    if ((Number(p.remainingSessions) || 0) > 0 || !p.purchaseDate) continue;
    const last = lastByPkg.get(p.id);
    if (!last) continue;
    const d = Math.round((new Date(last) - new Date(p.purchaseDate)) / 86400000);
    if (d >= 0) days.push(d);
  }
  if (days.length === 0) return { samples: 0, avgDays: null, minDays: null, maxDays: null };
  return {
    samples: days.length,
    avgDays: Math.round(days.reduce((s, x) => s + x, 0) / days.length),
    minDays: Math.min(...days),
    maxDays: Math.max(...days),
  };
}
