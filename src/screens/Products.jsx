import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import { useCollectionData, useRepo } from "../data";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { useToast } from "../context/ToastProvider";
import { formatILS } from "../utils/money";

const EMPTY = { name: "", price: "", stock: "", lowStockThreshold: "" };

export default function Products() {
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

  if (loading) return <p className="muted">טוען…</p>;

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
