import { useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import DateField from "../../components/DateField";
import { useCollectionData, useAuditLog } from "../../data";
import { useVatSettings } from "../../data/useVatSettings";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { formatDate } from "../../utils/datetime";
import {
  clampRate,
  effectiveRate,
  newYearEntry,
  profitForYear,
  validateYears,
  formatMoney2,
  VAT_STATUS_LABEL,
} from "../../utils/vat";

// מסך "מע"מ ושנות מס". לכל שנת מס: תקופה (ברירת מחדל 1.1–31.12), סטטוס (פטור /
// מורשה), "מע"מ % לעוסק פטור" (ברירת מחדל 0) ו"מע"מ %" (ברירת מחדל 18), ואישור
// ערך. הנטו והמע"מ של כל רשומה נגזרים מהגדרות שנת המס של תאריכה — שינוי סטטוס
// כאן חל מיד על כל רשומות השנה (ראו utils/vat.js). הערכים מתעדכנים ידנית בכל שנה;
// שנה חדשה נוספת בכפתור (מועתקת מהקודמת) ונשארת "לא מאושרת" עד אישור.
export default function VatSettings() {
  const { years, loading, save } = useVatSettings();
  const { items: income } = useCollectionData("income");
  const { items: expenses } = useCollectionData("expenses");
  const log = useAuditLog();
  const confirmDialog = useConfirm();

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const warnings = validateYears(years);
  const thisYear = new Date().getFullYear();
  const shown = years.slice().reverse();

  // כשל בלוג אחרי פעולה שהצליחה לא אמור להציג "השמירה נכשלה".
  async function safeLog(entry) {
    try {
      await log(entry);
    } catch (e) {
      console.error("[audit] vat_year_edit failed", e);
    }
  }

  async function persist(nextYears, before, after, desc) {
    setSaving(true);
    try {
      await save({ years: nextYears });
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת הגדרות המע\"מ נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
      return false;
    }
    await safeLog({
      action: "vat_year_edit",
      entity: { type: "vat", id: after?.id || before?.id || "vat", desc },
      before: before || null,
      after: after || null,
    });
    setSaving(false);
    return true;
  }

  async function addYear() {
    const last = years[years.length - 1];
    const year = last ? Number(last.to.slice(0, 4)) + 1 : thisYear;
    const entry = newYearEntry(last, year);
    await persist([...years, entry], null, entry, `הוספת שנת מס ${entry.id}`);
  }

  async function confirmYear(y) {
    const next = years.map((x) =>
      x.id === y.id ? { ...x, confirmed: true, confirmedAt: Date.now() } : x
    );
    await persist(
      next,
      { id: y.id, confirmed: y.confirmed },
      { id: y.id, confirmed: true },
      `אישור ערך מע"מ לשנת ${y.id}`
    );
  }

  function startEdit(y) {
    setEditId(y.id);
    setDraft({ ...y });
  }

  async function saveEdit() {
    const original = years.find((y) => y.id === editId);
    if (!original || !draft.from || !draft.to) return;
    const edited = {
      ...draft,
      exemptRate: clampRate(draft.exemptRate),
      rate: clampRate(draft.rate),
      ceiling: Math.max(0, Number(draft.ceiling) || 0),
      // שמירה אחרי עריכה מפורשת של הערכים נחשבת אישור שלהם.
      confirmed: true,
      confirmedAt: Date.now(),
    };
    const next = years.map((y) => (y.id === editId ? edited : y));

    // אישור לפני שינוי שמשנה את תוצאות השנה: מציגים רווח לפני/אחרי.
    const before = profitForYear(income, expenses, years, editId);
    const after = profitForYear(income, expenses, next, editId);
    if (before !== after) {
      const ok = await confirmDialog({
        title: `שינוי הגדרות שנת ${editId}`,
        message: `השינוי חל על כל הרשומות של השנה. הרווח לשנת ${editId} ישתנה מ-${formatMoney2(
          before
        )} ל-${formatMoney2(after)}.\nאפשר לחזור להגדרה הקודמת בכל עת — הנתונים עצמם לא משתנים.`,
        confirmLabel: "שמירה",
      });
      if (!ok) return;
    }

    const snap = (y) => ({
      from: y.from,
      to: y.to,
      status: y.status,
      exemptRate: y.exemptRate,
      rate: y.rate,
      ceiling: y.ceiling,
    });
    const done = await persist(
      next,
      snap(original),
      snap(edited),
      `עריכת הגדרות מע"מ לשנת ${editId}`
    );
    if (done) {
      setEditId(null);
      setDraft(null);
    }
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title={'מע"מ ושנות מס'} />

      <div className="notice" style={{ marginTop: 0 }}>
        הסכום הכולל נשמר בכל הכנסה והוצאה; הנטו והמע"מ מחושבים לפי הגדרות שנת המס של
        תאריך הרשומה. שינוי סטטוס שנה לעוסק מורשה חל אחורה על כל השנה. בשנת פטור הרווח
        מחושב מהסכומים הכוללים. ערכי המע"מ מתעדכנים ידנית בכל שנה.
      </div>

      {warnings.map((w) => (
        <p key={w} className="warn-text">
          ⚠ {w}
        </p>
      ))}

      {years.length === 0 && (
        <div className="empty-state" style={{ padding: "20px 8px" }}>
          עדיין לא הוגדרו שנות מס. עד להגדרה: עוסק פטור, מע"מ 0%.
        </div>
      )}

      <div className="list">
        {shown.map((y) =>
          editId === y.id ? (
            <div key={y.id} className="card list-item--edit">
              <strong>שנת מס {y.id}</strong>
              <div className="field" style={{ marginTop: 12 }}>
                <label>סטטוס</label>
                <div className="seg" style={{ marginBottom: 0 }}>
                  <button
                    type="button"
                    className={"seg__btn" + (draft.status === "exempt" ? " on" : "")}
                    onClick={() => setDraft({ ...draft, status: "exempt" })}
                  >
                    עוסק פטור
                  </button>
                  <button
                    type="button"
                    className={"seg__btn" + (draft.status === "licensed" ? " on" : "")}
                    onClick={() => setDraft({ ...draft, status: "licensed" })}
                  >
                    עוסק מורשה
                  </button>
                </div>
              </div>
              <div className="row-2">
                <div className="field">
                  <label>מע"מ % לעוסק פטור (חישוב)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    value={draft.exemptRate}
                    onChange={(e) => setDraft({ ...draft, exemptRate: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>מע"מ %</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    dir="ltr"
                    value={draft.rate}
                    onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>תקרת מחזור שנתית לעוסק פטור (₪) — למד התקרה, 0 = ללא מד</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  dir="ltr"
                  value={draft.ceiling ?? 0}
                  onChange={(e) => setDraft({ ...draft, ceiling: e.target.value })}
                />
              </div>
              <div className="field">
                <label>תחילת שנת המס</label>
                <DateField
                  value={draft.from}
                  onChange={(v) => setDraft({ ...draft, from: v })}
                  fromYear={thisYear - 10}
                  toYear={thisYear + 5}
                />
              </div>
              <div className="field">
                <label>סוף שנת המס</label>
                <DateField
                  value={draft.to}
                  onChange={(v) => setDraft({ ...draft, to: v })}
                  fromYear={thisYear - 10}
                  toYear={thisYear + 5}
                />
              </div>
              <div className="save-row">
                <button className="btn btn--muted" onClick={() => setEditId(null)}>
                  ביטול
                </button>
                <button
                  className="btn"
                  disabled={saving || !draft.from || !draft.to}
                  onClick={saveEdit}
                >
                  {saving ? "שומרת…" : "שמירה ואישור"}
                </button>
              </div>
            </div>
          ) : (
            <div key={y.id} className="card">
              <div className="card-head" style={{ marginBottom: 8 }}>
                <h3>שנת מס {y.id}</h3>
                <span className={"badge " + (y.confirmed ? "badge--ok" : "badge--pending")}>
                  {y.confirmed ? "מאושרת" : "לא מאושרת"}
                </span>
              </div>
              <div className="read-row">
                <span className="muted">תקופה</span>
                <span>
                  {formatDate(y.from)} – {formatDate(y.to)}
                </span>
              </div>
              <div className="read-row">
                <span className="muted">סטטוס</span>
                <span>{VAT_STATUS_LABEL[y.status]}</span>
              </div>
              <div className="read-row">
                <span className="muted">מע"מ % לעוסק פטור (חישוב)</span>
                <span>{y.exemptRate}%</span>
              </div>
              <div className="read-row">
                <span className="muted">מע"מ %</span>
                <span>{y.rate}%</span>
              </div>
              <div className="read-row">
                <span className="muted">שיעור בתוקף ברשומות</span>
                <strong>{effectiveRate(y)}%</strong>
              </div>
              {y.ceiling > 0 && (
                <div className="read-row">
                  <span className="muted">תקרת מחזור (עוסק פטור)</span>
                  <span>₪{y.ceiling.toLocaleString("he-IL")}</span>
                </div>
              )}
              <div className="save-row" style={{ justifyContent: "flex-start" }}>
                {!y.confirmed && (
                  <button className="btn" disabled={saving} onClick={() => confirmYear(y)}>
                    אישור ערך
                  </button>
                )}
                <button className="btn btn--ghost" onClick={() => startEdit(y)}>
                  עריכה
                </button>
              </div>
            </div>
          )
        )}
      </div>

      <button
        className="btn btn--block"
        style={{ marginTop: 16 }}
        disabled={saving}
        onClick={addYear}
      >
        {years.length === 0
          ? `+ הגדרת שנת מס ${thisYear}`
          : `+ הוספת שנת מס ${Number(years[years.length - 1].to.slice(0, 4)) + 1}`}
      </button>
      <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 10 }}>
        שנה חדשה מועתקת מהשנה הקודמת ונשארת "לא מאושרת" עד אישור הערך.
      </p>
    </>
  );
}
