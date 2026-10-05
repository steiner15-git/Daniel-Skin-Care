import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import DateField from "../components/DateField";
import { SkeletonRows } from "../components/Skeleton";
import { useCollectionData, useRepo } from "../data";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { useToast } from "../context/ToastProvider";
import { formatILS } from "../utils/money";
import { creditState, CREDIT_STATE_LABEL, toMillis } from "../utils/credits";

const EMPTY = { name: "", amount: "", expiryDate: "" };

// מסך "שוברים" (addendum שוברים/זיכוי, V-1..V-7), בדפוס של Series.jsx:
// שני טאבים — הגדרת שוברים (עם כפתור רכישה) ורכישות. נגיש מכפתור בפעולות
// מהירות במסך הבית (שלב 5), לא מהבר התחתון.
export default function Vouchers() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("definitions");

  return (
    <>
      <ScreenHeader
        title="שוברי מתנה"
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
          הגדרת שוברים
        </button>
        <button
          className={"seg__btn" + (tab === "purchases" ? " on" : "")}
          onClick={() => setTab("purchases")}
        >
          רכישות
        </button>
      </div>

      {tab === "definitions" ? <DefinitionsTab /> : <PurchasesTab />}
    </>
  );
}

/* ---------- הגדרת שוברים ---------- */
function DefinitionsTab() {
  const navigate = useNavigate();
  const { items: allItems, loading } = useCollectionData("vouchers");
  const repo = useRepo("vouchers");
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  // הגדרות שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const items = allItems.filter((v) => !hiddenIds.has(v.id));

  if (loading) return <SkeletonRows count={3} />;

  function payload(d) {
    return {
      name: d.name.trim(),
      // סכום שלילי (הקלדה בטעות) נעצר ב-0.
      amount: Math.max(0, Number(d.amount) || 0),
      expiryDate: d.expiryDate || null,
    };
  }
  const valid = (d) => d.name.trim() && Number(d.amount) > 0;

  async function add() {
    if (!valid(draft)) return;
    try {
      await repo.add(payload(draft));
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת השובר נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    setDraft(EMPTY);
    setAdding(false);
  }
  function startEdit(v) {
    setEditId(v.id);
    setEditDraft({
      name: v.name || "",
      amount: v.amount ?? "",
      expiryDate: v.expiryDate || "",
    });
  }
  async function saveEdit() {
    if (!valid(editDraft)) return;
    try {
      await repo.update(editId, payload(editDraft));
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "עדכון השובר נכשל: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    setEditId(null);
    setEditDraft(null);
  }
  // מחיקת הגדרה אינה משפיעה על שוברים שכבר נרכשו (V-4).
  async function remove(v) {
    const ok = await confirmDialog({
      title: "מחיקת הגדרת שובר",
      message: `למחוק את "${v.name}"? שוברים שכבר נרכשו לא ייפגעו.`,
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(v.id));
    toast.showUndo({
      message: `"${v.name}" נמחק`,
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(v.id);
          return next;
        }),
      onExpire: () => repo.remove(v.id),
    });
  }

  return (
    <>
      {items.length === 0 ? (
        <div className="empty-state" style={{ padding: "20px 8px" }}>
          עדיין אין הגדרות שוברים. הוסיפי הגדרה, או רכשי שובר בסכום חופשי.
        </div>
      ) : (
        <div className="list">
          {items.map((v) =>
            editId === v.id ? (
              <VoucherFields
                key={v.id}
                d={editDraft}
                setD={setEditDraft}
                onCancel={() => setEditId(null)}
                onSave={saveEdit}
                editing
              />
            ) : (
              <div key={v.id} className="card list-item">
                <div className="list-item__main">
                  <strong>{v.name}</strong>
                  <span className="muted">
                    {formatILS(v.amount)}
                    {v.expiryDate ? ` · בתוקף עד ${v.expiryDate}` : " · ללא תוקף"}
                  </span>
                </div>
                <div className="list-item__actions">
                  <button
                    className="btn"
                    onClick={() =>
                      navigate(`/vouchers/${v.id}/purchase`, { state: { from: "vouchers" } })
                    }
                  >
                    רכישה
                  </button>
                  <button className="btn btn--ghost" onClick={() => startEdit(v)}>
                    עריכה
                  </button>
                  <button className="btn btn--muted" onClick={() => remove(v)}>
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
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>הוספת הגדרת שובר</h3>
          <VoucherFields
            d={draft}
            setD={setDraft}
            onSave={add}
            onCancel={() => {
              setAdding(false);
              setDraft(EMPTY);
            }}
          />
        </div>
      ) : (
        <>
          <button className="btn btn--block" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
            + הוספת הגדרת שובר
          </button>
          <button
            className="btn btn--ghost btn--block"
            style={{ marginTop: 10 }}
            onClick={() => navigate("/vouchers/purchase", { state: { from: "vouchers" } })}
          >
            שובר בסכום חופשי
          </button>
        </>
      )}
    </>
  );
}

function VoucherFields({ d, setD, onSave, onCancel, editing }) {
  const thisYear = new Date().getFullYear();
  return (
    <div className={editing ? "card list-item--edit" : ""}>
      <div className="field">
        <label>שם השובר</label>
        <input
          placeholder='למשל "שובר ₪300"'
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label>סכום (₪)</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={d.amount}
          onChange={(e) => setD({ ...d, amount: e.target.value })}
        />
      </div>
      <div className="field" style={{ marginBottom: onCancel ? 12 : 0 }}>
        <label>בתוקף עד (אופציונלי — ריק = ללא תוקף)</label>
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
      <div className="save-row">
        <button className="btn btn--muted" onClick={onCancel}>
          ביטול
        </button>
        <button className="btn" onClick={onSave}>
          {editing ? "שמירה" : "הוספה"}
        </button>
      </div>
    </div>
  );
}

/* ---------- רכישות (V-6) — credits עם source:"voucher" ---------- */
function PurchasesTab() {
  const navigate = useNavigate();
  const { items: credits, loading } = useCollectionData("credits");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const list = useMemo(() => {
    const term = q.trim();
    let l = credits.filter((c) => c.source === "voucher");
    if (term)
      l = l.filter((c) =>
        [c.clientName, c.giftFromName, c.voucherName]
          .filter(Boolean)
          .some((v) => String(v).includes(term))
      );
    if (statusFilter) l = l.filter((c) => creditState(c) === statusFilter);
    l.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return l;
  }, [credits, q, statusFilter]);

  if (loading) return <SkeletonRows count={4} />;

  return (
    <>
      <div className="toolbar">
        <input
          placeholder="חיפוש (קונה / מקבלת)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="toolbar__row">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="active">פעיל</option>
            <option value="expired">פקע</option>
            <option value="used">נוצל</option>
          </select>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">אין רכישות שוברים להצגה.</div>
      ) : (
        <div className="list">
          {list.map((c) => {
            const st = creditState(c);
            const sent = [c.voucherSentEmail && "מייל", c.voucherSentWhatsapp && "וואטסאפ"]
              .filter(Boolean)
              .join(" + ");
            const open = () =>
              navigate(`/clients/${c.clientId}`, { state: { tab: "appointments" } });
            return (
              <div
                key={c.id}
                className="card list-item as-button"
                role="button"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => e.key === "Enter" && open()}
              >
                <div className="list-item__main">
                  <strong>
                    {c.clientName || "—"}{" "}
                    <span className={"badge " + (st === "active" ? "badge--ok" : "badge--info")}>
                      {CREDIT_STATE_LABEL[st]}
                    </span>
                  </strong>
                  <span className="muted">
                    מתנה מ-{c.giftFromName || "קונה מזדמנת"} ·{" "}
                    <span className="sensitive">
                      {formatILS(c.remaining)} מתוך {formatILS(c.amount)}
                    </span>
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {c.expiryDate ? `בתוקף עד ${c.expiryDate}` : "ללא תוקף"}
                    {sent ? ` · נשלח: ${sent}` : " · טרם נשלח"}
                  </span>
                </div>
                <div className="list-item__actions">
                  <button
                    className="btn btn--ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/vouchers/${c.id}/send`, { state: { from: "list" } });
                    }}
                  >
                    שליחה
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
