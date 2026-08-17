import { createContext, useContext, useEffect, useRef, useState } from "react";
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

// Client ID מסוג Web OAuth (Google Cloud Console) — נדרש לרענון שקט של טוקן
// Drive באמצעות Google Identity Services. אם לא מוגדר, המערכת פשוט נופלת
// תמיד לפופ-אפ מלא (ההתנהגות הקודמת) — לא שובר כלום, רק פחות נוח.
const DRIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// מרווח ביטחון: מרעננים את הטוקן כ-5 דקות לפני שהוא פג בפועל, כדי שקריאת
// Drive לעולם לא "תיתקל" בטוקן שפג באמצע פעולה.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_USER);
  const [loading, setLoading] = useState(!DEV_USER);
  // access token של Google Drive, מתקבל בעת ההתחברות (scope drive.file)
  const [driveToken, setDriveToken] = useState(null);
  // זמן (ms מאז epoch) שממנו ואילך יש לרענן את הטוקן הנוכחי מחדש
  const driveTokenRefreshAtRef = useRef(0);
  // בקשת טוקן אחת בטיסה — מונע ריבוי פופ-אפים/בקשות כשכמה רכיבים מבקשים טוקן בו-זמנית
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
  }

  async function signIn() {
    if (DEV_USER) {
      setUser(DEV_USER);
      return DEV_USER;
    }
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    // ל-signInWithPopup הרגיל אין expires_in — מניחים ברירת מחדל שמרנית (שעה)
    storeDriveToken(credential?.accessToken ?? null);
    return result.user;
  }

  // מחזיר access token תקף ל-Drive. סדר ניסיונות:
  // 1. טוקן קיים ועדיין בתוקף (לפי המעקב שלנו) → מוחזר מיד, בלי שום קריאה.
  // 2. רענון שקט (GIS, ללא פופ-אפ) — עובד כל עוד יש הסכמה פעילה בדפדפן.
  // 3. נפילה חזרה לפופ-אפ התחברות מלא (ההתנהגות הישנה) — רק אם השקט נכשל.
  // כמה קוראים בו-זמנית חולקים אותה בקשה יחידה (tokenRequestRef).
  async function ensureDriveToken() {
    if (DEV_USER) return null;

    const stillFresh = driveToken && Date.now() < driveTokenRefreshAtRef.current;
    if (stillFresh) return driveToken;

    if (tokenRequestRef.current) return tokenRequestRef.current;

    tokenRequestRef.current = (async () => {
      try {
        const silent = await silentDriveToken(DRIVE_CLIENT_ID);
        if (silent?.token) {
          storeDriveToken(silent.token, silent.expiresIn);
          return silent.token;
        }

        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken ?? null;
        storeDriveToken(token);
        return token;
      } finally {
        tokenRequestRef.current = null;
      }
    })();
    return tokenRequestRef.current;
  }

  function logOut() {
    storeDriveToken(null);
    return signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, driveToken, signIn, logOut, ensureDriveToken }}
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
