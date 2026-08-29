// צבע דטרמיניסטי (HSL) לפי אינדקס, לשימוש בגרפים עם מספר קטגוריות לא ידוע
// מראש (טיפולים/סדרות/מוצרים/לקוחות בטאבי הסיכום המורחבים, addendum §3+4).
// הצעד הלא-מחזורי (47) מפזר גוונים סמוכים גם עם הרבה פריטים ברצף.
export function colorForIndex(i, opts = {}) {
  const { saturation = 55, lightness = 50 } = opts;
  const hue = (i * 47) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// גוון "בהיר" מאותו hue בסיסי — לשימוש במקטע משני (הכנסה משוערת מחבילה),
// מוצג לצד המקטע הכהה (הכנסה ישירה) של אותו טיפול, מאותה משפחת צבע.
export function lightVariant(i, opts = {}) {
  return colorForIndex(i, { saturation: opts.saturation ?? 45, lightness: opts.lightness ?? 78 });
}
