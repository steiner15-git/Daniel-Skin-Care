import { useMemo } from "react";
import { useSettingDoc } from "./index";

const DEFAULTS = {
  paymentVerificationDays: 7,
  inactiveClientMonths: 6,
  packageExpiryDays: 14, // עדיין לא בשימוש בפועל — נועד לפיצ'ר #12 (התראת פקיעת חבילה)
  showPendingBadge: true,
  showUnpaidBadge: true,
};

// מסמך הגדרות מאוחד לתזכורות (users/{uid}/settings/reminders), עם מיגרציה
// שקטה מהמסמך הישן users/{uid}/settings/paymentVerification (שדה days
// בלבד): כל עוד reminders.paymentVerificationDays לא נשמר בפועל, נופלים
// לערך מהמסמך הישן. לאחר השמירה הראשונה במסך "תזכורות" הערך עובר למסמך
// החדש וה-fallback הופך לבלתי-רלוונטי (אך ממשיך לפעול בשקט, ללא צורך
// במחיקת המסמך הישן).
export function useReminderSettings() {
  const { data: remindersDoc, loading: loadingReminders, save: saveReminders } =
    useSettingDoc("reminders");
  const { data: legacyDoc, loading: loadingLegacy } = useSettingDoc("paymentVerification");

  const loading = loadingReminders || loadingLegacy;

  // עטוף ב-useMemo לפי המסמכים המקוריים (לא לפי אובייקט חדש בכל רינדור) —
  // כדי שצרכנים שסומכים על יציבות ה-reference (למשל useEffect עם data
  // כ-dependency) לא ייכנסו ללולאה אינסופית.
  const data = useMemo(
    () => ({
      ...DEFAULTS,
      ...(legacyDoc?.days != null ? { paymentVerificationDays: legacyDoc.days } : {}),
      ...remindersDoc,
    }),
    [legacyDoc, remindersDoc]
  );

  return { data, loading, save: saveReminders };
}
