import { Link, useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useAuth } from "../../auth/AuthProvider";

const SECTIONS = [
  { to: "/settings/business", title: "פרטי עסק", desc: "שם, אימייל, כתובת, טלפון, לוגו" },
  { to: "/settings/treatments", title: "רשימת טיפולים", desc: "שם, משך ומחיר לכל טיפול" },
  { to: "/settings/invitation", title: "תוכן זימון", desc: "תבנית מייל הזימון ללקוחה" },
  { to: "/settings/reminders", title: "תזכורות", desc: "אימות תשלום, לקוחות לא פעילות ובאדג'ים בניווט" },
  { to: "/settings/expense-categories", title: "קטגוריות הוצאה", desc: "רשימת קטגוריות להוצאות" },
  { to: "/settings/payment-methods", title: "אמצעי תשלום", desc: "מזומן, אשראי, ביט ועוד" },
  { to: "/settings/hours", title: "שעות פעילות", desc: "ימי עבודה ושעות (התראה בלבד)" },
  { to: "/settings/backup", title: "גיבוי", desc: "סטטוס גיבוי אוטומטי ל-Drive, גיבוי ידני" },
  { to: "/settings/audit", title: "לוג שינויים", desc: "תיעוד פעולות רגישות על נתונים" },
];

export default function SettingsHome() {
  const { user, logOut } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <ScreenHeader
        title="הגדרות"
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/")}>
            חזרה
          </button>
        }
      />

      {SECTIONS.map((s) => (
        <Link key={s.to} to={s.to} className="nav-card">
          <span className="nav-card__body">
            <strong>{s.title}</strong>
            <span className="muted">{s.desc}</span>
          </span>
          <span className="nav-card__chev">‹</span>
        </Link>
      ))}

      <button
        className="btn btn--muted btn--block"
        style={{ marginTop: 8 }}
        onClick={logOut}
      >
        התנתקות
      </button>

      <p className="signed-as">
        מחוברת כ־ {user?.displayName || user?.email}
      </p>
    </>
  );
}
