// מע"מ — לוגיקה טהורה משותפת (ללא תלות ב-Firestore/React).
//
// עיקרון: הסכום הכולל (income.amount / expenses.total) הוא השדה השמור היחיד.
// נטו, סכום המע"מ ושיעור המע"מ *נגזרים* תמיד בזמן קריאה לפי הגדרות שנת המס
// של תאריך הרשומה (settings/vat). כך מעבר רטרואקטיבי לעוסק מורשה חל מיד על
// כל השנה, בלי לכתוב לנתונים, והפיך. רק עריכה ידנית של שיעור נשמרת על הרשומה
// (vatRate). כל מסך שמציג/מסכם סכומים חייב לעבור דרך הפונקציות כאן — לעולם
// לא לקרוא amountBeforeVat / vat / vatRate ישירות.
//
// settings/vat = { years: [{ id, from, to, status, exemptRate, rate,
//                            confirmed, confirmedAt }] }
//   status: "exempt" | "licensed"
//   exemptRate: "חישוב מע"מ %" לעוסק פטור (ברירת מחדל 0)
//   rate: "מע"מ %" לעוסק מורשה (ברירת מחדל 18)

import { round2 } from "./credits";
import { dateInputValue } from "./datetime";

export const DEFAULT_EXEMPT_RATE = 0;
export const DEFAULT_RATE = 18;

