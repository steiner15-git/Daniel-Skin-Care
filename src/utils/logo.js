// מפתח מטמון הלוגו ב-localStorage. משמש כדי להציג את הלוגו במסך ההתחברות
// (שנטען לפני אימות, ולכן אין גישה ל-Firestore/Drive של המשתמשת).
export const LOGO_CACHE_KEY = "dsc:logo";

export function cachedLogo() {
  try {
    return localStorage.getItem(LOGO_CACHE_KEY) || "";
  } catch {
    return "";
  }
}
