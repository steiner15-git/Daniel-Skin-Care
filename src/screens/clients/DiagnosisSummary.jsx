import { DIAGNOSIS_SECTIONS } from "./diagnosisSchema";

// תצוגת סיכום של טופס האבחון — מציגה רק את מה שסומן/מולא (לא מציפה).
function displayValue(field, value) {
  if (value == null) return null;
  if (field.type === "yesNoText") {
    if (!value.yes) return null;
    return value.text ? value.text : "כן";
  }
  if (field.type === "skinTypes") {
    return value.length ? value.join(", ") : null;
  }
  if (field.type === "finding") {
    if (!value.main || value.main === "אין") return null;
    const extras = (field.extras || [])
      .map((e) => value[e.key])
      .filter(Boolean)
      .join(" · ");
    return value.main + (extras ? ` (${extras})` : "");
  }
  const s = String(value).trim();
  return s ? s : null;
}

export default function DiagnosisSummary({ value = {} }) {
  const sections = DIAGNOSIS_SECTIONS.map((section) => {
    const rows = section.fields
      .map((f) => ({ label: f.
label, text: displayValue(f, value[f.key]) }))
      .filter((r) => r.text != null);
    return { title: section.title, rows };
  }).filter((s) => s.rows.length > 0);

  if (sections.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>טרם מולא אבחון.</p>;
  }

  return (
    <div className="diag-summary">
      {sections.map((s) => (
        <div key={s.title} className="diag-summary__section">
          <h4>{s.title}</h4>
          {s.rows.map((r) => (
            <div key={r.label} className="diag-summary__row">
              <span className="muted">{r.label}</span>
              <span className="sensitive">{r.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
