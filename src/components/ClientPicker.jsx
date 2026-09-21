import { useMemo, useState } from "react";
import { useCollectionData } from "../data";
import { fullName } from "../screens/clients/clientUtils";

// בורר לקוחה משותף: חיפוש בין הלקוחות הפעילות, או — כש-allowCasual — הזנת
// שם של לקוחה מזדמנת (ללא כרטיסייה, clientId ריק). מחזיר דרך onChange את
// הזוג { clientId, clientName }:
//   - לקוחה מהרשימה  → clientId מלא + השם המלא שלה
//   - לקוחה מזדמנת   → clientId ריק + השם שהוקלד
//   - ניקוי ("שינוי") → שניהם ריקים
// לקוחות בארכיון אינן מוצעות (כמו בתיאום תור), אך אם ההכנסה כבר משויכת
// ללקוחה כזו — היא מוצגת כרגיל במצב "נבחרה".
export default function ClientPicker({
  clientId,
  clientName,
  onChange,
  label = "לקוחה (אופציונלי)",
  allowCasual = true,
}) {
  const { items: clients } = useCollectionData("clients");
  const [query, setQuery] = useState("");
  const term = query.trim();

  const suggestions = useMemo(() => {
    if (!term) return [];
    return clients.filter((c) => !c.archived && fullName(c).includes(term)).slice(0, 6);
  }, [clients, term]);

  function pick(c) {
    onChange({ clientId: c.id, clientName: fullName(c) });
    setQuery("");
  }

  function pickCasual() {
    onChange({ clientId: "", clientName: term });
    setQuery("");
  }

  // מצב "נבחרה": לקוחה מהרשימה, או שם בלבד (מזדמנת / הכנסה ישנה בלי clientId).
  if (clientId || clientName) {
    return (
      <div className="field">
        <label>{label}</label>
        <div className="picked">
          <span>
            <strong>{clientName}</strong>
            {!clientId && (
              <span className="badge badge--info" style={{ marginInlineStart: 8 }}>
                ללא כרטיסייה
              </span>
            )}
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onChange({ clientId: "", clientName: "" })}
          >
            שינוי
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label>{label}</label>
      <input
        placeholder={allowCasual ? "חיפוש לקוחה או שם לקוחה מזדמנת" : "שם הלקוחה"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {term && (suggestions.length > 0 || allowCasual) && (
        <div className="suggest">
          {suggestions.map((c) => (
            <button key={c.id} type="button" className="suggest__item" onClick={() => pick(c)}>
              {fullName(c)}{" "}
              {c.phone && (
                <span className="muted" dir="ltr">
                  {c.phone}
                </span>
              )}
            </button>
          ))}
          {allowCasual && (
            <button type="button" className="suggest__item" onClick={pickCasual}>
              <span className="muted">לקוחה מזדמנת (ללא כרטיסייה):</span> {term}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
