// יתרות זיכוי (שוברי מתנה + זיכוי לקוחה) — לוגיקה טהורה משותפת, ללא תלות
// ב-Firestore/React. משמשת: CloseAppointment (קיזוז), כרטיסיית לקוחה (יתרה),
// מסך השוברים, ובשלב 4 גם SeriesPurchase ו-ProductSell.
//
// כלל מחייב: כל מסך שגובה תשלום ומציע קיזוז מיתרה משתמש ב-allocateCredit
// ובקריאת batchRepo.commit אחת — לעולם לא מעדכן credits בנפרד.

// עיגול לשתי ספרות אחרי הנקודה (O-9) — מונע שאריות צפות.
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ממיר חותמת זמן (מספר מקומי / Firestore Timestamp) למילישניות.
export function toMillis(ts) {
  if (ts == null) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return 0;
}

// אותה בדיקת פקיעה בדיוק כמו בחבילות (ClientCard.jsx's packageState).
function isExpired(c) {
  return !!c.expiryDate && new Date(c.expiryDate) < new Date(new Date().toDateString());
}

// סטטוס נגזר: "active" | "used" | "expired". רק active/used נשמרים בפועל;
// "expired" הוא ערך נגזר בלבד (כמו בחבילות).
export function creditState(c) {
  if (c.status !== "active" || round2(c.remaining) <= 0) return "used";
  if (isExpired(c)) return "expired";
  return "active";
}

export const CREDIT_STATE_LABEL = { active: "פעיל", used: "נוצל", expired: "פקע" };

// תווית קריאה לסוג היתרה.
export function creditLabel(c) {
  if (c.source === "voucher") {
    return c.giftFromName ? `מתנה מ-${c.giftFromName}` : "שובר מתנה";
  }
  return "זיכוי";
}

// יתרות שניתנות לקיזוז כרגע ללקוחה נתונה (פעילות, עם יתרה, שלא פגו).
export function usableCredits(credits, clientId) {
  if (!clientId) return [];
  return credits.filter((c) => c.clientId === clientId && creditState(c) === "active");
}

// סה"כ יתרה זמינה ללקוחה.
export function creditBalance(credits, clientId) {
  return round2(usableCredits(credits, clientId).reduce((s, c) => s + round2(c.remaining), 0));
}

// הקיזוז בפועל: ברירת מחדל (offset==null) = הנמוך מבין היתרה לסכום לתשלום;
// ערך שהוקלד נעצר ב-0 ובתקרה (O-2).
export function resolveOffset(offset, balance, amount) {
  const max = round2(Math.min(Math.max(0, Number(balance) || 0), Math.max(0, Number(amount) || 0)));
  if (offset == null) return max;
  const v = round2(Math.max(0, Number(offset) || 0));
  return Math.min(v, max);
}

// הקצאת קיזוז בין כמה יתרות (O-3): קודם זו שפגה קודם (יתרה בלי תוקף
// אחרונה), ובשוויון הוותיקה ביותר (createdAt).
// מחזיר [{ credit, take, remainingAfter }] — סכום ה-take שווה ל-amount
// (או נמוך ממנו אם אין מספיק יתרה).
export function allocateCredit(credits, clientId, amount) {
  let left = round2(amount);
  const out = [];
  const sorted = usableCredits(credits, clientId)
    .slice()
    .sort((a, b) => {
      const ea = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const eb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      if (ea !== eb) return ea < eb ? -1 : 1;
      return toMillis(a.createdAt) - toMillis(b.createdAt);
    });
  for (const c of sorted) {
    if (left <= 0) break;
    const rem = round2(c.remaining);
    const take = round2(Math.min(rem, left));
    if (take <= 0) continue;
    out.push({ credit: c, take, remainingAfter: round2(rem - take) });
    left = round2(left - take);
  }
  return out;
}
