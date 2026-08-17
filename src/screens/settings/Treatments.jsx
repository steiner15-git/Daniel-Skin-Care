import { useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";

function newId() {
  return `t-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export default function Treatments() {
  const { data, loading, save } = useSettingDoc("treatments");
  const items = data?.items ?? [];

  const [draft, setDraft] = useState({ name: "", durationMin: "", price: "" });
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

  function persist(next) {
    save({ items: next });
  }

  function addTreatment() {
    if (!draft.name.trim()) return;
    persist([
      ...items,
      {
        id: newId(),
        name: draft.name.trim(),
        durationMin: Number(draft.durationMin) || 0,
        price: Number(draft.price) || 0,
      },
    ]);
    setDraft({ name: "", durationMin: "", price: "" });
  }

  function startEdit(t) {
    setEditId(t.id);
    setEditDraft({ ...t });
  }
  function saveEdit() {
    persist(
      items.map((t) =>
        t.id === editId
          ? {
              ...t,
              name: editDraft.name.trim(),
              durationMin: Number(editDraft.durationMin) || 0,
              price: Number(editDraft.price) || 0,
            }
          : t
      )
    );
    setEditId(null);
    setEditDraft(null);
  }
  function remove(id) {
    if (!confirm("למחוק את הטיפול?")) return;
    persist(items.filter((t) => t.id !== id));
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="רשימת טיפולים" />

      {items.length === 0 && (
        <div className="empty-state" style={{ padding: "20px 8px" }}>
          עדיין אין טיפולים. הוסיפי טיפול ראשון למטה.
        </div>
      )}

      <div className="list">
        {items.map((t) =>
          editId === t.id ? (
            <div key={t.id} className="card list-item--edit">
              <div className="field">
                <label>שם הטיפול</label>
                <input
                  value={editDraft.name}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                />
              </div>
              <div className="row-2">
                <div className="field">
                  <label>משך (דק')</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editDraft.durationMin}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, durationMin: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>מחיר (₪)</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={editDraft.price}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, price: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="save-row">
                <button className="btn btn--muted" onClick={() => setEditId(null)}>
                  ביטול
    
            </button>
                <button className="btn" onClick={saveEdit}>
                  שמירה
                </button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="card list-item">
              <div className="list-item__main">
                <strong>{t.name}</strong>
                <span className="muted">
                  {t.durationMin} דק' · ₪{t.price}
                </span>
              </div>
              <div className="list-item__actions">
                <button className="btn btn--ghost" onClick={() => startEdit(t)}>
                  עריכה
                </button>
                <button className="btn btn--muted" onClick={() => remove(t.id)}>
                  מחיקה
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>הוספת טיפול</h3>
        <div className="field">
          <label>שם הטיפול</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="row-2">
          <div className="field">
            <label>משך (דק')</label>
            <input
              type="number"
              inputMode="numeric"
              value={draft.durationMin}
              onChange={(e) => setDraft({ ...draft, durationMin: e.target.value })}
            />
          </div>
          <div className="field">
            <label>מחיר (₪)</label>
            <input
              type="number"
              inputMode="numeric"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
          </div>
        </div>
        <button className="btn btn--block" onClick={addTreatment}>
          הוספה
        </button>
      </div>
    </>
  );
}