export function clampRate(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function dateKey(d) {
  return String(d || "").slice(0, 10);
}

// מנרמל את מערך השנים מהמסמך השמור: ערכים תקינים, ממוין לפי תאריך התחלה.
export function normalizeYears(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((y) => y && y.from && y.to)
    .map((y) => ({
      id: String(y.id || String(y.from).slice(0, 4)),
      from: dateKey(y.from),
      to: dateKey(y.to),
      status: y.status === "licensed" ? "licensed" : "exempt",
      exemptRate: clampRate(y.exemptRate ?? DEFAULT_EXEMPT_RATE),
      rate: clampRate(y.rate ?? DEFAULT_RATE),
      // תקרת מחזור שנתית לעוסק פטור (₪) — מוזנת ידנית כל שנה; 0 = לא הוגדרה.
      ceiling: Math.max(0, Number(y.ceiling) || 0),
      confirmed: !!y.confirmed,
      confirmedAt: y.confirmedAt || null,
    }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

// שנת המס של תאריך: השנה שהתאריך בתוכה; תאריך אחרי השנה האחרונה (שנה חדשה
// שטרם הוגדרה) נופל לשנה האחרונה שהתחילה לפניו; תאריך לפני כל השנות
// שהוגדרו → null (ברירת מחדל: פטור, 0%) כדי שנתונים היסטוריים לא ישתנו.
export function taxYearFor(date, years) {
  const d = dateKey(date);
  if (!d || !years || years.length === 0) return null;
  const inside = years.find((y) => y.from <= d && d <= y.to);
  if (inside) return inside;
  let prev = null;
  for (const y of years) if (y.from <= d) prev = y;
  return prev;
}

export function isLicensed(entry) {
  return entry?.status === "licensed";
}

// השיעור הפעיל כברירת מחדל בשנה: מורשה → rate, פטור → exemptRate.
export function effectiveRate(entry) {
  if (!entry) return DEFAULT_EXEMPT_RATE;
  return isLicensed(entry) ? entry.rate : entry.exemptRate;
}

// פיצול סכום כולל לנטו ומע"מ לפי שיעור.
export function splitGross(gross, rate) {
  const g = round2(Math.max(0, Number(gross) || 0));
  const r = clampRate(rate);
  const net = round2(g / (1 + r / 100));
  return { gross: g, net, vat: round2(g - net), rate: r };
}

// הכנסה: { gross, net, vat, rate, manual, licensed }
export function incomeVat(r, years) {
  const entry = taxYearFor(r?.date, years);
  const manual = r?.vatRate != null;
  const rate = manual ? clampRate(r.vatRate) : effectiveRate(entry);
  return { ...splitGross(r?.amount, rate), manual, licensed: isLicensed(entry) };
}

// הוצאה. הוצאות ישנות (לפני תוספת המע"מ) שמרו amountBeforeVat ו-vat מחשבונית
// הספק — מטופלות כרשומות עם שיעור ידני, בלי מיגרציה.
export function expenseVat(r, years) {
  const entry = taxYearFor(r?.date, years);
  const licensed = isLicensed(entry);
  if (r?.vatRate != null) {
    return { ...splitGross(r?.total, r.vatRate), manual: true, licensed };
  }
  if (r?.amountBeforeVat != null && r?.vat != null) {
    const gross = round2(Math.max(0, Number(r.total) || 0));
    const vat = round2(Math.min(gross, Math.max(0, Number(r.vat) || 0)));
    const net = round2(gross - vat);
    const rate = net > 0 ? round2((vat / net) * 100) : 0;
    return { gross, net, vat, rate, manual: true, licensed };
  }
  return { ...splitGross(r?.total, effectiveRate(entry)), manual: false, licensed };
}

// סכום ההכנסה לחישובי סיכום/רווח: בשנת מורשה — נטו; בשנת פטור — הסכום הכולל
// (מע"מ בשנת פטור הוא מידע בלבד ואינו משפיע על הרווח).
export function incomeRevenue(r, years) {
  const p = incomeVat(r, years);
  return p.licensed ? p.net : p.gross;
}

// עלות ההוצאה לחישובי רווח: בשנת מורשה — נטו (מע"מ תשומות מזוכה); בשנת פטור —
// הסכום הכולל (אין זיכוי תשומות).
export function expenseCost(r, years) {
  const p = expenseVat(r, years);
  return p.licensed ? p.net : p.gross;
}

// מע"מ עסקאות / תשומות — רק לרשומות בשנת מורשה.
export function incomeVatDue(r, years) {
  const p = incomeVat(r, years);
  return p.licensed ? p.vat : 0;
}
export function expenseVatCredit(r, years) {
  const p = expenseVat(r, years);
  return p.licensed ? p.vat : 0;
}

// רווח לשנת מס לפי מזהה השנה (id) — משמש גם להצגת "לפני/אחרי" באישור שינוי
// סטטוס בהגדרות.
export function profitForYear(income, expenses, years, yearId) {
  let inc = 0;
  let exp = 0;
  for (const r of income) {
    if (taxYearFor(r.date, years)?.id === yearId) inc += incomeRevenue(r, years);
  }
  for (const r of expenses) {
    if (taxYearFor(r.date, years)?.id === yearId) exp += expenseCost(r, years);
  }
  return round2(inc - exp);
}

// מחזור שנתי (סכום כל ההכנסות בשנת מס לפי מזהה השנה) — למד תקרת המחזור של עוסק
// פטור. הכנסה בסכום ₪0 (קיזוז מיתרה) אינה משנה את הסכום.
export function turnoverForYear(income, years, yearId) {
  let total = 0;
  for (const r of income) {
    if (taxYearFor(r.date, years)?.id === yearId) total += Number(r.amount) || 0;
  }
  return round2(total);
}

// שנת מס חדשה, מועתקת מהקודמת, כשהיא טרם אושרה.
export function newYearEntry(prev, year) {
  return {
    id: String(year),
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    status: prev?.status || "exempt",
    exemptRate: prev?.exemptRate ?? DEFAULT_EXEMPT_RATE,
    rate: prev?.rate ?? DEFAULT_RATE,
    ceiling: prev?.ceiling ?? 0,
    confirmed: false,
    confirmedAt: null,
  };
}

// אזהרות על תקופות חופפות / פערים / טווח הפוך (לא חוסמות שמירה).
export function validateYears(years) {
  const warnings = [];
  for (const y of years) {
    if (y.from > y.to) warnings.push(`שנת ${y.id}: תאריך ההתחלה אחרי תאריך הסיום.`);
  }
  for (let i = 1; i < years.length; i++) {
    const prev = years[i - 1];
    const cur = years[i];
    if (cur.from <= prev.to) {
      warnings.push(`שנות ${prev.id} ו-${cur.id} חופפות — תאריך באמצע יחושב לפי השנה הראשונה.`);
    } else {
      const next = new Date(prev.to + "T00:00:00");
      next.setDate(next.getDate() + 1);
      if (dateInputValue(next) < cur.from) {
        warnings.push(`יש פער בין שנת ${prev.id} לשנת ${cur.id} — תאריכים בפער יחושבו לפי שנת ${prev.id}.`);
      }
    }
  }
  return warnings;
}

// תזכורת: אין שנת מס שמכסה את היום, או שהשנה הנוכחית טרם אושרה. נעלמת רק
// באישור ערך עדכני בהגדרות (גם אם לא השתנה).
export function vatYearNeedsConfirmation(years, today = new Date()) {
  const d = dateInputValue(today);
  const entry = (years || []).find((y) => y.from <= d && d <= y.to);
  if (!entry) return { needed: true, reason: "missing", year: today.getFullYear() };
  if (!entry.confirmed) return { needed: true, reason: "unconfirmed", year: entry.id };
  return { needed: false };
}

// תצוגת סכום עם אגורות (formatILS מעגל לשקל שלם ומטשטש מע"מ קטן).
export function formatMoney2(n) {
  const num = Number(n) || 0;
  return (
    "₪" +
    num.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export const VAT_STATUS_LABEL = { exempt: "עוסק פטור", licensed: "עוסק מורשה" };
