import { useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { storeImage } from "./photos";

// עיכוב לפני הצגת "מאמתת חיבור…" — כדי לא להבהב במקרה הרגיל שבו כבר יש
// טוקן טרי בזיכרון ואין המתנה בפועל בפני המשתמשת.
const VERIFY_LABEL_DELAY_MS = 350;

// הוק משותף להעלאת תמונה (אלבום לקוחה / אלבום כללי / חשבונית הכנסה-הוצאה).
// שני תפקידים (addendum #1 + #2):
//   1. משוב ויזואלי בזמן אימות/רענון הטוקן לפני ההעלאה בפועל ("מאמתת חיבור…"),
//      כדי שלא ייראה שהאפליקציה "תקועה" בזמן שהיא בפועל מוודאת חיבור.
//   2. התאוששות מכשל בפועל: הודעת שגיאה עם כפתור פעולה מותאם לסיבה —
//      "התחברות מחדש" (no-token) או "נסי שוב" עם אותו קובץ בדיוק. הקובץ
//      האחרון שנכשל נשמר ב-state זמני של ההוק (לא ב-Firestore) עד הצלחה
//      או איפוס/עזיבת המסך.
export function useDriveUpload() {
  const { ensureDriveToken, reauthorizeDrive } = useAuth();
  const [phase, setPhase] = useState("idle"); // idle | verifying | uploading | error
  const [showVerifying, setShowVerifying] = useState(false);
  const [errorReason, setErrorReason] = useState(null); // "no-token" | "other"
  const lastFileRef = useRef(null); // { file, folders } — לצורך "נסי שוב"
  const verifyTimerRef = useRef(null);

  async function run(file, folders) {
    lastFileRef.current = { file, folders };
    setErrorReason(null);
    setPhase("verifying");
    setShowVerifying(false);
    clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = setTimeout(() => setShowVerifying(true), VERIFY_LABEL_DELAY_MS);

    try {
      // מוודאים/מרעננים טוקן בנפרד לפני ההעלאה בפועל — כך שכשל "אין טוקן"
      // מזוהה במפורש (ולא נבלע בתוך כשל העלאה כללי), ומאפשר הודעת שגיאה
      // עם כפתור מדויק במקום הודעה גנרית. storeImage מוודא טוקן שוב בפנים
      // (ensureDriveToken אידמפוטנטי — מחזיר טוקן קיים אם עדיין טרי).
      await ensureDriveToken();
      clearTimeout(verifyTimerRef.current);
      setShowVerifying(false);
      setPhase("uploading");
      const stored = await storeImage(file, { folders, ensureDriveToken });
      lastFileRef.current = null;
      setPhase("idle");
      return stored;
    } catch (e) {
      clearTimeout(verifyTimerRef.current);
      setShowVerifying(false);
      setErrorReason(e?.message === "no-token" ? "no-token" : "other");
      setPhase("error");
      throw e;
    }
  }

  // נסיון חוזר עם אותו קובץ בדיוק (רשת נפלה / Drive quota וכו').
  function retry() {
    if (!lastFileRef.current) return Promise.resolve(null);
    const { file, folders } = lastFileRef.current;
    return run(file, folders);
  }

  // התחברות מחדש מפורשת + נסיון חוזר אוטומטי. חשוב: reauthorizeDrive() היא
  // השורה הראשונה כאן (סינכרונית עד ה-await הפנימי הראשון שלה, שם בפועל
  // נפתח הפופ-אפ) — כך שגם עטוף בהוק, הפופ-אפ עדיין נחשב תוצאה ישירה של
  // לחיצת המשתמשת ולא נחסם ע"י הדפדפן. יש לקרוא לפונקציה הזו ישירות מתוך
  // onClick של כפתור, לא מקוננת בתוך שרשרת async אחרת.
  async function reconnect() {
    await reauthorizeDrive();
    return retry();
  }

  function reset() {
    clearTimeout(verifyTimerRef.current);
    lastFileRef.current = null;
    setPhase("idle");
    setShowVerifying(false);
    setErrorReason(null);
  }

  const busy = phase === "verifying" || phase === "uploading";
  const label =
    phase === "uploading"
      ? "מעלה…"
      : phase === "verifying"
      ? showVerifying
        ? "מאמתת חיבור…"
        : "מעלה…"
      : null;

  return { phase, busy, label, errorReason, upload: run, retry, reconnect, reset };
}
