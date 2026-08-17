import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBWwdVxppDXVozZEGWWQkMXicVVewRDFkU",
  authDomain: "daniel-skin-care.firebaseapp.com",
  projectId: "daniel-skin-care",
  storageBucket: "daniel-skin-care.firebasestorage.app",
  messagingSenderId: "803941379738",
  appId: "1:803941379738:web:358542a512379b366bf923",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Google sign-in, with the Drive scope requested up front so we get a
// usable Drive access token as part of sign-in (no separate consent step
// later when the user wants to attach a file).
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/drive.file");

export const db = getFirestore(app);

// חיבור לאמולטורים מקומיים (Auth + Firestore) כשמוגדר VITE_USE_EMULATOR=1.
// מאפשר בדיקה מלאה על localhost בלבד, בלי הרשת של החברה ובלי Google אמיתי.
if (import.meta.env.VITE_USE_EMULATOR === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
