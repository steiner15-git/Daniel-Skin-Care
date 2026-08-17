import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const AuthContext = createContext(null);

// מצב תצוגה מקומי בלבד: כשמוגדר VITE_DEV_USER=1 מדלגים על ההתחברות ל-Google
// ומזריקים משתמשת מדומה כדי לראות/לנווט את ה-UI (למשל כשמנגנון אבטחה חוסם את הפופ-אפ).
// לעולם אינו פעיל בפרודקשן — נשלט בדגל סביבה בלבד.
const DEV_USER =
  import.meta.env.VITE_DEV_USER === "1"
    ? { uid: "dev-local-user", displayName: "מצב בדיקה מקומי", email: "dev@local" }
    : null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_USER);
  const [loading, setLoading] = useState(!DEV_USER);
  // access token של Google Drive, מתקבל בעת ההתחברות (scope drive.file)
  const [driveToken, setDriveToken] = useState(null);
  // בקשת טוקן אחת בטיסה — מונע ריבוי פופ-אפים כשכמה רכיבים מבקשים טוקן בו-זמנית
  const tokenRequestRef = useRef(null);

  useEffect(() => {
    if (DEV_USER) return; // דילוג על מנוי ההתחברות במצב תצוגה מקומי
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  async function signIn() {
    if (DEV_USER) {
      setUser(DEV_USER);
      return DEV_USER;
    }
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    setDriveToken(credential?.accessToken ?? null);
    return result.user;
  }

  // מחזיר access token תקף ל-Drive; אם אין (למשל לאחר רענון דף) — מפעיל פופ-אפ
  // התחברות מחדש כדי לרכוש טוקן טרי. במצב תצוגה מקומי אין Drive ולכן מחזיר null.
  // כמה קוראים בו-זמנית (למשל רשת ממוזערות באלבום) חולקים אותה בקשת פופ-אפ יחידה.
  async function ensureDriveToken() {
    if (DEV_USER) return null;
    if (driveToken) return driveToken;
    if (tokenRequestRef.current) return tokenRequestRef.current;
    tokenRequestRef.current = (async () => {
      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken ?? null;
        setDriveToken(token);
        return token;
      } finally {
        tokenRequestRef.current = null;
      }
    })();
    return tokenRequestRef.current;
  }

  function logOut() {
    setDriveToken(null);
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
