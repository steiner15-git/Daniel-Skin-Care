import { useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";

function newId(p) {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// עורך רשימה של פריטים עם שם יחיד (קטגוריות הוצאה, אמצעי תשלום)
export default function NameListEditor({
  docKey,
  title,
  itemLabel,
  addLabel,
  defaults = [],
}) {
  const { data, loading, save } = useSettingDoc(docKey);
  const items = data?.items ?? null;
  const list = items ?? defaults.map((name) => ({ id: newId(docKey), name }));

  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");

  function persist(next) {
    save({ items: next });
  }
  function add() {
    if (!draft.trim()) return;
    persist([...list, { id: newId(docKey), name: draft.trim() }]);
    setDraft("");
  }
  function saveEdit() {
    persist(list.map((x) => (x.id === editId ? { ...x, name: editText.trim() } : x)));
    setEditId(null);
  }
  function remove(id) {
    if (!confirm("למחוק את הפריט?")) return;
    persist(list.filter((x) => x.id !== id));
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title={title} />

      <div className="list">
        {list.map((x) =>
          editId === x.id ? (
            <div key={x.id} className="card list-item--edit">
              <div className="field" style={{ marginBottom: 12 }}>
                <label>{itemLabel}</label>
                <input value={editText} onChange={(e) => setEditText(e.target.value)} />
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
            <div key={x.id} className="card list-item">
              <div className="list-item__main">
                <strong>{x.name}</strong>
              </div>
              <div className="list-item__actions">
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    setEditId(x.id);
                    setEditText(x.name);
                  }}
                >
                  עריכה
                </button>
                <button className="btn btn--muted" onClick={() => remove(x.id)}>
                  מחיקה
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{addLabel}</label>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <button className="btn btn--block" onClick={add}>
          הוספה
        </button>
      </div>

      {items === null && (
        <p className="muted" style={{ fontSize: 12, marginTop: 12, textAlign: "center" }}>
          מוצגים ערכי ברירת מחדל. עריכה או הוספה תשמור את הרשימה.
        </p>
      )}
    </>
  );
}
