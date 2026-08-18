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
import { silentDriveToken } from "./googleDrive";

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
  const tokenRequestRef = useRef(null);

  useEffect(() => {
    if (DEV_USER) return; // דילוג על מנוי ההתחברות במצב תצוגה מקומי
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  function storeDriveToken(token, expiresInSec = 3600) {
    setDriveToken(token);
    driveTokenRefreshAtRef.current = token
      ? Date.now() + expiresInSec * 1000 - TOKEN_REFRESH_BUFFER_MS
      : 0;
    if (token) setDriveNeedsReauth(false);
  }

  // ניסיון רענון שקט יחיד (ללא פופ-אפ). מחזיר true בהצלחה.
  const trySilentRefresh = useCallback(async () => {
    if (DEV_USER) return false;
    const silent = await silentDriveToken(DRIVE_CLIENT_ID);
    if (silent?.token) {
      storeDriveToken(silent.token, silent.expiresIn);
      return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // רענון פרואקטיבי ברקע: מתבצע מיד כשיש משתמשת מחוברת, וחוזר על עצמו כל
  // PROACTIVE_CHECK_INTERVAL_MS — כדי שברוב המקרים, כשמגיע רגע שבו המשתמשת
  // באמת צריכה להעלות/להוריד קובץ מ-Drive, כבר יש טוקן טרי מוכן וממתין.
  useEffect(() => {
    if (DEV_USER || !user) return;
    trySilentRefresh();
    const interval = setInterval(() => {
      const stillFresh = driveToken && Date.now() < driveTokenRefreshAtRef.current;
      if (!stillFresh) trySilentRefresh();
    }, PROACTIVE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
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
  // 2. אחרת מנסה רענון שקט פעם אחת.
  // 3. אם גם זה נכשל → מדליק driveNeedsReauth ומחזיר null. לא מנסה פופ-אפ
  //    אוטומטית כאן (ראו הערה למעלה) — הקוד הקורא צריך להתמודד עם null
  //    בעדינות (כפי שכבר עושה, למשל storeImage שזורק שגיאה ידידותית),
  //    וה-UI מציג באנר עם כפתור התחברות מחדש מפורש.
  async function ensureDriveToken() {
    if (DEV_USER) return null;

    const stillFresh = driveToken && Date.now() < driveTokenRefreshAtRef.current;
    if (stillFresh) return driveToken;

    if (tokenRequestRef.current) return tokenRequestRef.current;

    tokenRequestRef.current = (async () => {
      try {
        const ok = await trySilentRefresh();
        if (ok) return driveToken;
        setDriveNeedsReauth(true);
        return null;
      } finally {
        tokenRequestRef.current = null;
      }
    })();
    return tokenRequestRef.current;
  }

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
