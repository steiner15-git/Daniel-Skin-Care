import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { requestSilentDriveToken } from "./googleDrive";

const AuthContext = createContext(null);

// מצב תצוגה מקומי בלבד: כשמוגדר VITE_DEV_USER=1 מדלגים על ההתחברות ל-Google
// ומזריקים משתמשת מדומה כדי לראות/לנווט את ה-UI (למשל כשמנגנון אבטחה חוסם את הפופ-אפ).
// לעולם אינו פעיל בפרודקשן — נשלט בדגל סביבה בלבד.
const DEV_USER =
  import.meta.env.VITE_DEV_USER === "1"
    ? { uid: "dev-local-user", displayName: "מצב בדיקה מקומי", email: "dev@local" }
    : null;

// Client ID מסוג Web OAuth — לרענון שקט של טוקן Drive באמצעות Google Identity
// Services. חשוב: זהו ה-Client ID ה"רגיל", **הקיים**, שנוצר אוטומטית ע"י
// Firebase (ולא client חדש) — כי רק ל-client שאליו כבר יש הסכמה שמורה
// מההתחברות הראשונית ניתן לרענן טוקן בשקט (prompt: "") בלי לפתוח פופ-אפ.
const DRIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// מרווח ביטחון: מרעננים טוקן כ-5 דקות לפני שהוא פג בפועל.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
// בדיקת רענון פרואקטיבית ברקע כל 20 דקות (בלי קשר לפעולת המשתמשת) — כך
// שבפועל טוקן כמעט אף פעם לא "נתפס" פג-תוקף באמצע שימוש אמיתי, ולא נדרש
// רענון "בזמן אמת" שעלול להיתקל בחסימת פופ-אפ.
const PROACTIVE_CHECK_INTERVAL_MS = 20 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_USER);
  const [loading, setLoading] = useState(!DEV_USER);
  // access token של Google Drive, מתקבל בעת ההתחברות (scope drive.file)
  const [driveToken, setDriveToken] = useState(null);
  // דגל: רענון שקט נכשל ונדרשת פעולה ידנית. אין ניסיון אוטומטי לפתוח פופ-אפ
  // כשזה קורה — דפדפנים חוסמים פופ-אפ שאינו תוצאה ישירה וסינכרונית של לחיצה,
  // ומרבית שרשראות הרענון שלנו הן א-סינכרוניות. במקום זאת מוצג לחצן מפורש.
  const [driveNeedsReauth, setDriveNeedsReauth] = useState(false);
  const driveTokenRefreshAtRef = useRef(0);
  // מעקב אחר הטוקן העדכני ביותר בלי תלות ב-closure של state (driveToken
  // בתוך useCallback/interval יכול להיות "תפוס" מרונדר ישן) — ref תמיד עדכני.
  const driveTokenRef = useRef(null);
  // נעילה משותפת אחת לכל נסיונות הרענון השקט — קריטי כי trySilentRefresh
  // נקרא מכמה מקומות שונים (ensureDriveToken, withDriveToken, הבדיקה
  // הפרואקטיבית התקופתית, ומאזין ה-visibility/focus). ל-tokenClient הפנימי
  // ב-googleDrive.js יש callback יחיד ומשותף — אם שתי קריאות רצות במקביל,
  // השנייה דורסת את ה-callback של הראשונה והראשונה "נתקעת" עד ל-timeout
  // ומחזירה false בטעות (מה שיכול להדליק את באנר driveNeedsReauth גם כשהרענון
  // בפועל הצליח). נעילה יחידה מבטיחה שרק ניסיון רענון אחד רץ בכל רגע נתון,
  // וכל שאר הקריאות המקבילות "רוכבות" על אותה תוצאה.
  const refreshInFlightRef = useRef(null);

  useEffect(() => {
    if (DEV_USER) return; // דילוג על מנוי ההתחברות במצב תצוגה מקומי
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  function storeDriveToken(token, expiresInSec = 3600) {
    setDriveToken(token);
    driveTokenRef.current = token;
    driveTokenRefreshAtRef.current = token
      ? Date.now() + expiresInSec * 1000 - TOKEN_REFRESH_BUFFER_MS
      : 0;
    if (token) setDriveNeedsReauth(false);
  }

  function isStillFresh() {
    return !!driveTokenRef.current && Date.now() < driveTokenRefreshAtRef.current;
  }

  // מבטל את "התוקף המקומי" של הטוקן בלי לאפס את driveTokenRef עצמו — כופה על
  // ensureDriveToken()/isStillFresh() הבאים לנסות רענון שקט, גם אם לפי המעקב
  // המקומי (deadline) הטוקן היה אמור עדיין להיות תקף. נדרש כש-Drive בפועל
  // דוחה טוקן שנחשב "טרי": למשל אחרי שהאפליקציה הייתה מושהית ברקע (iOS
  // Safari מקפיא טיימרים של עמודים ברקע — הבדיקה הפרואקטיבית התקופתית פשוט
  // לא רצה בזמן ההשהיה), כך שבפועל חלף יותר זמן משנרשם מקומית. ראו
  // withDriveToken למטה — זהו המקום היחיד שקורא לפונקציה הזו.
  const invalidateDriveToken = useCallback(() => {
    driveTokenRefreshAtRef.current = 0;
  }, []);

  // ניסיון רענון שקט (ללא פופ-אפ), עם נעילה משותפת כך שרק ריצה אחת בפועל
  // מתבצעת בכל זמן נתון — כל קריאה נוספת שמגיעה תוך כדי ריצה קיימת "מצטרפת"
  // לאותה הבטחה במקום לפתוח בקשה מקבילה נוספת שתדרוס את ה-callback המשותף.
  // מחזיר true בהצלחה.
  const trySilentRefresh = useCallback(async () => {
    if (DEV_USER) return false;

    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    refreshInFlightRef.current = (async () => {
      try {
        const silent = await requestSilentDriveToken(DRIVE_CLIENT_ID);
        if (silent?.token) {
          storeDriveToken(silent.token, silent.expiresIn);
          return true;
        }
        return false;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // רענון פרואקטיבי ברקע: מתבצע מיד כשיש משתמשת מחוברת, וחוזר על עצמו כל
  // PROACTIVE_CHECK_INTERVAL_MS — כדי שברוב המקרים, כשמגיע רגע שבו המשתמשת
  // באמת צריכה להעלות/להוריד קובץ מ-Drive, כבר יש טוקן טרי מוכן וממתין.
  // כמו כן מרעננים מיד כשהטאב/האפליקציה חוזרים לחזית (visibilitychange/
  // focus) — תופס במהירות מקרה שבו הטלפון היה נעול/ברקע זמן רב, במקום
  // לחכות ל-tick הבא של האינטרוול (עד 20 דקות).
  //
  // הערה (דיון ארכיטקטורה, ספטמבר 2026): במובייל (iOS Safari בפרט) טיימרים
  // של עמוד ברקע מוקפאים — האינטרוול הזה לא בהכרח "מתקתק" כשהאפליקציה
  // סגורה/ברקע. רענון ה-focus/visibility תופס את רוב המקרים בפועל, אבל אם
  // בקשת Drive נורית ממש לפני שהוא הספיק לסיים — אין עדיין הגנה ברמה הזו;
  // ההגנה לתרחיש הזה היא withDriveToken למטה (רענון+ניסיון-חוזר על 401
  // אמיתי), לא הרחבה נוספת של המנגנון הפרואקטיבי כאן.
  useEffect(() => {
    if (DEV_USER || !user) return;

    trySilentRefresh();

    function refreshIfStale() {
      if (!isStillFresh()) trySilentRefresh();
    }

    const interval = setInterval(refreshIfStale, PROACTIVE_CHECK_INTERVAL_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") refreshIfStale();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshIfStale);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refreshIfStale);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function signIn() {
    if (DEV_USER) {
      setUser(DEV_USER);
      return DEV_USER;
    }
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    storeDriveToken(credential?.accessToken ?? null);
    return result.user;
  }

  // מחזיר access token תקף ל-Drive:
  // 1. טוקן קיים ועדיין בתוקף (לפי המעקב שלנו) → מוחזר מיד.
  // 2. אחרת מנסה רענון שקט (משתף נעילה עם כל קריאה מקבילה אחרת — ראו
  //    trySilentRefresh לעיל).
  // 3. אם גם זה נכשל → מדליק driveNeedsReauth ומחזיר null.
  //
  // הערה: זו עדיין הפונקציה הנכונה לשימוש כש"רק צריך טוקן" בלי לבצע קריאת
  // Drive מיד (למשל תצוגת "מאמתת חיבור…" מקדימה ב-useDriveUpload.js). לביצוע
  // קריאת Drive בפועל, עם הגנה מפני 401 אמיתי, יש להשתמש ב-withDriveToken
  // למטה — לא לקרוא ל-ensureDriveToken ולנהל את קריאת ה-API בנפרד.
  const ensureDriveToken = useCallback(async () => {
    if (DEV_USER) return null;

    if (isStillFresh()) return driveTokenRef.current;

    const ok = await trySilentRefresh();
    if (ok) return driveTokenRef.current;

    setDriveNeedsReauth(true);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trySilentRefresh]);

  // ---------- withDriveToken: נקודת הכניסה היחידה לביצוע קריאת Drive בפועל ----------
  // עוטף כל קריאה שדורשת גישה ל-Drive: מבטיח טוקן תקף (דרך ensureDriveToken),
  // מריץ את הפעולה שהתקבלה, ואם היא נכשלת בכשל-אימות אמיתי (הפעולה זורקת
  // שגיאה עם code==="drive-auth" — ראו DriveAuthError/isDriveAuthFailure
  // ב-googleDrive.js, בשימוש בפועל ב-photos.js וב-backup.js) — מבטלת את
  // התוקף המקומי (invalidateDriveToken), מנסה רענון שקט יחיד, ומריצה את
  // הפעולה מחדש פעם אחת בלבד עם הטוקן החדש. לעולם לא יותר מניסיון חוזר אחד.
  //
  // זה סוגר פער ספציפי שבינו לבין ensureDriveToken לבדו: ensureDriveToken
  // סומך על מעקב מקומי (deadline מחושב) כדי להחליט אם הטוקן "טרי" — אבל אם
  // המעקב הזה שגוי בפועל (למשל כי טיימרי הרענון הפרואקטיביים לא רצו בזמן
  // שהאפליקציה הייתה מושהית ברקע, תרחיש שכיח ב-PWA שנפתחת לזמן קצר ולעיתים
  // רחוקות), Drive עצמה תדחה את הטוקן עם 401 גם אם isStillFresh() חשב שהוא
  // בסדר. withDriveToken הוא המקום היחיד שמזהה את הפער הזה בפועל ומתקן אותו
  // בשקיפות, בלי שהקוד הקורא (אלבום, גיבוי, העלאת קבצים) יצטרך לדעת על כך.
  //
  // אם גם הרענון השקט בתוך withDriveToken נכשל, נזרקת שגיאה עם
  // code==="reauth-required" — הקורא (למשל runBackupOnce) יכול להתייחס אליה
  // כמו ל-"no-token" הרגילה (שתיהן דורשות את אותו UI: כפתור התחברות מחדש).
  //
  // כל צרכן Drive חדש חייב לעטוף את קריאת ה-API שלו כאן, ולעולם לא לממש
  // רענון/ניסיון-חוזר עצמאי משלו (ראו ההערות ב-photos.js/backup.js).
  const withDriveToken = useCallback(
    async (operation) => {
      const token = await ensureDriveToken();
      if (!token) {
        const err = new Error("drive-no-token");
        err.code = "no-token";
        throw err;
      }
      try {
        return await operation(token);
      } catch (e) {
        if (e?.code !== "drive-auth") throw e;

        invalidateDriveToken();
        const ok = await trySilentRefresh();
        if (!ok) {
          setDriveNeedsReauth(true);
          const reauthErr = new Error("drive-reauth-required");
          reauthErr.code = "reauth-required";
          throw reauthErr;
        }
        return await operation(driveTokenRef.current);
      }
    },
    [ensureDriveToken, trySilentRefresh, invalidateDriveToken]
  );

  // התחברות מחדש מפורשת ל-Drive. יש לקרוא לפונקציה הזו ישירות מתוך onClick
  // של כפתור (לא מקוננת בתוך שרשרת async אחרת) — כדי שהדפדפן יזהה את הפופ-אפ
  // כתוצאה ישירה של פעולת משתמשת ולא יחסום אותו.
  async function reauthorizeDrive() {
    if (DEV_USER) return null;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken ?? null;
    storeDriveToken(token);
    return token;
  }

  function logOut() {
    storeDriveToken(null);
    setDriveNeedsReauth(false);
    return signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        driveToken,
        driveNeedsReauth,
        signIn,
        logOut,
        ensureDriveToken,
        withDriveToken,
        reauthorizeDrive,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
