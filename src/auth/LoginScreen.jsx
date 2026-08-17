import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { cachedLogo } from "../utils/logo";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const logo = cachedLogo();

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user") {
        setError("ההתחברות נכשלה. נסי שוב.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login__card card">
        <div className="login__logo">
          {logo ? (
            <img className="login__logo-img" src={logo} alt="לוגו" />
          ) : (
            <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
              <path
                d="M20 44c0-14 10-24 24-26-2 16-12 26-24 26z"
                fill="none"
                stroke="#A87C3F"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 44c6-8 14-14 22-16"
                fill="none"
                stroke="#A87C3F"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
        <h1 className="head">Daniel Skin Care</h1>
        <p className="muted login__sub">Cosmetic Clinic</p>
        <hr className="leaf-divider" style={{ margin: "16px auto 22px" }} />
        <button className="btn btn--block" onClick={handleSignIn} disabled={busy}>
          {busy ? "מתחברת…" : "התחברות עם Google"}
        </button>
        {error && <p className="login__error">{error}</p>}
      </div>
    </div>
  );
}
