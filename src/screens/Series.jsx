import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import DateField from "../components/DateField";
import PaymentBadge from "../components/PaymentBadge";
import { SkeletonRows } from "../components/Skeleton";
import { useCollectionData, useRepo, useSettingDoc } from "../data";
import { useReminderSettings } from "../data/useReminderSettings";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { useToast } from "../context/ToastProvider";
import { formatILS } from "../utils/money";

const EMPTY = { treatments: [], name: "", sessions: "", price: "", expiryDate: "" };

export default function Series() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // תמיכה בקפיצה ישירה לטאב "רכישות" עם פילטר "עומדת לפוג" מופעל מראש —
  // מהתזכורת "חבילות עומדות לפוג" בדשבורד (addendum #12).
  const initialTab = searchParams.get("tab") === "purchases" ? "purchases" : "definitions";
  const initialExpiringOnly = searchParams.get("filter") === "expiring";
  const [tab, setTab] = useState(initialTab);

  return (
    <>
      <ScreenHeader
        title="סדרות טיפול"
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/")}>
            למסך הבית
          </button>
        }
      />

      <div className="seg" style={{ marginBottom: 16 }}>
        <button
          className={"seg__btn" + (tab === "definitions" ? " on" : "")}
          onClick={() => setTab("definitions")}
        >
          הגדרת סדרות
        </button>
        <button
          className={"seg__btn" + (tab === "purchases" ? " on" : "")}
          onClick={() => setTab("purchases")}
        >
          רכישות
        </button>
      </div>

      {tab === "definitions" ? (
        <DefinitionsTab />
      ) : (
        <PurchasesTab initialExpiringOnly={initialExpiringOnly} />
      )}
    </>
  );
}

