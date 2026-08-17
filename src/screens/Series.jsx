import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import DateField from "../components/DateField";
import { useCollectionData, useRepo, useSettingDoc } from "../data";
import { formatILS } from "../utils/money";

const EMPTY = { treatments: [], name: "", sessions: "", price: "", expiryDate: "" };

export default function Series() {
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("series");
  const repo = useRepo("series");
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const treatments = treatmentsDoc?.items ?? [];

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);

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
      alert("Failed to save the series: " + (e?.message || e));
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
      alert("Failed to update the series: " + (e?.message || e));
      return;
    }
    setEditId(null);
    setEditDraft(null);
  }
  async function remove(id) {
    if (!confirm("למחוק את הסדרה? חבילות שכבר נרכשו לא ייפגעו.")) return;
    await repo.remove(id);
  }

  if (loading) return <p className="muted">טוען…</p>;

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
                  <button className="btn btn--muted" onClick={() => remove(s.id)}>
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
