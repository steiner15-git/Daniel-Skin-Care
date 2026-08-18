import { useAuth } from "../auth/AuthProvider";
import { IS_LOCAL } from "../data";

// באנר קטן שמופיע רק כשרענון הטוקן השקט ל-Drive נכשל ונדרשת התחברות מחדש
// ידנית (למשל הסכמה בוטלה, עוגיות צד-שלישי חסומות, גלישה פרטית וכו').
// חשוב: הכפתור קורא ל-reauthorizeDrive ישירות מתוך onClick, כדי שהפופ-אפ
// ייחשב תוצאה ישירה של פעולת משתמשת ולא ייחסם ע"י הדפדפן.
export default function DriveReauthBanner() {
  const { driveNeedsReauth, reauthorizeDrive } = useAuth();
  if (IS_LOCAL || !driveNeedsReauth) return null;

  return (
    <div className="drive-reauth-banner">
      <span>החיבור ל-Google Drive פג — תמונות וגיבוי לא יעבדו עד להתחברות מחדש.</span>
      <button className="btn btn--sm" onClick={() => reauthorizeDrive()}>
        התחברות מחדש
      </button>
    </div>
  );
}