/* ---------- הגדרת סדרות — ללא שינוי לוגי, רק הועבר לתת-רכיב ---------- */
function DefinitionsTab() {
  const navigate = useNavigate();
  const { items: allItems, loading } = useCollectionData("series");
  const repo = useRepo("series");
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const treatments = treatmentsDoc?.items ?? [];
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  // סדרות שנמחקו אופטימית ל-Undo (מוסתרות מה-UI, נמחקות בפועל רק לאחר 5
  // שניות אם לא נלחץ "ביטול" — ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const items = allItems.filter((s) => !hiddenIds.has(s.id));

  if (loading) return <SkeletonRows count={4} />;

  function payload(d) {
    return {
      name: d.name.trim(),
      treatments: d.treatments,
      treatmentIds: d.treatments.map((t) => t.id),
      treatmentName: d.treatments.map((t) => t.name).join(", "),
      sessions: Number(d.sessions) || 0,
      price: Number(d.price) || 0,
      expiryDate: d.expiryDate || null,
    };
  }

  const valid = (d) => d.treatments.length > 0 && d.name.trim() && Number(d.sessions) > 0;

  async function add() {
    if (!valid(draft)) return;
    try {
      await repo.add(payload(draft));
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת הסדרה נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    setDraft(EMPTY);
    setAdding(false);
    }
  function startEdit(s) {
    setEditId(s.id);
    setEditDraft({
      treatments: s.treatments || (s.treatmentId ? [{ id: s.treatmentId, name: s.treatmentName }] : []),
      name: s.name || "",
      sessions: s.sessions ?? "",
      price: s.price ?? "",
      expiryDate: s.expiryDate || "",
    });
  }
  async function saveEdit() {
    if (!valid(editDraft)) return;
    try {
      await repo.update(editId, payload(editDraft));
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "עדכון הסדרה נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    setEditId(null);
    setEditDraft(null);
  }
  async function remove(s) {
    const ok = await confirmDialog({
      title: "מחיקת סדרה",
      message: `למחוק את הסדרה "${s.name}"? חבילות שכבר נרכשו לא ייפגעו.`,
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(s.id));
    toast.showUndo({
      message: `הסדרה "${s.name}" נמחקה`,
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(s.id);
          return next;
        }),
      onExpire: () => repo.remove(s.id),
    });
  }

  return (
    <>
      {treatments.length === 0 && (
        <div className="notice" style={{ marginTop: 0 }}>
          כדי להגדיר סדרה צריך קודם טיפולים ברשימת הטיפולים שבהגדרות.
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state" style={{ padding: "20px 8px" }}>
          עדיין אין סדרות. הוסיפי סדרה ראשונה למטה.
        </div>
      ) : (
        <div className="list">
          {items.map((s) =>
            editId === s.id ? (
              <SeriesFields
                key={s.id}
                d={editDraft}
                setD={setEditDraft}
                treatments={treatments}
                onCancel={() => setEditId(null)}
                onSave={saveEdit}
                editing
              />
            ) : (
              <div key={s.id} className="card list-item">
                <div className="list-item__main">
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {s.treatmentName} · {s.sessions} מפגשים · {formatILS(s.price)}
                    {s.expiryDate ? ` · בתוקף עד ${s.expiryDate}` : ""}
                  </span>
                </div>
                <div className="list-item__actions">
                  <button
                    className="btn"
                    onClick={() =>
                      navigate(`/series/${s.id}/purchase`, { state: { from: "series" } })
                    }
                  >
                    רכישה
                  </button>
                  <button className="btn btn--ghost" onClick={() => startEdit(s)}>
                    עריכה
                  </button>
                  <button className="btn btn--muted" onClick={() => remove(s)}>
                    מחיקה
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {adding ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>הוספת סדרה</h3>
          <SeriesFields
            d={draft}
            setD={setDraft}
            treatments={treatments}
            onSave={add}
            onCancel={() => {
              setAdding(false);
              setDraft(EMPTY);
            }}
          />
        </div>
      ) : (
        <button
          className="btn btn--block"
          style={{ marginTop: 16 }}
          disabled={treatments.length === 0}
          onClick={() => setAdding(true)}
        >
          + הוספת סדרה
        </button>
      )}
    </>
  );
}

function SeriesFields({ d, setD, treatments, onSave, onCancel, editing }) {
  const [pending, setPending] = useState("");
  const available = treatments.filter((t) => !d.treatments.some((x) => x.id === t.id));
  const thisYear = new Date().getFullYear();

  function addTreatment() {
    const t = treatments.find((x) => x.id === pending);
    if (!t) return;
    setD({
      ...d,
      treatments: [...d.treatments, { id: t.id, name: t.name }],
      name: d.name?.trim() ? d.name : `סדרת ${t.name}`,
    });
    setPending("");
  }
  function removeTreatment(id) {
    setD({ ...d, treatments: d.treatments.filter((t) => t.id !== id) });
  }

  return (
    <div className={editing ? "card list-item--edit" : ""}>
      <div className="field">
        <label>טיפולים בסדרה</label>
        {d.treatments.length > 0 && (
          <div className="chips">
            {d.treatments.map((t) => (
              <span key={t.id} className="chip">
                {t.name}
                <button
                  type="button"
                  className="chip__x"
                  aria-label="הסרה"
                  onClick={() => removeTreatment(t.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="toolbar__row" style={{ marginTop: d.treatments.length > 0 ? 8 : 0 }}>
          <select value={pending} onChange={(e) => setPending(e.target.value)} style={{ flex: 1 }}>
            <option value="">— בחרי טיפול —</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="btn btn--ghost" disabled={!pending} onClick={addTreatment}>
            הוסף טיפול
          </button>
        </div>
      </div>
      <div className="field">
        <label>שם הסדרה</label>
        <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div className="row-2">
        <div className="field">
          <label>מספר מפגשים</label>
          <input
            type="number"
            inputMode="numeric"
            value={d.sessions}
            onChange={(e) => setD({ ...d, sessions: e.target.value })}
          />
        </div>
        <div className="field">
          <label>מחיר חבילה (₪)</label>
          <input
            type="number"
            inputMode="numeric"
            value={d.price}
            onChange={(e) => setD({ ...d, price: e.target.value })}
          />
        </div>
      </div>
      <div className="field" style={{ marginBottom: onCancel ? 12 : 0 }}>
        <label>בתוקף עד (אופציונלי)</label>
        {/*
          שדה מותאם (DateField) במקום <input type="date"> טבעי — עקבי עם שאר
          האפליקציה ונמנע מבאגים של הפיקר הטבעי בדפדפן (כולל כפתור "Clear"
          שלעיתים לא מרוקן את השדה בפועל). כפתור "נקה תאריך" מפורש מבטיח ניקוי
          אמין תמיד, בלי תלות בהתנהגות פיקר כלשהו.
        */}
        <DateField
          value={d.expiryDate}
          onChange={(v) => setD({ ...d, expiryDate: v })}
          fromYear={thisYear}
          toYear={thisYear + 10}
        />
        {d.expiryDate && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 8 }}
            onClick={() => setD({ ...d, expiryDate: "" })}
          >
            נקה תאריך
          </button>
        )}
      </div>
      {onCancel ? (
        <div className="save-row">
          <button className="btn btn--muted" onClick={onCancel}>
            ביטול
          </button>
          <button className="btn" onClick={onSave}>
            שמירה
          </button>
        </div>
      ) : (
        <button className="btn btn--block" style={{ marginTop: 12 }} onClick={onSave}>
          הוספה
        </button>
      )}
    </div>
  );
}

/* ---------- רכישות (addendum #13) — clientPackages עם סינון/מיון ---------- */

// אותה לוגיקת סטטוס בדיוק כמו packageState ב-ClientCard.jsx (חבילה פעילה/
// נוצלה/פקעה) — משוכפלת כאן במכוון (קובץ נפרד, פונקציה קטנה) במקום תלות
// צולבת בין שני מסכי מסך-עצמאיים.
function purchaseStatus(p) {
  if (p.status !== "active" || (p.remainingSessions ?? 0) <= 0) return "used";
  if (p.expiryDate && new Date(p.expiryDate) < new Date(new Date().toDateString())) return "expired";
  return "active";
}
const STATUS_LABEL = { active: "פעילה", used: "נוצלה", expired: "פקעה" };

function isExpiringSoon(p, thresholdDays) {
  if (!p.expiryDate) return false;
  const days = Math.ceil((new Date(p.expiryDate) - new Date(new Date().toDateString())) / 86400000);
  return days >= 0 && days <= thresholdDays;
}

function PurchasesTab({ initialExpiringOnly = false }) {
  const navigate = useNavigate();
  const { items: packages, loading } = useCollectionData("clientPackages");
  const { items: income } = useCollectionData("income");
  const { data: reminders } = useReminderSettings();

  const incomeById = useMemo(() => {
    const map = {};
    for (const r of income) map[r.id] = r;
    return map;
  }, [income]);

  const [q, setQ] = useState("");
  // ברירת מחדל: פעילה + פקעה (לא כולל "נוצלה") — לפי דרישת ה-addendum.
  const [statusFilter, setStatusFilter] = useState("activeExpired");
  const [paymentFilter, setPaymentFilter] = useState(""); // "" | paid | unpaid
  const [expiringOnly, setExpiringOnly] = useState(initialExpiringOnly);
  const [sortBy, setSortBy] = useState("expiry"); // expiry | client

  const list = useMemo(() => {
    const term = q.trim();
    let l = packages.slice();
    if (term)
      l = l.filter((p) =>
        [p.clientName, p.seriesName].filter(Boolean).some((v) => String(v).includes(term))
      );
    if (statusFilter === "activeExpired") l = l.filter((p) => purchaseStatus(p) !== "used");
    else if (statusFilter) l = l.filter((p) => purchaseStatus(p) === statusFilter);
    if (paymentFilter) {
      l = l.filter((p) => {
        const inc = p.incomeId ? incomeById[p.incomeId] : null;
        return paymentFilter === "paid" ? inc?.paid === true : !(inc?.paid === true);
      });
    }
    if (expiringOnly) l = l.filter((p) => isExpiringSoon(p, reminders.packageExpiryDays ?? 14));
    l.sort((a, b) => {
      if (sortBy === "client") return (a.clientName || "").localeCompare(b.clientName || "", "he");
      // ברירת מחדל: תאריך פקיעה קרוב קודם; ללא תאריך פקיעה מוצג בסוף.
      const ea = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const eb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return ea - eb;
    });
    return l;
  }, [packages, q, statusFilter, paymentFilter, expiringOnly, sortBy, incomeById, reminders.packageExpiryDays]);

  if (loading) return <SkeletonRows count={4} />;

  return (
    <>
      <div className="toolbar">
        <input placeholder="חיפוש (לקוחה / סדרה)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar__row">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="activeExpired">פעילה + פקעה</option>
            <option value="">כל הסטטוסים</option>
            <option value="active">פעילה</option>
            <option value="expired">פקעה</option>
            <option value="used">נוצלה</option>
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="">תשלום: הכל</option>
            <option value="paid">שולם</option>
            <option value="unpaid">לא שולם</option>
          </select>
        </div>
        <div className="toolbar__row">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="expiry">סדר לפי תאריך פקיעה</option>
            <option value="client">סדר לפי לקוחה</option>
          </select>
          <label className="inline-check" style={{ flex: "1 1 180px" }}>
            <input
              type="checkbox"
              checked={expiringOnly}
              onChange={(e) => setExpiringOnly(e.target.checked)}
            />
            <span>עומדת לפוג (עד {reminders.packageExpiryDays ?? 14} ימים)</span>
          </label>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">אין רכישות התואמות לסינון.</div>
      ) : (
        <div className="list">
          {list.map((p) => {
            const inc = p.incomeId ? incomeById[p.incomeId] : null;
            return (
              <button
                key={p.id}
                className="card list-item as-button"
                onClick={() =>
                  navigate(`/clients/${p.clientId}`, { state: { tab: "appointments" } })
                }
              >
                <div className="list-item__main">
                  <strong>
                    {p.clientName || "—"}{" "}
                    <span className="badge badge--info">{STATUS_LABEL[purchaseStatus(p)]}</span>{" "}
                    <PaymentBadge income={inc} />
                  </strong>
                  <span className="muted">
                    {p.seriesName} · נותרו {p.remainingSessions}/{p.totalSessions}
                    {p.expiryDate ? ` · בתוקף עד ${p.expiryDate}` : ""}
                  </span>
                </div>
                <span className="nav-card__chev">‹</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
