import { splitGross, clampRate, formatMoney2 } from "../utils/vat";

// שדות מע"מ משותפים לטופס הכנסה והוצאה. החוק אחיד: עורכים או את הסכום הכולל
// (בשדה הסכום של הטופס עצמו) או את שיעור המע"מ (כאן); נטו וסכום המע"מ תמיד
// מחושבים. rate הוא מחרוזת הקלט (כבר "הערך המוצג" — ברירת המחדל משנת המס, או
// ערך ידני). manual=true כשהשיעור נערך ידנית ויישמר על הרשומה.
export default function VatFields({ gross, rate, manual, defaultRate, onRateChange, onReset }) {
  const parts = splitGross(gross, clampRate(rate));

  return (
    <div className="field">
      <label>מע"מ (%)</label>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        max="100"
        step="0.01"
        dir="ltr"
        value={rate}
        onChange={(e) => onRateChange(e.target.value)}
      />
      <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
        {manual
          ? "שיעור שנערך ידנית ברשומה זו."
          : `לפי הגדרות שנת המס של התאריך (${defaultRate}%).`}
      </p>
      {manual && (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ marginTop: 8 }}
          onClick={onReset}
        >
          איפוס ל-{defaultRate}%
        </button>
      )}
      <div style={{ marginTop: 10 }}>
        <div className="read-row">
          <span className="muted">נטו (ללא מע"מ)</span>
          <span className="sensitive">{formatMoney2(parts.net)}</span>
        </div>
        <div className="read-row">
          <span className="muted">מע"מ</span>
          <span className="sensitive">{formatMoney2(parts.vat)}</span>
        </div>
      </div>
    </div>
  );
}
