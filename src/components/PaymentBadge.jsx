import { useNavigate } from "react-router-dom";

// תגית תשלום משותפת: "שולם" (תצוגתי) או "לא שולם" (לחיץ, מוביל ישירות
// לעריכת ההכנסה). מקבלת את רשומת ההכנסה עצמה (או null/undefined אם אין
// רשומה תואמת — במקרה כזה לא מוצגת תגית כלל, ולא ניווט שבור).
// שימוש חוזר: כרטיסיית לקוחה (תורים/חבילות/מוצרים), טאב "רכישות" ב-
// Series.jsx, טאב "מכירות" ב-Products.jsx. ראו addendum §5, §13, §14, §15.
export default function PaymentBadge({ income }) {
  const navigate = useNavigate();
  if (!income) return null;
  if (income.paid) return <span className="badge badge--ok">שולם</span>;
  return (
    <button
      type="button"
      className="badge badge--warn badge--btn"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/business/income/${income.id}/edit`);
      }}
    >
      לא שולם
    </button>
  );
}
