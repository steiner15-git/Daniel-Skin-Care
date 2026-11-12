// עזרי ניווט — "חזרה למסך הקודם".
//
// react-router (BrowserRouter) שומר ב-window.history.state את השדה idx: אינדקס
// הרשומה בהיסטוריה של האפליקציה. idx > 0 אומר שיש מסך קודם *באפליקציה*, ואז
// navigate(-1) מחזיר בדיוק אליו (כולל ה-URL שלו: טאב, תאריך, סינון).
// idx === 0 (כניסה ישירה/רענון בדף הראשון) → אין לאן לחזור, ולכן ניווט ל-fallback.
// כך לעולם לא יוצאים בטעות מהאפליקציה.

export function canGoBack() {
  try {
    return (window.history.state?.idx ?? 0) > 0;
  } catch {
    return false;
  }
}

export function goBackOr(navigate, fallback) {
  if (canGoBack()) navigate(-1);
  else navigate(fallback, { replace: true });
}
