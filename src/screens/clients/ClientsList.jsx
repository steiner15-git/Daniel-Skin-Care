import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { SkeletonRows } from "../../components/Skeleton";
import { useCollectionData } from "../../data";
import { useReminderSettings } from "../../data/useReminderSettings";
import { inactiveClients } from "../../utils/reminders";
import { fullName, normalizePhone } from "./clientUtils";

export default function ClientsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inactiveFilter = searchParams.get("filter") === "inactive";

  const { items, loading } = useCollectionData("clients");
  // התורים נדרשים רק כשסינון "לקוחות לא פעילות" פעיל (חישוב תור אחרון
  // שבוצע לכל לקוחה) — נטענים ממילא ע"י useCollectionData בכל מקרה
  // (מנוי בזמן אמת), כך שאין עלות רשת נוספת גם כשהסינון כבוי.
  const { items: appts, loading: loadingAppts } = useCollectionData("appointments");
  const { data: reminders } = useReminderSettings();
  const [q, setQ] = useState("");

  const active = useMemo(() => items.filter((c) => !c.archived), [items]);
  const archivedCount = items.length - active.length;

  const inactiveList = useMemo(
    () => inactiveClients(active, appts, reminders.inactiveClientMonths).map((x) => x.client),
    [active, appts, reminders.inactiveClientMonths]
  );

  const baseList = inactiveFilter ? inactiveList : active;

  const filtered = useMemo(() => {
    const term = q.trim();
    const digits = normalizePhone(term);
    const list = baseList.filter((c) => {
      const name = fullName(c);
      const byName = term && name.includes(term);
      const byPhone = digits && normalizePhone(c.phone).includes(digits);
      return !term || byName || byPhone;
    });
    return list.sort((a, b) => fullName(a).localeCompare(fullName(b), "he"));
  }, [baseList, q]);

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

      {inactiveFilter && (
        <div
          className="notice"
          style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <span>מציגה לקוחות שלא ביקרו מעל {reminders.inactiveClientMonths} חודשים</span>
          <button className="btn btn--ghost btn--sm" onClick={() => navigate("/clients")}>
            נקה סינון
          </button>
        </div>
      )}

      <div className="field">
        <input
          placeholder="חיפוש לפי שם או טלפון"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading || (inactiveFilter && loadingAppts) ? (
        <SkeletonRows count={5} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {inactiveFilter
            ? "אין לקוחות התואמות לסינון זה."
            : active.length === 0
            ? "עדיין אין לקוחות. הוסיפי לקוחה ראשונה."
            : "לא נמצאו תוצאות."}
        </div>
      ) : (
        <div className="list">
          {filtered.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}`} className="card list-item">
              <div className="list-item__main">
                <strong>{fullName(c)}</strong>
                {c.phone && <span className="muted sensitive" dir="ltr">{c.phone}</span>}
              </div>
              <span className="nav-card__chev">‹</span>
            </Link>
          ))}
        </div>
      )}

      {!inactiveFilter && archivedCount > 0 && (
        <Link to="/clients/archive" className="archive-link">
          ארכיון לקוחות ({archivedCount}) →
        </Link>
      )}
    </>
  );
}
