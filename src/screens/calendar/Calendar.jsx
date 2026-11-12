import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useYearRangeCollectionData, useRepo, useAuditLog } from "../../data";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
import { CANCEL_REASONS, CANCEL_REASON_LABELS } from "../../utils/cancellations";
import { pendingClosureAppts } from "../../utils/reminders";
import {
  formatTime,
  formatDate,
  sameDay,
  monthLabel,
  dateInputValue,
  pad,
} from "../../utils/datetime";

const WEEK = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

// פרמטרי URL של היומן: ?view=list|pending (ללא = לוח שנה), ?date=YYYY-MM-DD
// (היום הנבחר), ?month=YYYY-MM (החודש המוצג). הם מסתנכרנים עם מצב המסך
// (ב-replace, בלי להוסיף רשומות להיסטוריה) — כך שחזרה ליומן אחרי קביעת תור,
// עריכה, אישור ביצוע או שליחת זימון מחזירה לאותו חודש/יום/תצוגה, ולא
// ל"היום". מסכים אחרים יכולים לקשר ישירות ל-/calendar?date=YYYY-MM-DD.
function parseDateParam(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}
function parseMonthParam(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return isNaN(d) ? null : d;
}

export default function Calendar() {
  const navigate = useNavigate();
  const location = useLocation();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const log = useAuditLog();
  const [params, setParams] = useSearchParams();

  // תצוגות: month (לוח שנה) | list (רשימה) | pending (ממתינים לסגירה). כניסה
  // ישירה לתצוגת הממתינים דרך /calendar?view=pending (מרכז "דורש טיפול" בניהול
  // עסק, ו"הצג הכל" בדשבורד), וגם חזרה אליה אחרי אישור ביצוע (CloseAppointment).
  const [view, setView] = useState(() => {
    const v = params.get("view");
    return v === "pending" || v === "list" ? v : "month";
  });
  const initialSelected = useMemo(
    () => parseDateParam(params.get("date")) || new Date(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [selected, setSelected] = useState(initialSelected);
  const [cursor, setCursor] = useState(
    () =>
      parseMonthParam(params.get("month")) ||
      new Date(initialSelected.getFullYear(), initialSelected.getMonth(), 1)
  );

  // סנכרון המצב ל-URL (replace). אם התוצאה זהה ל-URL הנוכחי — לא עושים כלום.
  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== "month") next.set("view", view);
    next.set("date", dateInputValue(selected));
    next.set("month", `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selected, cursor]);

  const [filters, setFilters] = useState({ showPast: true, showEvents: true, treatment: "" });
  const [sortBy, setSortBy] = useState("date");
  // אירועים שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenEventIds, setHiddenEventIds] = useState(() => new Set());

  // Phase 4 §9 — appointments מוגבלים לשנה המוצגת כרגע ביומן (cursor), במקום
  // טעינת כל ההיסטוריה מאז ומתמיד. מתעדכן אוטומטית כשעוברים לשנה אחרת.
  //
  // income *אינו* מוגבל לשנה — נשאב במלואו (ראו תיקון QA 2026-09): שדה "תאריך
  // תשלום" בסגירת תור הוא ברירת מחדל היום, לא תאריך התור, ולכן הכנסה של תור
  // מסוף שנה עלולה להירשם בשנה אחרת, והסטטוס "שולם" היה מוצג שגוי.
  const year = cursor.getFullYear();
  const { items: appts, loading: la } = useYearRangeCollectionData("appointments", "start", year);
  const { items: events, loading: le } = useCollectionData("events");
  const { items: income } = useCollectionData("income");
  // כל התורים (מנוי משותף — BottomNav כבר מנוי עליהם, ללא עלות רשת נוספת): נדרש
  // לתצוגת "ממתינים", כי תור ממתין עשוי להיות משנה קודמת. אותה פונקציה
  // (pendingClosureAppts) שמזינה את הבאדג' בבר התחתון ואת מרכז "דורש טיפול".
  const { items: allAppts, loading: lp } = useCollectionData("appointments");
  const apptRepo = useRepo("appointments");
  const eventRepo = useRepo("events");

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
    const e = events
      .filter((x) => !hiddenEventIds.has(x.id))
      .map((x) => ({
        id: x.id,
        type: "event",
        start: x.start,
        title: x.title || "אירוע",
        subtitle: "אירוע",
        raw: x,
      }));
    return [...a, ...e];
  }, [appts, events, hiddenEventIds]);

  // תורים ממתינים לסגירה מכל השנים — הישן ביותר ראשון.
  const pendingItems = useMemo(
    () =>
      pendingClosureAppts(allAppts)
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .map((x) => ({
          id: x.id,
          type: "appt",
          start: x.start,
          title: x.treatmentName || "טיפול",
          subtitle: x.clientName || "",
          raw: x,
        })),
    [allAppts]
  );

  const treatments = useMemo(
    () => [...new Set(appts.map((a) => a.treatmentName).filter(Boolean))],
    [appts]
  );

  function itemsForDay(day) {
    return items
      .filter((it) => sameDay(it.start, day))
      .sort((x, y) => new Date(x.start) - new Date(y.start));
  }

  // Phase 4 §5 — מעקב ביטולים: אותו מנגנון reasonOptions בדיוק כמו
  // CloseAppointment.jsx's cancelAppt(), כדי ששתי נקודות הביטול (יומן /
  // אישור ביצוע) יתעדו סיבה באופן זהה ויכתבו לאותו שדה cancelReason.
  async function cancelAppt(it) {
    const reason = await confirmDialog({
      title: "ביטול תור",
      message: "לבטל את התור?",
      confirmLabel: "ביטול תור",
      danger: true,
      reasonOptions: CANCEL_REASONS,
    });
    if (!reason) return;
    try {
      await apptRepo.update(it.id, { status: "cancelled", cancelReason: reason });
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "ביטול התור נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    // כשל בלוג אחרי שהביטול הצליח לא אמור להציג "הביטול נכשל".
    try {
      await log({
        action: "appointment_cancel",
        entity: {
          type: "appointment",
          id: it.id,
          desc: `${it.title}${it.subtitle ? ` · ${it.subtitle}` : ""} · ${
            CANCEL_REASON_LABELS[reason] || reason
          }`,
        },
        after: { cancelReason: reason },
      });
    } catch (e) {
      console.error("[audit] appointment_cancel failed", e);
    }
    toast.showMessage("התור בוטל");
  }
  async function deleteEvent(it) {
    const ok = await confirmDialog({
      title: "מחיקת אירוע",
      message: "למחוק את האירוע?",
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenEventIds((prev) => new Set(prev).add(it.id));
    toast.showUndo({
      message: "האירוע נמחק",
      onUndo: () =>
        setHiddenEventIds((prev) => {
          const next = new Set(prev);
          next.delete(it.id);
          return next;
        }),
      onExpire: () => eventRepo.remove(it.id),
    });
  }

  // מעבר למסך אישור ביצוע. from קובע לאן חוזרים אחרי האישור/הביטול: "calendar"
  // → לוח השנה; "pending" → תצוגת הממתינים (כדי לסגור כמה תורים ברצף).
  // returnTo: ה-URL המלא של היומן כרגע (תצוגה + חודש + יום), כך שאחרי האישור
  // חוזרים בדיוק לאותו מצב ולא ל"היום" (CloseAppointment קורא אותו).
  const closeFrom = (from) => (it) =>
    navigate(`/appointments/${it.id}/close`, {
      state: { from, returnTo: location.pathname + location.search },
    });

  const loading = view === "pending" ? lp : la || le;

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
        <button className={"seg__btn" + (view === "pending" ? " on" : "")} onClick={() => setView("pending")}>
          ממתינים{pendingItems.length > 0 ? ` (${pendingItems.length})` : ""}
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
          onClose={closeFrom("calendar")}
          onEditEvent={(it) => navigate(`/calendar/event/${it.id}/edit`)}
          onDeleteEvent={deleteEvent}
        />
      ) : view === "list" ? (
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
          onClose={closeFrom("calendar")}
          onEditEvent={(it) => navigate(`/calendar/event/${it.id}/edit`)}
          onDeleteEvent={deleteEvent}
        />
      ) : (
        <PendingView
          items={pendingItems}
          incomeById={incomeById}
          onEditAppt={(it) => navigate(`/appointments/${it.id}/edit`)}
          onCancelAppt={cancelAppt}
          onResend={(it) => navigate(`/appointments/${it.id}/send`)}
          onClose={closeFrom("pending")}
          onEditEvent={(it) => navigate(`/calendar/event/${it.id}/edit`)}
          onDeleteEvent={deleteEvent}
        />
      )}
    </>
  );
}

// תצוגת "ממתינים לסגירה": כל התורים שמועדם עבר וטרם אושר ביצוע או בוטלו, מכל
// השנים, הישן ביותר ראשון, מקובצים לפי תאריך. אותה שורה (ItemRow) כמו בשאר
// התצוגות, כולל "אישור ביצוע".
function PendingView({ items, incomeById, ...actions }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = formatDate(it.start);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()];
  }, [items]);

  if (items.length === 0) {
    return <div className="empty-state">אין תורים ממתינים לסגירה.</div>;
  }

  return (
    <>
      <div className="notice" style={{ marginTop: 0 }}>
        תורים שמועדם עבר וטרם אושר ביצוע או בוטלו, מכל השנים — הישן ביותר ראשון.
      </div>
      {groups.map(([date, list]) => (
        <div key={date}>
          <h3 className="group-title">{date}</h3>
          <div className="list">
            {list.map((it) => (
              <ItemRow key={it.type + it.id} it={it} incomeById={incomeById} {...actions} />
            ))}
          </div>
        </div>
      ))}
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
  // תור שכוסה במלואו מיתרת זיכוי (chargedFromCredit) נחשב מוסדר גם הוא —
  // לא נוצרה לו הכנסה, כי השובר/הזיכוי כבר נרשמו קודם (addendum שוברים, D-1).
  const linkedIncome = isAppt && it.raw.incomeId ? incomeById[it.raw.incomeId] : null;
  const isPaid =
    isDone &&
    (!!it.raw.chargedFromPackage || !!it.raw.chargedFromCredit || linkedIncome?.paid === true);

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
