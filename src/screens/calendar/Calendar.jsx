import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo } from "../../data";
import {
  formatTime,
  formatDate,
  sameDay,
  monthLabel,
} from "../../utils/datetime";

const WEEK = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export default function Calendar() {
  const navigate = useNavigate();
  const { items: appts, loading: la } = useCollectionData("appointments");
  const { items: events, loading: le } = useCollectionData("events");
  const { items: income } = useCollectionData("income");
  const apptRepo = useRepo("appointments");
  const eventRepo = useRepo("events");

  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(new Date());
  const [filters, setFilters] = useState({ showPast: true, showEvents: true, treatment: "" });
  const [sortBy, setSortBy] = useState("date");

  // מיפוי מזהה-הכנסה → רשומת הכנסה, כדי לדעת אם תור שנסגר ("status: done")
  // באמת סומן כ"שולם" בפועל, ולא רק "בוצע" (אלו שני מושגים שונים — ראו ItemRow).
  const incomeById = useMemo(() => {
    const map = {};
    for (const r of income) map[r.id] = r;
    return map;
  }, [income]);

  // איחוד תורים ואירועים לרשומות תצוגה אחידות
  const items = useMemo(() => {
    const a = appts
      .filter((x) => x.status !== "cancelled")
      .map((x) => ({
        id: x.id,
        type: "appt",
        start: x.start,
        title: x.treatmentName || "טיפול",
        subtitle: x.clientName || "",
        raw: x,
      }));
    const e = events.map((x) => ({
      id: x.id,
      type: "event",
      start: x.start,
      title: x.title || "אירוע",
      subtitle: "אירוע",
      raw: x,
    }));
    return [...a, ...e];
  }, [appts, events]);

  const treatments = useMemo(
    () => [...new Set(appts.map((a) => a.treatmentName).filter(Boolean))],
    [appts]
  );

  function itemsForDay(day) {
    return items
      .filter((it) => sameDay(it.start, day))
      .sort((x, y) => new Date(x.start) - new Date(y.start));
  }

  function cancelAppt(it) {
    if (!confirm("לבטל את התור?")) return;
    apptRepo.update(it.id, { status: "cancelled" });
  }
  function deleteEvent(it) {
    if (!confirm("למחוק את האירוע?")) return;
    eventRepo.remove(it.id);
  }

  const loading = la || le;

  return (
    <>
      <ScreenHeader
        title="יומן"
        action={
          <button className="btn" onClick={() => navigate("/calendar/event/new")}>
            + אירוע
          </button>
        }
      />

      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={"seg__btn" + (view === "month" ? " on" : "")} onClick={() => setView("month")}>
          לוח שנה
        </button>
        <button className={"seg__btn" + (view === "list" ? " on" : "")} onClick={() => setView("list")}>
          רשימה
        </button>
      </div>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : view === "month" ? (
        <MonthView
          cursor={cursor}
          setCursor={setCursor}
          selected={selected}
          setSelected={setSelected}
          items={items}
          incomeById={incomeById}
          itemsForDay={itemsForDay}
          onEditAppt={(it) => navigate(`/appointments/${it.id}/edit`)}
          onCancelAppt={cancelAppt}
          onResend={(it) => navigate(`/appointments/${it.id}/send`)}
          onClose={(it) => navigate(`/appointments/${it.id}/close`, { state: { from: "calendar" } })}
          onEditEvent={(it) => navigate(`/calendar/event/${it.id}/edit`)}
          onDeleteEvent={deleteEvent}
        />
      ) : (
        <ListView
          items={items}
          incomeById={incomeById}
          filters={filters}
          setFilters={setFilters}
          sortBy={sortBy}
          setSortBy={setSortBy}
          treatments={treatments}
          onEditAppt={(it) => navigate(`/appointments/${it.id}/edit`)}
          onCancelAppt={cancelAppt}
          onResend={(it) => navigate(`/appointments/${it.id}/send`)}
          onClose={(it) => navigate(`/appointments/${it.id}/close`, { state: { from: "calendar" } })}
          onEditEvent={(it) => navigate(`/calendar/event/${it.id}/edit`)}
          onDeleteEvent={deleteEvent}
        />
      )}
    </>
  );
}

