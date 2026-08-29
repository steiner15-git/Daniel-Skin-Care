import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import PaymentBadge from "../components/PaymentBadge";
import { SkeletonRows } from "../components/Skeleton";
import { useCollectionData, useRepo } from "../data";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { useToast } from "../context/ToastProvider";
import { formatILS } from "../utils/money";
import { formatDate } from "../utils/datetime";

const EMPTY = { name: "", price: "", stock: "", lowStockThreshold: "" };

export default function Products() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("products");

  return (
    <>
      <ScreenHeader
        title="מוצרים"
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/")}>
            למסך הבית
          </button>
        }
      />

      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={"seg__btn" + (tab === "products" ? " on" : "")} onClick={() => setTab("products")}>
          מוצרים
        </button>
        <button className={"seg__btn" + (tab === "sales" ? " on" : "")} onClick={() => setTab("sales")}>
          מכירות
        </button>
      </div>

      {tab === "products" ? <InventoryTab /> : <SalesTab />}
    </>
  );
}

/* ---------- מוצרים (מלאי) — ללא שינוי לוגי, רק הועבר לתת-רכיב ---------- */
function InventoryTab() {
  const navigate = useNavigate();
  const { items: allItems, loading } = useCollectionData("products");
  const repo = useRepo("products");
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  // מוצרים שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const items = allItems.filter((p) => !hiddenIds.has(p.id));

  function payload(d) {
    return {
      name: d.name.trim(),
      price: Number(d.price) || 0,
      stock: Number(d.stock) || 0,
      lowStockThreshold: Number(d.lowStockThreshold) || 0,
    };
  }
  const valid = (d) => d.name.trim();

  async function add() {
    if (!valid(draft)) return;
    await repo.add(payload(draft));
    setDraft(EMPTY);
    setAdding(false);
  }
  function startEdit(p) {
    setEditId(p.id);
    setEditDraft({
      name: p.name || "",
      price: p.price ?? "",
      stock: p.stock ?? "",
      lowStockThreshold: p.lowStockThreshold ?? "",
    });
  }
  async function saveEdit() {
    if (!valid(editDraft)) return;
    await repo.update(editId, payload(editDraft));
    setEditId(null);
    setEditDraft(null);
  }
  async function remove(p) {
    const ok = await confirmDialog({
      title: "מחיקת מוצר",
      message: `למחוק את "${p.name}"?`,
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(p.id));
    toast.showUndo({
      message: `"${p.name}" נמחק`,
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        }),
      onExpire: () => repo.remove(p.id),
    });
  }

  if (loading) return <SkeletonRows count={4} />;

  return (
    <>
      {items.length === 0 ? (
        <div className="empty-state" style={{ padding: "20px 8px" }}>
          עדיין אין מוצרים. הוסיפי מוצר ראשון למטה.
        </div>
      ) : (
        <div className="list">
          {items.map((p) =>
            editId === p.id ? (
              <ProductFields
                key={p.id}
                d={editDraft}
                setD={setEditDraft}
                onCancel={() => setEditId(null)}
                onSave={saveEdit}
                editing
              />
            ) : (
              <div key={p.id} className="card list-item">
                <div className="list-item__main">
                  <strong>
                    {p.name}{" "}
                    {p.stock <= 0 ? (
                      <span className="badge badge--warn">אזל מהמלאי</span>
                    ) : p.stock <= (p.lowStockThreshold || 0) ? (
                      <span className="badge badge--warn">מלאי נמוך</span>
                    ) : null}
                  </strong>
                  <span className="muted">
                    {formatILS(p.price)} · במלאי: {p.stock ?? 0}
                  </span>
                </div>
                <div className="list-item__actions">
                  <button
                    className="btn"
                    disabled={p.stock <= 0}
                    onClick={() =>
                      navigate(`/products/${p.id}/sell`, { state: { from: "products" } })
                    }
                  >
                    מכירה
                  </button>
                  <button className="btn btn--ghost" onClick={() => startEdit(p)}>
                    עריכה
                  </button>
                  <button className="btn btn--muted" onClick={() => remove(p)}>
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
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>הוספת מוצר</h3>
          <ProductFields
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
        <button className="btn btn--block" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
          + הוספת מוצר
        </button>
      )}
    </>
  );
}

function ProductFields({ d, setD, onSave, onCancel, editing }) {
  return (
    <div className={editing ? "card list-item--edit" : ""}>
      <div className="field">
        <label>שם המוצר</label>
        <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div className="row-2">
        <div className="field">
          <label>מחיר (₪)</label>
          <input
            type="number"
            inputMode="numeric"
            value={d.price}
            onChange={(e) => setD({ ...d, price: e.target.value })}
          />
        </div>
        <div className="field">
          <label>כמות במלאי</label>
          <input
            type="number"
            inputMode="numeric"
            value={d.stock}
            onChange={(e) => setD({ ...d, stock: e.target.value })}
          />
        </div>
      </div>
      <div className="field" style={{ marginBottom: onCancel ? 12 : 0 }}>
        <label>סף התראת מלאי נמוך (אופציונלי)</label>
        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={d.lowStockThreshold}
          onChange={(e) => setD({ ...d, lowStockThreshold: e.target.value })}
        />
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

/* ---------- מכירות (addendum #14) — income מסונן לפי source:"product" ---------- */
function SalesTab() {
  const { items: income, loading } = useCollectionData("income");
  const { items: products } = useCollectionData("products");

  const sales = useMemo(() => income.filter((r) => r.source === "product"), [income]);

  const [q, setQ] = useState("");
  const [paymentFilter, setPaymentFilter] = useState(""); // "" | paid | unpaid
  const [productFilter, setProductFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState("date"); // date | amount

  // רשימת מוצרים שהופיעו בפועל במכירות (dropdown הסינון) — לפי productId.
  const soldProducts = useMemo(() => {
    const ids = [...new Set(sales.map((r) => r.productId).filter(Boolean))];
    return ids.map((pid) => products.find((p) => p.id === pid)).filter(Boolean);
  }, [sales, products]);

  const list = useMemo(() => {
    const term = q.trim();
    let l = sales.slice();
    if (term)
      l = l.filter((r) =>
        [r.clientName, r.treatmentName].filter(Boolean).some((v) => String(v).includes(term))
      );
    if (paymentFilter === "paid") l = l.filter((r) => r.paid);
    else if (paymentFilter === "unpaid") l = l.filter((r) => !r.paid);
    if (productFilter) l = l.filter((r) => r.productId === productFilter);
    if (from) l = l.filter((r) => (r.date || "") >= from);
    if (to) l = l.filter((r) => (r.date || "") <= to);
    l.sort((a, b) => {
      if (sortBy === "amount") return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      return new Date(b.date) - new Date(a.date);
    });
    return l;
  }, [sales, q, paymentFilter, productFilter, from, to, sortBy]);

  if (loading) return <SkeletonRows count={4} itemClassName="fin-item" />;

  return (
    <>
      <div className="toolbar">
        <input placeholder="חיפוש (לקוחה / מוצר)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar__row">
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>מתאריך</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>עד תאריך</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="toolbar__row">
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="">כל המוצרים</option>
            {soldProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
            <option value="">תשלום: הכל</option>
            <option value="paid">שולם</option>
            <option value="unpaid">לא שולם</option>
          </select>
        </div>
        <div className="toolbar__row">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">סדר לפי תאריך</option>
            <option value="amount">סדר לפי סכום</option>
          </select>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">אין מכירות התואמות לסינון.</div>
      ) : (
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="card fin-item">
              <div className="fin-item__main">
                <div className="fin-item__top">
                  <strong>{formatILS(r.amount)}</strong>
                  <PaymentBadge income={r} />
                </div>
                <span className="muted">
                  {formatDate(r.date)} · {r.treatmentName || "מוצר"}
                </span>
                {r.clientName &&
                  (r.clientId ? (
                    <Link to={`/clients/${r.clientId}`} style={{ fontSize: 12 }}>
                      {r.clientName} ‹
                    </Link>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.clientName}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
