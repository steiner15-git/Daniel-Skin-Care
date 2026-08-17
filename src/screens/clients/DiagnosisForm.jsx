import { DIAGNOSIS_SECTIONS, SKIN_TYPES } from "./diagnosisSchema";

// מרנדר את טופס האבחון מתוך הסכימה. readOnly=true → תצוגה בלבד.
export default function DiagnosisForm({ value = {}, onChange, readOnly = false }) {
  function setField(key, v) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="list">
      {DIAGNOSIS_SECTIONS.map((section) => (
        <div key={section.key} className="card">
          <h3 className="diag-section__title">{section.title}</h3>
          <div className="diag-fields">
            {section.fields.map((f) => (
              <Field
                key={f.key}
                field={f}
                value={value[f.key]}
                onChange={(v) => setField(f.key, v)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ field, value, onChange, readOnly }) {
  const { type, label, textLabel, options } = field;

  if (type === "yesNoText") {
    const v = value || { yes: false, text: "" };
    if (readOnly) {
      return (
        <ReadRow
          label={label}
          value={v.yes ? "כן" + (v.text ? ` · ${v.text}` : "") : "לא"}
        />
      );
    }
    return (
      <div className="diag-field">
        <label className="diag-check">
          <input
            type="checkbox"
            checked={v.yes}
            onChange={(e) => onChange({ ...v, yes: e.target.checked })}
          />
          <span>{label}</span>
        </label>
        {v.yes && (
          <input
            className="diag-inline-text"
            placeholder={textLabel || "פירוט"}
            value={v.text}
            onChange={(e) => onChange({ ...v, text: e.target.value })}
          />
        )}
      </div>
    );
  }

  if (type === "select") {
    if (readOnly) return <ReadRow label={label} value={value || "—"} />;
    return (
      <div className="diag-field">
        <label className="diag-label">{label}</label>
        <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— בחרי —</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "finding") {
    const v = value || {};
    const showExtras =
      v.main && v.main !== "אין" && field.extras && field.extras.length > 0;
    return (
      <div className="diag-field">
        <label className="diag-label">{label}</label>
        <select value={v.main || ""} onChange={(e) => onChange({ ...v, main: e.target.value })}>
          <option value="">— בחרי —</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {showExtras && (
          <div className="finding-extras">
            {field.extras.map((ex) =>
              ex.options ? (
                <select
                  key={ex.key}
                  value={v[ex.key] || ""}
                  onChange={(e) => onChange({ ...v, [ex.key]: e.target.value })}
                >
                  <option value="">{ex.label}</option>
                  {ex.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  key={ex.key}
                  placeholder={ex.label}
                  value={v[ex.key] || ""}
                  onChange={(e) => onChange({ ...v, [ex.key]: e.target.value })}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  }

  if (type === "textarea") {
    if (readOnly) return <ReadRow label={label} value={value || "—"} />;
    return (
      <div className="diag-field">
        <label className="diag-label">{label}</label>
        <textarea rows={3} value={value || ""} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  if (type === "skinTypes") {
    const arr = value || [];
    if (readOnly) return <ReadRow label={label} value={arr.length ? arr.join(", ") : "—"} />;
    function toggle(t) {
      if (arr.includes(t)) onChange(arr.filter((x) => x !== t));
      else if (arr.length < 2) onChange([...arr, t]);
    }
    return (
      <div className="diag-field">
        <label className="diag-label">{label}</label>
        <div className="chips">
          {SKIN_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={"chip" + (arr.includes(t) ? " chip--on" : "")}
              onClick={() => toggle(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // text
  if (readOnly) return <ReadRow label={label} value={value || "—"} />;
  return (
    <div className="diag-field">
      <label className="diag-label">{label}</label>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ReadRow({ label, value }) {
  return (
    <div className="read-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
