import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData } from "../../data";
import { fullName, normalizePhone } from "./clientUtils";

export default function ClientsList() {
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("clients");
  const [q, setQ] = useState("");

  const active = useMemo(
    () => items.filter((c) => !c.archived),
    [items]
  );
  const archivedCount = items.length - active.length;

  const filtered = useMemo(() => {
    const term = q.trim();
    const digits = normalizePhone(term);
    const list = active.filter((c) => {
      const name = fullName(c);
      const byName = term && name.includes(term);
      const byPhone = digits && normalizePhone(c.phone).includes(digits);
      return !term || byName || byPhone;
    });
    return list.sort((a, b) => fullName(a).localeCompare(fullName(b), "he"));
  }, [active, q]);

  return (
    <>
      <ScreenHeader
        title="לקוחות"
        action={
          <button className="btn" onClick={() => navigate("/clients/new")}>
            + לקוחה
          </button>
        }
      />

      <div className="field">
        <input
          placeholder="חיפוש לפי שם או טלפון"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {active.length === 0 ? "עדיין אין לקוחות. הוסיפי לקוחה ראשונה." : "לא נמצאו תוצאות."}
        </div>
      ) : (
        <div className="list">
          {filtered.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}`} className="card list-item">
              <div className="list-item__main">
                <strong>{fullName(c)}</strong>
                {c.phone && <span className="muted" dir="ltr">{c.phone}</span>}
              </div>
              <span className="nav-card__chev">‹</span>
            </Link>
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <Link to="/clients/archive" className="archive-link">
          ארכיון לקוחות ({archivedCount}) →
        </Link>
      )}
    </>
  );
}
