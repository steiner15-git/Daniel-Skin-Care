import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import { useCollectionData, useSettingDoc } from "../data";
import { formatTime, formatDate, sameDay } from "../utils/datetime";
import { formatILS } from "../utils/money";
import { fullName, ageFromBirthday } from "./clients/clientUtils";

const CAP = 3;

function GearButton() {
  const navigate = useNavigate();
  return (
    <button className="icon-btn" aria-label="הגדרות" onClick={() => navigate("/settings")}>
      <svg viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </svg>
    </button>
  );
}

function daysUntilBirthday(birthday) {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b)) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    next.setFullYear(now.getFullYear() + 1);
  return Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { items: appts } = useCollectionData("appointments");
  const { items: events } = useCollectionData("events");
  const { items: income } = useCollectionData("income");
  const { items: clients } = useCollectionData("clients");
  const { data: verifDoc } = useSettingDoc("paymentVerification");
  const { data: business } = useSettingDoc("business");
  const verifDays = verifDoc?.days ?? 7;

  const now = Date.now();
  const today = new Date();

  const todayItems = useMemo(() => {
    const a = appts
      .filter((x) => x.status !== "cancelled" && sameDay(x.start, today))
      .map((x) => ({ id: x.id, start: x.start, dur: x.durationMin || 0, title: x.treatmentName, sub: x.clientName, type: "appt" }));
    const e = events
      .filter((x) => sameDay(x.start, today))
      .map((x) => ({ id: x.id, start: x.start, dur: x.durationMin || 0, title: x.title, sub: "אירוע", type: "event" }));
    // מסתירים פריטים שכבר הסתיימו; מדגישים פריט שמתקיים כעת
    return [...a, ...e]
      .map((it) => {
        const startMs = new Date(it.start).getTime();
        const endMs = startMs + it.dur * 60000;
        return { ...it, ended: endMs < now, inProgress: startMs <= now && now < endMs };
      })
      .filter((it) => !it.ended)
      .sort((x, y) => new Date(x.start) - new Date(y.start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts, events, now]);

  const pending = useMemo(
    () =>
      appts
        .filter((x) => x.status !== "cancelled" && x.status !== "done" && new Date(x.start).getTime() < now)
        .sort((x, y) => new Date(x.start) - new Date(y.start)),
    [appts, now]
  );

  const birthdays = useMemo(
    () =>
      clients
        .filter((c) => !c.archived)
        .map((c) => ({ c, days: daysUntilBirthday(c.birthday) }))
        .filter((x) => x.days != null && x.days <= 7)
        .sort((a, b) => a.days - b.days),
    [clients]
  );

  const unpaid = useMemo(
    () =>
      income.filter((r) => {
        if (r.paid) return false;
        const age = (now - new Date(r.date).getTime()) / 86400000;
        return age >= verifDays;
      }),
    [income, now, verifDays]
  );

  return (
    <>
      <ScreenHeader title="בית" logo={business?.logoData} action={<GearButton />} />

      {/* לו"ז היום */}
      <h3 className="group-title">לו״ז היום · {formatDate(today.toISOString())}</h3>
      {todayItems.length === 0 ? (
        <div className="empty-state" style={{ padding: 16 }}>אין תורים או אירועים היום.</div>
      ) : (
        <div className="list">
          {todayItems.map((it) => (
            <div
              key={it.type + it.id}
              className={
                "card list-item" +
                (it.type === "event" ? " list-item--event" : "") +
                (it.inProgress ? " list-item--now" : "")
              }
            >
              <div className="list-item__main">
                <strong>{formatTime(it.start)} · {it.title}</strong>
                <span className="muted">{it.sub}{it.inProgress ? " · מתקיים כעת" : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ממתינים לסגירה */}
      {pending.length > 0 && (
        <>
          <h3 className="group-title">ממתינים לסגירה ({pending.length})</h3>
          <div className="list">
            {pending.slice(0, CAP).map((a) => (
              <button
                key={a.id}
                className="card list-item list-item--pending as-button"
                onClick={() => navigate(`/appointments/${a.id}/close`, { state: { from: "dashboard" } })}
              >
                <div className="list-item__main">
                  <strong>{a.treatmentName} · {a.clientName}</strong>
                  <span className="muted">{formatDate(a.start)} · {formatTime(a.start)}</span>
                </div>
                <span className="nav-card__chev">‹</span>
              </button>
            ))}
          </div>
          {pending.length > CAP && (
            <Link to="/calendar" className="show-all">הצג הכל ({pending.length}) →</Link>
          )}
        </>
      )}

      {/* תזכורות */}
      {(birthdays.length > 0 || unpaid.length > 0) && (
        <>
          <h3 className="group-title">תזכורות</h3>
          <div className="card reminders">
            {birthdays.slice(0, CAP).map(({ c, days }) => (
              <div key={c.id} className="reminder">
                🎂 יום הולדת: {fullName(c)} {days === 0 ? "(היום)" : days === 1 ? "(מחר)" : `(בעוד ${days} ימים)`}
                {ageFromBirthday(c.birthday) != null && ` · גיל ${ageFromBirthday(c.birthday) + (days === 0 ? 0 : 1)}`}
              </div>
            ))}
            {unpaid.length > 0 && (
              <button
                className="reminder reminder--link"
                onClick={() => navigate("/business?tab=income&filter=unpaid")}
              >
                💰 {unpaid.length} תשלומים טרם אומתו (מעל {verifDays} ימים) →
              </button>
            )}
          </div>
        </>
      )}

      {/* פעולות מהירות */}
      <h3 className="group-title">פעולות מהירות</h3>
      <div className="quick-actions">
        <button className="btn btn--ghost" onClick={() => navigate("/business/income/new")}>הכנסה</button>
        <button className="btn btn--ghost" onClick={() => navigate("/business/expense/new")}>הוצאה</button>
        <button className="btn btn--ghost" onClick={() => navigate("/series")}>סדרות</button>
        <button className="btn btn--ghost" onClick={() => navigate("/products")}>מוצרים</button>
      </div>

      <Link to="/album" className="nav-card" style={{ marginTop: 16 }}>
        <span className="nav-card__icon">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9" r="1.6" />
            <path d="M4 18l5-5 4 4 3-3 4 4" />
          </svg>
        </span>
        <div className="nav-card__body">
          <strong>אלבום תמונות</strong>
          <span className="muted">כל תמונות הלקוחות · סינון ומיון</span>
        </div>
        <span className="nav-card__chev">‹</span>
      </Link>
    </>
  );
}
