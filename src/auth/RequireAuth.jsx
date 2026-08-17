import { useAuth } from "./AuthProvider";
import LoginScreen from "./LoginScreen";

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login">
        <p className="muted">טוען…</p>
      </div>
    );
  }
  if (!user) return <LoginScreen />;
  return children;
}
