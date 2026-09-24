import { useEffect, useRef, useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useSettingDoc } from "../../data";
import { resizeImage } from "../../data/photos";
import { useConfirm } from "../../context/ConfirmDialogProvider";

const EMPTY = { name: "", email: "", address: "", phone: "", logoData: "" };

export default function BusinessDetails() {
  const { data, loading, save } = useSettingDoc("business");
  const confirmDialog = useConfirm();
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
  // תוקן QA (2026-09): נוסף try/catch — כשל Firestore בעת שמירת הלוגו היה
  // נכשל בשקט (form כבר עודכן ב-state לפני ה-await, כך שהתצוגה נראית
  // תקינה גם אם השמירה בפועל נכשלה).
  async function persistLogo(logoData) {
    const next = { ...form, logoData };
    setForm(next);
    try {
      await save(next);
      setSaved(true);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת הלוגו נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    }
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

  // תוקן QA (2026-09): נוסף try/catch.
  async function onSave() {
    try {
      await save(form);
      setSaved(true);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת פרטי העסק נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    }
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
