import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "./BottomNav";
import ScrollReset from "./ScrollReset";
import { IS_LOCAL } from "../data";

export default function AppShell() {
  const location = useLocation();
  return (
    <div className="app">
      <ScrollReset />
      {IS_LOCAL && (
        <div className="local-banner">
          מצב תצוגה מקומי — הנתונים נשמרים במכשיר זה בלבד
        </div>
      )}
      <main className="app__main">
        {/* key לפי הנתיב → אנימציית כניסה עדינה בכל מעבר מסך */}
        <div className="lively" key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
