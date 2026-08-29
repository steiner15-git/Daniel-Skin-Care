import { useState } from "react";
import { useClinicMode } from "../context/ClinicModeProvider";
import GlobalSearch from "./GlobalSearch";

// אייקון עין — פתוחה במצב רגיל, עם קו-חוצה כשמצב קליניקה פעיל (נורית חיווי)
function EyeIcon({ off }) {
  if (off) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M3 3l18 18" />
        <path d="M10.6 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a13.5 13.5 0 0 1-3.2 3.9M6.3 6.3A13.6 13.6 0 0 0 1 12s4 7 11 7a10.8 10.8 0 0 0 4.2-.8" />
        <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// אייקון חיפוש — כפתור החיפוש הגלובלי (addendum #11)
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

// כותרת מסך עם מפריד עלה-זהב (אלמנט חתימה — סעיף 5 ב-PRD)
// + כפתור "חיפוש גלובלי" (addendum #11) וכפתור "מצב קליניקה" קבועים
// (טשטוש מידע רגיש מול לקוחה — ראו addendum §מצב קליניקה)
export default function ScreenHeader({ title, action, logo }) {
  const { enabled, toggle } = useClinicMode();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <>
      <div className="screen-title">
        <div className="screen-title__lead">
          {logo && <img className="screen-logo" src={logo} alt="" />}
          <h1>{title}</h1>
        </div>
        <div className="screen-title__actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="חיפוש"
            title="חיפוש בכל האפליקציה"
            onClick={() => setSearchOpen(true)}
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            className={"icon-btn clinic-toggle" + (enabled ? " clinic-toggle--on" : "")}
            aria-label={enabled ? "כיבוי מצב קליניקה" : "הפעלת מצב קליניקה"}
            title={enabled ? "מצב קליניקה פעיל — לחצי לכיבוי" : "מצב קליניקה כבוי — לחצי להפעלה"}
            onClick={toggle}
          >
            <EyeIcon off={enabled} />
          </button>
          {action}
        </div>
      </div>
      <hr className="leaf-divider" />
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
