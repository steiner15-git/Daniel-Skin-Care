import { formatILS } from "../utils/money";
import { resolveOffset, round2 } from "../utils/credits";

// שדה "קיזוז מיתרת זיכוי" משותף למסכים שגובים תשלום (סגירת תור; בשלב 4 גם
// רכישת סדרה ומכירת מוצר). רכיב מבוקר: offset הוא null כל עוד המשתמשת לא
// הקלידה (אז הקיזוז הוא ברירת המחדל — הנמוך מבין היתרה לסכום), או מחרוזת
// שהוקלדה. החישוב בפועל ב-resolveOffset (utils/credits.js) — הקורא משתמש
// באותה פונקציה כדי לקבל את הערך הסופי.
//
// balance: יתרה זמינה (creditBalance). amount: הסכום לתשלום לפני קיזוז.
// לא מוצג כשאין יתרה או כשאין מה לשלם.
export default function CreditOffsetField({ balance, amount, offset, setOffset }) {
  if (!(balance > 0) || !(amount > 0)) return null;

  const max = round2(Math.min(balance, amount));
  const effective = resolveOffset(offset, balance, amount);
  const cash = round2(amount - effective);
  const overMax = offset != null && (Number(offset) || 0) > max;

  return (
    <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
      <label>
        קיזוז מיתרת זיכוי (יתרה זמינה:{" "}
        <span className="sensitive">{formatILS(balance)}</span>)
      </label>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        max={max}
        value={offset == null ? effective : offset}
        onChange={(e) => setOffset(e.target.value)}
      />
      {overMax && (
        <p className="warn-text">⚠ הקיזוז מוגבל ל-{formatILS(max)} (נעצר אוטומטית).</p>
      )}
      <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
        לתשלום בפועל: <span className="sensitive">{formatILS(cash)}</span>
        {cash <= 0 && " · לא תיווצר הכנסה, ולא נדרש אמצעי תשלום"}
      </p>
    </div>
  );
}
