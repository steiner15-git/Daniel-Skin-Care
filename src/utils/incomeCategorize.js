// קיבוץ הכנסות לקטגוריות עבור טאבי "סיכום" המורחבים ב-Business.jsx
// (addendum §3+4). כלל מחייב: כל רשומת הכנסה משויכת לקטגוריה אחת בלבד
// ברשימה המדורגת (ללא כפילות) — הכנסת סדרה משויכת לשם הסדרה עצמה, ולא גם
// לטיפולים שהיא מכסה (אלה מקבלים ייצוג חזותי נפרד ומוערך בגרף בלבד, ראו
// packageAttributedByTreatment למטה).

export function categorizeIncome(r) {
  if (r.source === "series") return { type: "series", name: r.treatmentName || "סדרה" };
  if (r.source === "product") return { type: "product", name: r.treatmentName || "מוצר" };
  if ((r.source === "appointment" || r.source === "manual") && r.treatmentName) {
    return { type: "treatment", name: r.treatmentName };
  }
  return { type: "other", name: "הכנסות אחרות" };
}

// רשימה מדורגת [{ name, amount }] עבור סוג קטגוריה נתון (treatment/series/
// product), ממוינת מהגבוה לנמוך. income מסונן מראש לפי טווח ע"י הקורא.
export function summarizeByType(income, type) {
  const totals = new Map();
  for (const r of income) {
    const cat = categorizeIncome(r);
    if (cat.type !== type) continue;
    totals.set(cat.name, (totals.get(cat.name) || 0) + (Number(r.amount) || 0));
  }
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// סכימת הכנסה לפי לקוחה (addendum §4). הכנסה בלי שיוך לקוחה → "ללא שיוך".
// key מזהה באופן יציב (clientId כשקיים, אחרת שם, אחרת "none") — נדרש כדי
// שגרף/רשימה יתאמו זה לזה גם ללא clientId אמיתי (למשל הכנסות ישנות).
export function summarizeByClient(income) {
  const totals = new Map();
  for (const r of income) {
    const amount = Number(r.amount) || 0;
    if (!amount) continue;
    let key, clientId, clientName;
    if (r.clientId) {
      key = r.clientId;
      clientId = r.clientId;
      clientName = r.clientName || "לקוחה";
    } else if (r.clientName) {
      key = "name:" + r.clientName;
      clientId = null;
      clientName = r.clientName;
    } else {
      key = "none";
      clientId = null;
      clientName = "ללא שיוך";
    }
    const prev = totals.get(key) || { key, clientId, clientName, amount: 0 };
    prev.amount += amount;
    totals.set(key, prev);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

// הכנסה "מיוחסת" (מוערכת) לטיפול X דרך חבילות שמכסות אותו — למקטע הבהיר
// בגרף במצב "טיפולים" בלבד. מידע חזותי נוסף בלבד: אינו נספר בכרטיס הסיכום
// המספרי או ברשימה המדורגת (כדי לא לכפול את הכנסת רכישת הסדרה, שכבר
// נספרה בנפרד תחת שם הסדרה עצמה).
//
// שיטת האומדן: לכל תור שנסגר (status "done") וחויב בפועל מחבילה
// (chargedFromPackage), מיוחס לטיפול שלו חלק יחסי ממחיר רכישת הסדרה —
// (סכום ההכנסה שנוצרה ברכישת החבילה) חלקי (מספר המפגשים הכולל בה) —
// כלומר "השווי המשוער" של אותו מפגש בודד בתמחור החבילה. חבילה שמכסה כמה
// טיפולים אינה מפוצלת ביניהם לפי טיפול בפועל שנוצל בה; זהו קירוב מכוון.
export function packageAttributedByTreatment(appts, packages, incomeById) {
  const pkgById = new Map(packages.map((p) => [p.id, p]));
  const totals = new Map();
  for (const a of appts) {
    if (a.status !== "done" || !a.chargedFromPackage || !a.clientPackageId) continue;
    const pkg = pkgById.get(a.clientPackageId);
    if (!pkg || !pkg.totalSessions) continue;
    const inc = pkg.incomeId ? incomeById[pkg.incomeId] : null;
    if (!inc) continue;
    const perSession = (Number(inc.amount) || 0) / pkg.totalSessions;
    const name = a.treatmentName || "טיפול";
    totals.set(name, (totals.get(name) || 0) + perSession);
  }
  return totals;
}
