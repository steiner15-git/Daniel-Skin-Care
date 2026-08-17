import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData } from "../../data";

const ACTION_LABELS = {
  income_edit: "עריכת הכנסה",
  income_delete: "מחיקת הכנסה",
  income_mark_paid: "סימון הכנסה כשולם",
  income_unmark_paid: "הסרת סימון שולם",
  expense_edit: "עריכת הוצאה",
  expense_delete: "מחיקת הוצאה",
  client_edit: "עריכת פרטי לקוחה",
  client_diagnosis_edit: "עריכת אבחון עור",
  client_archive: "העברת לקוחה לארכיון",
  client_restore: "שחזור לקוחה מהארכיון",
  client_delete_permanent: "מחיקת לקוחה לצמיתות",
  series_purchase: "רכישת סדרה/חבילה",
  product_sale: "מכירת מוצר",
  package_charge: "חיוב תור מחבילה",
  package_edit: "עריכת חבילת לקוחה",
  package_delete: "מחיקת חבילת לקוחה",
  appointment_delete: "מחיקת תור",
};

function tsToStr(ts) {
  if (!ts) return "";
  // מקומי: ts הוא מספר (Date.now). בענן: Firestore Timestamp עם toDate().
  const d = typeof ts === "number" ? new Date(ts) : ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("he-IL");
}

export default function AuditLog() {
  const navigate = useNavigate();
  const { items, loading } = useCollectionData("auditLog");

  const sorted = useMemo(() => {
    return items.slice().sort((a, b) => {
      const ta = typeof a.ts === "number" ? a.ts : a.ts?.toDate?.().getTime?.() || 0;
      const tb = typeof b.ts === "number" ? b.ts : b.ts?.toDate?.().getTime?.() || 0;
      return tb - ta;
    });
  }, [items]);

  return (
    <>
      <ScreenHeader
        title="לוג שינויים"
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/settings")}>
            חזרה
          </button>
        }
      />

      <div className="notice" style={{ marginTop: 0 }}>
        תיעוד פעולות רגישות על נתונים פיננסיים ולקוחות — רשת ביטחון למעקב ולשחזור מידע.
      </div>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : sorted.length === 0 ? (
        <div className="empty-state">אין עדיין רשומות בלוג.</div>
      ) : (
        <div className="list">
          {sorted.map((r) => (
            <div key={r.id} className="card log-item">
              <div className="log-item__head">
                <strong>{ACTION_LABELS[r.action] || r.action}</strong>
                <span className="muted">{tsToStr(r.ts)}</span>
              </div>
              {r.entity?.desc && <span className="muted">{r.entity.desc}</span>}
              {(r.before || r.after) && (
                <div className="log-item__diff">
                  {r.before && <span>לפני: {JSON.stringify(r.before)}</span>}
                  {r.after && <span>אחרי: {JSON.stringify(r.after)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
