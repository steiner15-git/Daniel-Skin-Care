import { useRepo, useAuditLog } from "./index";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { fullName } from "../screens/clients/clientUtils";

// אישור מתנת הפניות ללקוחה מפנה — משותף לרשימת הלקוחות (ClientsList) ולכרטיסיית
// הלקוחה (ClientCard). כל אישור מסמן מתנה אחת כשניתנה: referralRewardsGiven
// גדל ב-1. אם עדיין נשארו תגמולים ממתינים (למשל 6 הפניות בסף 3) — ההתראה
// והבאדג' נשארים עד לאישור הבא. הפעולה נרשמת בלוג השינויים.
// מחזיר פונקציה: approve(client) → true אם אושר, false אם בוטל/נכשל.
export function useReferralRewardApproval() {
  const repo = useRepo("clients");
  const log = useAuditLog();
  const confirmDialog = useConfirm();

  return async function approve(client) {
    const given = Number(client.referralRewardsGiven) || 0;
    const ok = await confirmDialog({
      title: "אישור מתנת הפניות",
      message: `לסמן שמתנת ההפניות ניתנה ל${fullName(client)}?`,
      confirmLabel: "אישור",
    });
    if (!ok) return false;
    try {
      await repo.update(client.id, { referralRewardsGiven: given + 1 });
      await log({
        action: "referral_reward_given",
        entity: { type: "client", id: client.id, desc: fullName(client) },
        before: { referralRewardsGiven: given },
        after: { referralRewardsGiven: given + 1 },
      });
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "אישור המתנה נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return false;
    }
    return true;
  };
}
