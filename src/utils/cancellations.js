// Phase 4 §5 — מעקב ביטולים. קבוע משותף לרשימת הסיבות (נעשה בו שימוש בשני
// מסכי הביטול: CloseAppointment.jsx ו-Calendar.jsx, כדי שלא יסטו זה מזה),
// ופונקציית ניתוח שיעור-ביטולים משותפת ללקוחה — נצרכת ב-ClientCard.jsx.

export const CANCEL_REASONS = [
  { value: "no_show", label: "לא הגיעה" },
  { value: "cancelled_in_advance", label: "ביטלה מראש" },
  { value: "other", label: "אחר" },
];

export const CANCEL_REASON_LABELS = Object.fromEntries(
  CANCEL_REASONS.map((r) => [r.value, r.label])
);

// סטטיסטיקת ביטולים ללקוחה נתונה, מתוך כל התורים הגולמיים שלה (כולל
// המבוטלים — appts כאן אמור להיות הרשימה הלא-מסוננת). total כולל את כל
// התורים (גם המבוטלים) כמכנה לחישוב האחוז.
export function clientCancellationStats(appts, clientId) {
  const mine = (appts || []).filter((a) => a.clientId === clientId);
  const cancelled = mine.filter((a) => a.status === "cancelled");
  const noShow = cancelled.filter((a) => a.cancelReason === "no_show").length;
  const cancelledInAdvance = cancelled.filter(
    (a) => a.cancelReason === "cancelled_in_advance"
  ).length;
  const otherCancel = cancelled.length - noShow - cancelledInAdvance;
  const totalAppointments = mine.length;
  const cancellationRate =
    totalAppointments > 0 ? Math.round((cancelled.length / totalAppointments) * 100) : 0;

  return {
    totalAppointments,
    cancelledCount: cancelled.length,
    noShow,
    cancelledInAdvance,
    otherCancel,
    cancellationRate,
  };
}
