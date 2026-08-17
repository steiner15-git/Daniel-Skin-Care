import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import TimeField from "../../components/TimeField";
import { useCollectionData, useRepo } from "../../data";
import { combine, formatTime } from "../../utils/datetime";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function minutesBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export default function EventForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { items: events } = useCollectionData("events");
  const repo = useRepo("events");
  const editing = isEdit ? events.find((e) => e.id === id) : null;

  const [form, setForm] = useState({
    title: "",
    date: todayInput(),
    startTime: "10:00",
    endTime: "11:00",
    note: "",
  });

  useEffect(() => {
    if (!editing) return;
    const d = new Date(editing.start);
    const startTime = formatTime(editing.start);
    const end = new Date(d.getTime() + (editing.durationMin || 60) * 60000);
    setForm({
      title: editing.title || "",
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`,
      startTime,
      endTime: `${String(end.getHours()).padStart(2, "0")}:${String(
        end.getMinutes()
      ).padStart(2, "0")}`,
      note: editing.note || "",
    });
  }, [editing?.id]);

  function set(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  const duration = minutesBetween(form.startTime, form.endTime);
  const invalidRange = duration <= 0;

  async function save() {
    const payload = {
      title: form.title.trim(),
      start: combine(form.date, form.startTime),
      durationMin: duration,
      note: form.note.trim(),
    };
    if (isEdit) await repo.update(id, payload);
    else await repo.add(payload);
    navigate("/calendar", { replace: true });
  }

  return (
    <>
      <ScreenHeader
        title={isEdit ? "עריכת אירוע" : "אירוע חדש"}
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/calendar")}>
            ליומן
          </button>
        }
      />

      <div className="notice" style={{ marginTop: 0 }}>
        אירוע תופס מקום ביומן אך אינו תור ואינו יוצר הכנסה (למשל חסימת זמן אישי).
      </div>

      <div className="card">
        <div className="field">
          <label>כותרת</label>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="field">
          <label>תאריך</label>
          <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="row-2">
          <div className="field">
            <label>שעת התחלה</label>
            <TimeField value={form.startTime} onChange={(t) => set({ startTime: t })} />
          </div>
          <div className="field">
            <label>שעת סיום</label>
            <TimeField value={form.endTime} onChange={(t) => set({ endTime: t })} />
          </div>
        </div>
        {invalidRange && (
          <p className="warn-text" style={{ marginTop: 0 }}>
            ⚠ שעת הסיום צריכה להיות אחרי שעת ההתחלה.
          </p>
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>הערה</label>
          <textarea rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} />
        </div>
      </div>

      <div className="save-row">
        <button className="btn" disabled={!form.title.trim() || invalidRange} onClick={save}>
          {isEdit ? "אישור שמירה" : "הוספת אירוע"}
        </button>
      </div>
    </>
  );
}