function MonthView({
  cursor,
  setCursor,
  selected,
  setSelected,
  items,
  incomeById,
  itemsForDay,
  ...actions
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const hasItems = (day) => items.some((it) => sameDay(it.start, day));
  const dayItems = itemsForDay(selected);

  return (
    <>
      <div className="cal-nav">
        <button className="icon-btn" onClick={() => setCursor(new Date(year, month - 1, 1))}>
          ›
        </button>
        <strong>{monthLabel(cursor)}</strong>
        <button className="icon-btn" onClick={() => setCursor(new Date(year, month + 1, 1))}>
          ‹
        </button>
      </div>

      <div className="cal-grid cal-grid--head">
        {WEEK.map((w) => (
          <div key={w} className="cal-dow">
            {w}
          </div>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((day, i) =>
          day ? (
            <button
              key={i}
              className={
                "cal-cell" +
                (sameDay(selected.toISOString(), day) ? " cal-cell--sel" : "") +
                (sameDay(new Date().toISOString(), day) ? " cal-cell--today" : "")
              }
              onClick={() => setSelected(day)}
            >
              <span>{day.getDate()}</span>
              {hasItems(day) && <span className="cal-dot" />}
            </button>
          ) : (
            <div key={i} className="cal-cell cal-cell--empty" />
          )
        )}
      </div>

      <h3 className="group-title">{formatDate(selected.toISOString())}</h3>
      {dayItems.length === 0 ? (
        <div className="empty-state" style={{ padding: 16 }}>אין תורים או אירועים ביום זה.</div>
      ) : (
        <div className="list">
          {dayItems.map((it) => (
            <ItemRow key={it.type + it.id} it={it} incomeById={incomeById} {...actions} />
          ))}
        </div>
      )}
    </>
  );
}

function ListView({ items, incomeById, filters, setFilters, sortBy, setSortBy, treatments, ...actions }) {
  const now = Date.now();
  const filtered = useMemo(() => {
    let list = items.slice();
    if (!filters.showPast) list = list.filter((it) => new Date(it.start).getTime() >= now);
    if (!filters.showEvents) list = list.filter((it) => it.type !== "event");
    if (filters.treatment)
      list = list.filter((it) => it.type === "appt" && it.title === filters.treatment);
    list.sort((a, b) => {
      if (sortBy === "client") return (a.subtitle || "").localeCompare(b.subtitle || "", "he");
      return new Date(a.start) - new Date(b.start);
    });
    return list;
  }, [items, filters, sortBy, now]);

  // קיבוץ לפי תאריך
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      const key = formatDate(it.start);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <>
      <div className="card filters">
        <div className="filters__row">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={filters.showPast}
              onChange={(e) => setFilters({ ...filters, showPast: e.target.checked })}
            />
            <span>הצג עבר</span>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={filters.showEvents}
              onChange={(e) => setFilters({ ...filters, showEvents: e.target.checked })}
            />
            <span>הצג אירועים</span>
          </label>
        </div>
        <div className="row-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>סינון טיפול</label>
            <select
              value={filters.treatment}
              onChange={(e) => setFilters({ ...filters, treatment: e.target.value })}
            >
              <option value="">הכל</option>
              {treatments.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>סדר לפי</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date">תאריך</option>
              <option value="client">לקוחה</option>
            </select>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">אין פריטים להצגה.</div>
      ) : (
        groups.map(([date, list]) => (
          <div key={date}>
            <h3 className="group-title">{date}</h3>
            <div className="list">
              {list.map((it) => (
                <ItemRow key={it.type + it.id} it={it} incomeById={incomeById} {...actions} />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function ItemRow({ it, incomeById, onEditAppt, onCancelAppt, onResend, onClose, onEditEvent, onDeleteEvent }) {
  const isAppt = it.type === "appt";
  const isDone = isAppt && it.raw.status === "done";
  const isPast = new Date(it.start).getTime() < Date.now();
  const needsClosing = isAppt && !isDone && isPast;

  // "בוצע" (status done) אינו שקול ל"שולם"! תור שחויב מחבילה נחשב מוסדר
  // תמיד (כי כבר שולם מראש ברכישת החבילה). תור רגיל נחשב "שולם" רק אם
  // ההכנסה המשויכת אליו בפועל מסומנת paid=true — לא רק כי הוא "בוצע".
  const linkedIncome = isAppt && it.raw.incomeId ? incomeById[it.raw.incomeId] : null;
  const isPaid = isDone && (!!it.raw.chargedFromPackage || linkedIncome?.paid === true);

  return (
    <div
      className={
        "card list-item" +
        (isAppt ? "" : " list-item--event") +
        (needsClosing ? " list-item--pending" : "")
      }
    >
      <div className="list-item__main">
        <strong>
          {formatTime(it.start)} · {it.title}
        </strong>
        <span className="muted">
          {isAppt ? it.subtitle : "אירוע"}
          {isDone ? "" : isAppt && it.raw.inviteSent ? " · זימון נשלח" : ""}
        </span>
      </div>
      <div className="list-item__actions">
        {isAppt ? (
          isDone ? (
            isPaid ? (
              <span className="badge badge--ok">שולם</span>
            ) : (
              <span className="badge badge--warn">בוצע · לא שולם</span>
            )
          ) : (
            <>
              {needsClosing && (
                <button className="btn" onClick={() => onClose(it)}>
                  אישור ביצוע
                </button>
              )}
              <button className="btn btn--ghost" onClick={() => onEditAppt(it)}>
                עריכה
              </button>
              <button className="btn btn--ghost" onClick={() => onResend(it)}>
                זימון
              </button>
              <button className="btn btn--muted" onClick={() => onCancelAppt(it)}>
                ביטול
              </button>
            </>
          )
        ) : (
          <>
            <button className="btn btn--ghost" onClick={() => onEditEvent(it)}>
              עריכה
            </button>
            <button className="btn btn--muted" onClick={() => onDeleteEvent(it)}>
              מחיקה
            </button>
          </>
        )}
      </div>
    </div>
  );
}
