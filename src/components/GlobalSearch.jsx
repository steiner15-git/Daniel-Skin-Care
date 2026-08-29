import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCollectionData } from "../data";
import { fullName, normalizePhone } from "../screens/clients/clientUtils";
import { formatILS } from "../utils/money";
import { formatDate } from "../utils/datetime";

const CAP = 5;

// חיפוש גלובלי (addendum #11) — נגיש מכל מסך דרך אייקון קבוע ב-ScreenHeader.
// קטגוריות בסדר קבוע: לקוחות → הכנסות/הוצאות → חבילות/סדרות → תמונות
// אלבום. כל הנתונים כבר נטענים ע"י useCollectionData בזמן אמת בכל מקרה
// (שום קריאת רשת נוספת) — כאן רק סינון בזיכרון, ורק כשיש טקסט בשדה.
export default function GlobalSearch({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const { items: clients } = useCollectionData("clients");
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");
  const { items: packages } = useCollectionData("clientPackages");
  const { items: photos } = useCollectionData("photos");

  const term = q.trim();
  const digits = normalizePhone(term);

  const clientNameById = useMemo(() => {
    const map = {};
    for (const c of clients) map[c.id] = fullName(c);
    return map;
  }, [clients]);

  // לקוחות: לפי שם/טלפון. כולל גם לקוחות בארכיון במכוון — חיפוש גלובלי
  // נועד למצוא כל דבר, לא רק מי שזמינה לתיאום תור חדש (שם יש סינון ארכיון
  // נפרד ומכוון, ראו AppointmentForm.jsx).
  const clientResults = useMemo(() => {
    if (!term) return [];
    return clients.filter((c) => {
      const byName = fullName(c).includes(term);
      const byPhone = digits && normalizePhone(c.phone).includes(digits);
      return byName || byPhone;
    });
  }, [clients, term, digits]);

  // הכנסות/הוצאות: מאוחדות לרשימה אחת ממוינת לפי תאריך. הכנסות ממכירת
  // מוצר/סדרה נכללות אוטומטית — הן רשומות income רגילות (source:"product"/
  // "series") עם treatmentName, שכבר נבדק כאן.
  const financeResults = useMemo(() => {
    if (!term) return [];
    const inc = income
      .filter((r) =>
        [r.clientName, r.treatmentName, r.note, r.invoiceNumber]
          .filter(Boolean)
          .some((v) => String(v).includes(term))
      )
      .map((r) => ({ ...r, __kind: "income" }));
    const exp = expenses
      .filter((r) =>
        [r.description, r.businessName, r.category, r.invoiceNumber]
          .filter(Boolean)
          .some((v) => String(v).includes(term))
      )
      .map((r) => ({ ...r, __kind: "expense" }));
    return [...inc, ...exp].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [income, expenses, term]);

  // חבילות/סדרות: לפי שם לקוחה או שם סדרה.
  const packageResults = useMemo(() => {
    if (!term) return [];
    return packages.filter(
      (p) => (p.clientName || "").includes(term) || (p.seriesName || "").includes(term)
    );
  }, [packages, term]);

  // תמונות אלבום: לפי לקוחה/תיאור/טיפול.
  const photoResults = useMemo(() => {
    if (!term) return [];
    return photos.filter((p) => {
      const clientName = p.clientId ? clientNameById[p.clientId] || "" : "";
      return (
        clientName.includes(term) ||
        (p.description || "").includes(term) ||
        (p.treatmentName || "").includes(term)
      );
    });
  }, [photos, term, clientNameById]);

  const hasAny =
    clientResults.length + financeResults.length + packageResults.length + photoResults.length > 0;

  function toggleExpand(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function go(path, opts) {
    onClose();
    navigate(path, opts);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal search-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" aria-label="סגירה" onClick={onClose}>
          ×
        </button>

        <div className="field" style={{ marginBottom: 0 }}>
          <input
            autoFocus
            placeholder="חיפוש לקוחות, הכנסות/הוצאות, חבילות, תמונות…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {!term ? (
          <p className="muted" style={{ marginTop: 16 }}>
            הקלידי כדי לחפש בכל האפליקציה.
          </p>
        ) : !hasAny ? (
          <p className="muted" style={{ marginTop: 16 }}>
            לא נמצאו תוצאות.
          </p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {clientResults.length > 0 && (
              <SearchSection
                title="לקוחות"
                items={clientResults}
                expanded={expanded.has("clients")}
                onToggle={() => toggleExpand("clients")}
                renderItem={(c) => (
                  <button key={c.id} className="suggest__item" onClick={() => go(`/clients/${c.id}`)}>
                    <span>
                      {fullName(c)}
                      {c.archived ? " · בארכיון" : ""}
                    </span>
                    {c.phone && (
                      <span className="muted" dir="ltr">
                        {c.phone}
                      </span>
                    )}
                  </button>
                )}
              />
            )}

            {financeResults.length > 0 && (
              <SearchSection
                title="הכנסות והוצאות"
                items={financeResults}
                expanded={expanded.has("finance")}
                onToggle={() => toggleExpand("finance")}
                renderItem={(r) => (
                  <button
                    key={r.__kind + r.id}
                    className="suggest__item"
                    style={{ justifyContent: "space-between" }}
                    onClick={() => go(`/business/${r.__kind}/${r.id}/edit`)}
                  >
                    <span>
                      {r.__kind === "income" ? "💰" : "🧾"}{" "}
                      {r.treatmentName || r.description || (r.__kind === "income" ? "הכנסה" : "הוצאה")}
                      {r.clientName ? ` · ${r.clientName}` : r.businessName ? ` · ${r.businessName}` : ""}
                    </span>
                    <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                      {formatDate(r.date)} · {formatILS(r.__kind === "income" ? r.amount : r.total)}
                    </span>
                  </button>
                )}
              />
            )}

            {packageResults.length > 0 && (
              <SearchSection
                title="חבילות/סדרות"
                items={packageResults}
                expanded={expanded.has("packages")}
                onToggle={() => toggleExpand("packages")}
                renderItem={(p) => (
                  <button
                    key={p.id}
                    className="suggest__item"
                    style={{ justifyContent: "space-between" }}
                    onClick={() => go(`/clients/${p.clientId}`, { state: { tab: "appointments" } })}
                  >
                    <span>
                      {p.clientName} · {p.seriesName}
                    </span>
                    <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                      נותרו {p.remainingSessions}/{p.totalSessions}
                    </span>
                  </button>
                )}
              />
            )}

            {photoResults.length > 0 && (
              <SearchSection
                title="תמונות אלבום"
                items={photoResults}
                expanded={expanded.has("photos")}
                onToggle={() => toggleExpand("photos")}
                renderItem={(p) => (
                  <button
                    key={p.id}
                    className="suggest__item"
                    style={{ justifyContent: "space-between" }}
                    onClick={() =>
                      go("/album", p.clientId ? { state: { clientId: p.clientId } } : undefined)
                    }
                  >
                    <span>
                      {p.clientId ? clientNameById[p.clientId] || "לקוחה" : "ללא שיוך"}
                      {p.description ? ` · ${p.description}` : ""}
                    </span>
                    <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                      {p.date}
                    </span>
                  </button>
                )}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchSection({ title, items, expanded, onToggle, renderItem }) {
  const visible = expanded ? items : items.slice(0, CAP);
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 className="group-title" style={{ margin: "0 0 8px" }}>
        {title} ({items.length})
      </h3>
      <div className="suggest">{visible.map(renderItem)}</div>
      {items.length > CAP && (
        <button className="show-all search-show-more" onClick={onToggle}>
          {expanded ? "הצג פחות" : `הצג עוד (${items.length - CAP}) →`}
        </button>
      )}
    </div>
  );
}
