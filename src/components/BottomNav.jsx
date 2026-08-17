import { NavLink } from "react-router-dom";

const ICONS = {
  home: (
    <svg viewBox="0 0 24 24">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24">
      <path d="M12 5c-2-1.5-5-1.5-7 0v14c2-1.5 5-1.5 7 0 2-1.5 5-1.5 7 0V5c-2-1.5-5-1.5-7 0Z" />
      <path d="M12 5v14" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24">
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6M13 20V9M18 20v-9" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.6-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 15c2.4.2 4.5 2.1 4.5 5" />
      <path d="M15.5 5.2A3 3 0 0 1 18 10" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  ),
};

// 5 מסכים תדירים בבר; הגדרות וסדרות-ומוצרים נגישים ממסך הבית
const ITEMS = [
  { to: "/", label: "בית", icon: "home", end: true },
  { to: "/appointments", label: "תיאום תור", icon: "book" },
  { to: "/calendar", label: "יומן", icon: "calendar" },
  { to: "/clients", label: "לקוחות", icon: "users" },
  { to: "/business", label: "ניהול עסק", icon: "chart" },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            "bottom-nav__item" + (isActive ? " active" : "")
          }
        >
          {ICONS[it.icon]}
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
