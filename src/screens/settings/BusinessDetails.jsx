import { useEffect, useRef, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";
import { resizeImage } from "../../data/photos";

const EMPTY = { name: "", email: "", address: "", phone: "", logoData: "" };

export default function BusinessDetails() {
  const { data, loading, save } = useSettingDoc("business");
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(false);
  const [logoErr, setLogoErr] = useState("");
  const logoRef = useRef(null);

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  // הלוגו נשמר מיד בעת ההעלאה/הסרה (בלי להמתין לכפתור "שמירה"), כדי שיופיע
  // בכל המסכים ובמטמון ההתחברות מיד.
  async function persistLogo(logoData) {
    const next = { ...form, logoData };
    setForm(next);
    await save(next);
    setSaved(true);
  }

  async function onLogoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoErr("");
    try {
      // מוקטן ל-PNG קטן (שקיפות נשמרת) ונשמר כ-dataURL ישירות בהגדרות — זמין בכל
      // המסכים בלי הרשאת Drive, וקטן דיו למגבלת מסמך Firestore.
      const dataUrl = await resizeImage(file, 512, 0.92, "image/png");
      await persistLogo(dataUrl);
    } catch {
      setLogoErr("טעינת הלוגו נכשלה. נסי קובץ תמונה אחר (JPG/PNG).");
    }
  }

  async function onSave() {
    await save(form);
    setSaved(true);
  }

  if (loading) return <p className="muted">טוען…</p>;

  return (
    <>
      <SettingsSubHeader title="פרטי עסק" />

      <div className="card">
        <div className="field">
          <label>שם העסק</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label>אימייל</label>
          <input
            type="email"
            dir="ltr"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="field">
          <label>טלפון</label>
          <input
            type="tel"
            dir="ltr"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div className="field">
          <label>כתובת</label>
          <input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>לוגו</label>
          <div className="logo-edit">
            <div className="logo-edit__preview">
              {form.logoData ? (
                <img src={form.logoData} alt="לוגו" />
              ) : (
                <span className="muted">אין לוגו</span>
              )}
            </div>
            <div className="logo-edit__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => logoRef.current?.click()}
              >
                {form.logoData ? "החלפת לוגו" : "העלאת לוגו"}
              </button>
              {form.logoData && (
                <button
                  type="button"
                  className="btn btn--muted btn--sm"
                  onClick={() => persistLogo("")}
                >
                  הסרה
                </button>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogoPick} />
          </div>
          {logoErr && <p className="warn-text">{logoErr}</p>}
        </div>
      </div>

      <div className="save-row">
        {saved && <span className="save-row__ok">נשמר ✓</span>}
        <button className="btn" onClick={onSave}>
          שמירה
        </button>
      </div>
    </>
  );
}
