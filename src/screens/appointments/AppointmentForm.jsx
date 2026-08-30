import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import TimeField from "../../components/TimeField";
import {
  useCollectionData,
  useRepo,
  useSettingDoc,
} from "../../data";
import { fullName } from "../clients/clientUtils";
import { combine, overlaps, weekday, formatTime, dateInputValue } from "../../utils/datetime";
import { useConfirm } from "../../context/ConfirmDialogProvider";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function AppointmentForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { items: clients } = useCollectionData("clients");
  const { items: appts } = useCollectionData("appointments");
  const { items: events } = useCollectionData("events");
  const { items: packages } = useCollectionData("clientPackages");
  const repo = useRepo("appointments");
  const { data: treatmentsDoc } = useSettingDoc("treatments");
  const { data: hoursDoc } = useSettingDoc("workingHours");
  const treatments = treatmentsDoc?.items ?? [];
  const confirmDialog = useConfirm();

  const editing = isEdit ? appts.find((a) => a.id === id) : null;
  const locked = editing && (editing.status === "done" || editing.incomeId);

  const [form, setForm] = useState({
    mode: "existing",
    clientId: "",
    clientName: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    treatmentId: "",
    treatmentName: "",
    price: "",
    date: dateInputValue(new Date()),
    time: "09:00",
    durationMin: 60,
    sendInvite: false,
    chargeFromPackage: false,
    clientPackageId: "",
  });
  const [clientQuery, setClientQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // טעינת תור קיים לעריכה
  useEffect(() => {
    if (!editing) return;
    const d = new Date(editing.start);
    // לקוחה שהוזנה ידנית (ללא clientId) — פיצול השם חזרה לשדות פרטי/משפחה
    const isManual = !editing.clientId;
    const parts = (editing.clientName || "").trim().split(/\s+/);
    setForm({
      mode: editing.clientId ? "existing" : "new",
      clientId: editing.clientId || "",
      clientName: editing.clientName || "",
      firstName: isManual ? parts[0] || "" : "",
      lastName: isManual ? parts.slice(1).join(" ") : "",
      phone: editing.phone || "",
      email: editing.email || "",
      treatmentId: editing.treatmentId || "",
      treatmentName: editing.treatmentName || "",
      price: editing.price ?? "",
      date: dateInputValue(d),
      time: formatTime(editing.start),
      durationMin: editing.durationMin || 60,
      sendInvite: !!editing.sendInvite,
      chargeFromPackage: !!editing.clientPackageId,
      clientPackageId: editing.clientPackageId || "",
    });
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function pickClient(c) {
    set({
      mode: "existing",
      clientId: c.id,
      clientName: fullName(c),
      email: c.email || "",
      sendInvite: !!c.emailInvite, // ברירת מחדל מפרופיל הלקוחה
      chargeFromPackage: false,
      clientPackageId: "",
    });
    setClientQuery("");
  }

  function pickTreatment(tid) {
    const t = treatments.find((x) => x.id === tid);
    set({
      treatmentId: tid,
      treatmentName: t?.name || "",
      price: t?.price ?? "",
      durationMin: t?.durationMin || form.durationMin,
      chargeFromPackage: false,
      clientPackageId: "",
    });
  }

  const matchingPackages = useMemo(() => {
    if (form.mode !== "existing" || !form.clientId || !form.treatmentId) return [];
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    return packages.filter(
      (p) =>
        p.clientId === form.clientId &&
        ((p.treatmentIds || []).includes(form.treatmentId) ||
          p.treatmentId === form.treatmentId) &&
        p.status === "active" &&
        (p.remainingSessions ?? 0) > 0 &&
        (!p.expiryDate || new Date(p.expiryDate) >= t0)
    );
  }, [packages, form.mode, form.clientId, form.treatmentId]);

  const start = combine(form.date, form.time);
  const isPast = new Date(start).getTime() < Date.now();

  // אזהרת התנגשות (לא חוסמת) — כוללת תורים ואירועים החוסמים זמן ביומן
  const conflict = useMemo(() => {
    const apptConflict = appts.some(
      (a) =>
        a.id !== id &&
        a.status !== "cancelled" &&
        overlaps(start, form.durationMin, a.start, a.durationMin)
    );
    const eventConflict = events.some((e) =>
      overlaps(start, form.durationMin, e.start, e.durationMin)
    );
    return apptConflict || eventConflict;
  }, [appts, events, start, form.durationMin, id]);

  // אזהרת שעות פעילות (לא חוסמת)
  const hoursWarning = useMemo(() => {
    const wd = weekday(start);
    const day = hoursDoc?.days?.[wd];
    if (!day) return null;
    if (!day.enabled) return `יום ${DAY_NAMES[wd]} מוגדר כסגור.`;
    if (form.time < day.start || form.time > day.end)
      return `מחוץ לשעות הפעילות (${day.start}–${day.end}).`;
    return null;
  }, [hoursDoc, start, form.time]);

  const filteredClients = useMemo(() => {
    const term = clientQuery.trim();
    if (!term) return [];
    return clients
      .filter((c) => !c.archived && fullName(c).includes(term))
      .slice(0, 6);
  }, [clients, clientQuery]);

  const newName = `${form.firstName} ${form.lastName}`.trim();
  const canSave =
    form.treatmentName &&
    ((form.mode === "existing" && form.clientId) ||
      (form.mode === "new" && form.firstName.trim()));

  async function save() {
    setSaving(true);
    const chargingPkg =
      form.mode === "existing" && form.chargeFromPackage && !!form.clientPackageId;
    const payload = {
      clientId: form.mode === "existing" ? form.clientId : null,
      clientName: form.mode === "existing" ? form.clientName.trim() : newName,
      phone: form.mode === "existing" ? "" : (form.phone || ""),
      email: form.email,
      treatmentId: form.treatmentId,
      treatmentName: form.treatmentName,
      price: chargingPkg ? 0 : Number(form.price) || 0,
      start,
      durationMin: Number(form.durationMin) || 0,
      sendInvite: form.sendInvite,
      status: editing?.status || "scheduled",
      clientPackageId: chargingPkg ? form.clientPackageId : null,
    };
      let apptId = id;
      try {
        if (isEdit) await repo.update(id, payload);
        else apptId = await repo.add({ ...payload, inviteSent: false });
      } catch (e) {
        setSaving(false);
        await confirmDialog({
          title: "שגיאה",
          message: "שמירת התור נכשלה: " + (e?.message || e),
          alertOnly: true,
        });
        return;
      }

      if (form.sendInvite)
        navigate(`/appointments/${apptId}/send`, {
          replace: true,
          state: { from: isEdit ? "calendar" : "appointments" },
        });
      else navigate("/calendar", { replace: true });
  }

  if (isEdit && !editing)
    return (
      <>
        <ScreenHeader title="עריכת תור" />
        <div className="empty-state">התור לא נמצא.</div>
      </>
    );

  if (locked)
    return (
      <>
        <ScreenHeader
          title="עריכת תור"
          action={
            <button className="btn btn--ghost" onClick={() => navigate(-1)}>
              חזרה
            </button>
          }
        />
        <div className="notice" style={{ marginTop: 0 }}>
          {editing?.chargedFromPackage
            ? "התור כבר נסגר וחויב מחבילה — עריכת התור נעולה. שינויי מפגשים נעשים דרך עריכת החבילה בכרטיסיית הלקוחה."
            : "התור כבר נסגר (יש הכנסה משויכת) — עריכת התור נעולה. שינויים נעשים דרך עריכת ההכנסה."}
        </div>
      </>
    );

  return (
    <>
      <ScreenHeader
        title={isEdit ? "עריכת תור" : "תיאום תור"}
        action={
          <button className="btn btn--ghost" onClick={() => navigate(isEdit ? -1 : "/calendar")}>
            {isEdit ? "חזרה" : "ליומן"}
          </button>
        }
      />

      {/* בחירת לקוחה */}
      <div className="card">
        <div className="seg">
          <button
            className={"seg__btn" + (form.mode === "existing" ? " on" : "")}
            onClick={() => set({ mode: "existing" })}
          >
            לקוחה קיימת
          </button>
          <button
            className={"seg__btn" + (form.mode === "new" ? " on" : "")}
            onClick={() =>
              set({
                mode: "new",
                clientId: "",
                sendInvite: false,
                chargeFromPackage: false,
                clientPackageId: "",
              })
            }
          >
            לקוחה חדשה
          </button>
        </div>

        {form.mode === "existing" ? (
          <>
            {form.clientId ? (
              <div className="picked">
                <span>
                  <strong>{form.clientName}</strong>
                  {form.email && (
                    <span className="muted" dir="ltr" style={{ marginInlineStart: 8 }}>
                      {form.email}
                    </span>
                  )}
                </span>
                <button
                  className="btn btn--ghost"
                  onClick={() => set({ clientId: "", clientName: "", email: "" })}
                >
                  שינוי
                </button>
              </div>
            ) : (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>חיפוש לקוחה</label>
                <input
                  placeholder="שם הלקוחה"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                {filteredClients.length > 0 && (
                  <div className="suggest">
                    {filteredClients.map((c) => (
                      <button key={c.id} className="suggest__item" onClick={() => pickClient(c)}>
                        {fullName(c)}{" "}
                        {c.phone && <span className="muted" dir="ltr">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="row-2">
              <div className="field">
                <label>שם פרטי</label>
                <input
                  value={form.firstName}
                  onChange={(e) => set({ firstName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>שם משפחה</label>
                <input
                  value={form.lastName}
                  onChange={(e) => set({ lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="row-2" style={{ marginBottom: 0 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>טלפון</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>אימייל (לזימון)</label>
                <input
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* טיפול */}
      <div className="card">
        <div className="field">
          <label>טיפול</label>
          {treatments.length === 0 ? (
            <p className="warn-text" style={{ marginTop: 0 }}>
              אין טיפולים מוגדרים. הוסיפי ברשימת הטיפולים בהגדרות.
            </p>
          ) : (
            <select value={form.treatmentId} onChange={(e) => pickTreatment(e.target.value)}>
              <option value="">— בחרי טיפול —</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>מחיר (₪) — ניתן לעריכה</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </div>
      </div>

      {/* חיוב מחבילה — רק אם יש חבילה פעילה תואמת */}
      {matchingPackages.length > 0 && (
        <div className="card">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={form.chargeFromPackage}
              onChange={(e) =>
                set({
                  chargeFromPackage: e.target.checked,
                  clientPackageId: e.target.checked
                    ? form.clientPackageId || matchingPackages[0].id
                    : "",
                })
              }
            />
            <span>חיוב מחבילה קיימת (לא ייווצר תשלום חדש)</span>
          </label>
          {form.chargeFromPackage && matchingPackages.length > 1 && (
            <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
              <label>בחירת חבילה</label>
              <select
                value={form.clientPackageId}
                onChange={(e) => set({ clientPackageId: e.target.value })}
              >
                {matchingPackages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.seriesName} · נותרו {p.remainingSessions}/{p.totalSessions}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.chargeFromPackage && matchingPackages.length === 1 && (
            <p className="muted" style={{ marginTop: 8 }}>
              {matchingPackages[0].seriesName} · נותרו {matchingPackages[0].remainingSessions}/
              {matchingPackages[0].totalSessions}
            </p>
          )}
        </div>
      )}

      {/* תאריך / שעה / משך — כל אחד בשורה נפרדת */}
      <div className="card">
        <div className="field">
          <label>תאריך</label>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="field">
          <label>שעה</label>
          <TimeField value={form.time} onChange={(time) => set({ time })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>משך (דקות)</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.durationMin}
            onChange={(e) => set({ durationMin: e.target.value })}
          />
        </div>

        {isPast && <p className="warn-text">⚠ מועד התור כבר עבר (ניתן להמשיך).</p>}
        {conflict && <p className="warn-text">⚠ קיים תור או אירוע חופף בזמן זה (ניתן להמשיך).</p>}
        {hoursWarning && <p className="warn-text">⚠ {hoursWarning} (ניתן להמשיך).</p>}
      </div>

      {/* זימון */}
      <label className="inline-check" style={{ padding: "4px 2px" }}>
        <input
          type="checkbox"
          checked={form.sendInvite}
          onChange={(e) => set({ sendInvite: e.target.checked })}
        />
        <span>שליחת זימון במייל ללקוחה</span>
      </label>

      <div className="save-row">
        <button className="btn" disabled={!canSave || saving} onClick={save}>
          {saving ? "שומרת…" : form.sendInvite ? "שמירה והמשך לזימון →" : "שמירת התור"}
        </button>
      </div>
    </>
  );
}
