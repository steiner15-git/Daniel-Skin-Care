import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import ClientBasicFields from "./ClientBasicFields";
import DiagnosisSummary from "./DiagnosisSummary";
import ClientAlbum from "./ClientAlbum";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { fullName, ageFromBirthday, normalizePhone } from "./clientUtils";

const TABS = [
  { key: "details", label: "פרטי לקוחה" },
  { key: "appointments", label: "רשימת תורים" },
  { key: "album", label: "אלבום" },
];

export default function ClientCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { items: clients, loading } = useCollectionData("clients");
  const { items: appts } = useCollectionData("appointments");
  const repo = useRepo("clients");
  const log = useAuditLog();

  const client = clients.find((c) => c.id === id);
  const [tab, setTab] = useState("details");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const duplicatePhone = useMemo(() => {
    if (!editing || !draft) return false;
    const p = normalizePhone(draft.phone);
    if (!p) return false;
    return clients.some((c) => c.id !== id && normalizePhone(c.phone) === p);
  }, [editing, draft, clients, id]);

  if (loading) return <p className="muted">טוען…</p>;
  if (!client)
    return (
      <>
        <ScreenHeader title="לקוחה" />
        <div className="empty-state">הלקוחה לא נמצאה.</div>
      </>
    );

  function startEdit() {
    setDraft({ ...client });
    setEditing(true);
  }
  async function confirmEdit() {
    await repo.update(id, draft);
    await log({
      action: "client_edit",
      entity: { type: "client", id, desc: fullName(draft) },
    });
    setEditing(false);
  }
  async function archive() {
    if (!confirm("להעביר את הלקוחה לארכיון? היסטוריית התורים תישמר.")) return;
    await repo.update(id, { archived: true });
    await log({
      action: "client_archive",
      entity: { type: "client", id, desc: fullName(client) },
    });
    navigate("/clients");
  }

  return (
    <>
      <ScreenHeader
        title={fullName(client)}
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/clients")}>
            חזרה
          </button>
        }
      />

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={"tab" + (tab === t.key ? " tab--on" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <DetailsTab
          client={client}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          duplicatePhone={duplicatePhone}
          onStartEdit={startEdit}
          onCancel={() => setEditing(false)}
          onConfirm={confirmEdit}
          onArchive={archive}
          id={id}
        />
      )}

      {tab === "appointments" && <AppointmentsTab appts={appts} clientId={id} />}

      {tab === "album" && <ClientAlbum clientId={id} clientName={fullName(client)} />}
    </>
  );
}

function DetailsTab({
  client,
  editing,
  draft,
  setDraft,
  duplicatePhone,
  onStartEdit,
  onCancel,
  onConfirm,
  onArchive,
  id,
}) {
  if (editing) {
    return (
      <>
        <ClientBasicFields value={draft} onChange={setDraft} duplicatePhone={duplicatePhone} />
        <div className="save-row">
          <button className="btn btn--muted" onClick={onCancel}>
            ביטול
          </button>
          <button className="btn" onClick={onConfirm}>
            אישור שמירה
          </button>
        </div>
      </>
    );
  }

  const age = ageFromBirthday(client.birthday);
  return (
    <>
      <div className="card">
        <ReadRow label="שם" value={fullName(client)} />
        <ReadRow label="טלפון" value={client.phone || "—"} ltr />
        <ReadRow label="אימייל" value={client.email || "—"} ltr />
        <ReadRow
          label="זימון במייל"
          value={client.emailInvite ? "מעוניינת" : "לא מעוניינת"}
        />
        <ReadRow
          label="תאריך לידה"
          value={client.birthday ? `${client.birthday}${age != null ? ` · גיל ${age}` : ""}` : "—"}
        />
        <ReadRow label="מקור הגעה" value={client.source || "—"} />
        {client.notes && (
          <div className="read-row read-row--col">
            <span className="muted">הערות פנימיות חסויות</span>
            <span style={{ whiteSpace: "pre-wrap" }}>{client.notes}</span>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>אבחון עור</h3>
          <Link to={`/clients/${id}/diagnosis`} className="link-action">
            עריכה מלאה ‹
          </Link>
        </div>
        <DiagnosisSummary value={client.diagnosis || {}} />
      </div>

      <div className="save-row" style={{ marginTop: 16 }}>
        <button className="btn btn--muted" onClick={onArchive}>
          שליחה לארכיון
        </button>
        <button className="btn" onClick={onStartEdit}>
          עריכה
        </button>
      </div>
    </>
  );
}

function AppointmentsTab({ appts, clientId }) {
  const { items: packages } = useCollectionData("clientPackages");
  // תור שבוטל ביומן נשאר ברשומות (לצורך היסטוריה/דוחות) אך מסומן status:
  // "cancelled" ואינו נמחק — לכן יש לסנן אותו כאן בדיוק כפי שהיומן (Calendar.jsx)
  // עושה, אחרת תור מבוטל "נדבק" לרשימת התורים של הלקוחה לנצח.
  const mine = appts.filter((a) => a.clientId === clientId && a.status !== "cancelled");
  const now = Date.now();
  const past = mine
    .filter((a) => new Date(a.start).getTime() < now)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const future = mine
    .filter((a) => new Date(a.start).getTime() >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const myPackages = packages.filter((p) => p.clientId === clientId);

  return (
    <>
      <PackagesSection packages={myPackages} />

      <h3 className="group-title">תורים עתידיים</h3>
      {future.length === 0 ? (
        <div className="empty-state" style={{ padding: "16px" }}>אין תורים עתידיים.</div>
      ) : (
        <ApptList list={future} />
      )}

      <h3 className="group-title">תורי עבר</h3>
      {past.length === 0 ? (
        <div className="empty-state" style={{ padding: "16px" }}>אין תורי עבר.</div>
      ) : (
        <ApptList list={past} />
      )}
    </>
  );
}

function packageState(p) {
  if (p.status !== "active" || (p.remainingSessions ?? 0) <= 0) return "נוצלה";
  if (p.expiryDate && new Date(p.expiryDate) < new Date(new Date().toDateString())) return "פקעה";
  return "פעילה";
}

function PackagesSection({ packages }) {
  const repo = useRepo("clientPackages");
  const log = useAuditLog();
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  function startEdit(p) {
    setEditId(p.id);
    setDraft({
      remainingSessions: p.remainingSessions ?? 0,
      expiryDate: p.expiryDate || "",
      status: p.status || "active",
    });
  }
  async function saveEdit(p) {
    const remainingSessions = Math.max(0, Number(draft.remainingSessions) || 0);
    const patch = {
      remainingSessions,
      expiryDate: draft.expiryDate || null,
      status: draft.status,
    };
    await repo.update(p.id, patch);
    await log({
      action: "package_edit",
      entity: { type: "clientPackage", id: p.id, desc: `${p.clientName} — ${p.seriesName}` },
      before: { remainingSessions: p.remainingSessions, expiryDate: p.expiryDate || null, status: p.status },
      after: patch,
    });
    setEditId(null);
    setDraft(null);
  }
  async function remove(p) {
    if (!confirm(`למחוק את החבילה "${p.seriesName}"? ההכנסה מהרכישה לא תיפגע.`)) return;
    await repo.remove(p.id);
    await log({
      action: "package_delete",
      entity: { type: "clientPackage", id: p.id, desc: `${p.clientName} — ${p.seriesName}` },
    });
  }

  if (packages.length === 0) {
    return (
      <div className="packages-band">
        <span className="muted">חבילות/סדרות</span>
        <span className="muted" style={{ fontSize: 13 }}>אין חבילות</span>
      </div>
    );
  }

  return (
    <div className="list" style={{ marginBottom: 8 }}>
      {packages.map((p) =>
        editId === p.id ? (
          <div key={p.id} className="card list-item--edit">
            <strong>{p.seriesName}</strong>
            <div className="row-2" style={{ marginTop: 8 }}>
              <div className="field">
                <label>מפגשים שנותרו (מתוך {p.totalSessions})</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={draft.remainingSessions}
                  onChange={(e) => setDraft({ ...draft, remainingSessions: e.target.value })}
                />
              </div>
              <div className="field">
                <label>בתוקף עד</label>
                <input
                  type="date"
                  value={draft.expiryDate}
                  onChange={(e) => setDraft({ ...draft, expiryDate: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>סטטוס</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="active">פעילה</option>
                <option value="used">נוצלה</option>
              </select>
            </div>
            <div className="save-row">
              <button className="btn btn--muted" onClick={() => setEditId(null)}>ביטול</button>
              <button className="btn" onClick={() => saveEdit(p)}>שמירה</button>
            </div>
          </div>
        ) : (
          <div key={p.id} className="card list-item">
            <div className="list-item__main">
              <strong>{p.seriesName} <span className="badge badge--info">{packageState(p)}</span></strong>
              <span className="muted" style={{ fontSize: 13 }}>
                נותרו {p.remainingSessions}/{p.totalSessions}
                {p.expiryDate ? ` · בתוקף עד ${p.expiryDate}` : ""}
              </span>
            </div>
            <div className="list-item__actions">
              <button className="btn btn--ghost" onClick={() => startEdit(p)}>עריכה</button>
              <button className="btn btn--muted" onClick={() => remove(p)}>מחיקה</button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function ApptList({ list }) {
  return (
    <div className="list">
      {list.map((a) => (
        <div key={a.id} className="card list-item">
          <div className="list-item__main">
            <strong>
              {a.treatmentName || "טיפול"}{" "}
              {a.clientPackageId && <span className="badge badge--info">מחבילה</span>}
            </strong>
            <span className="muted">{new Date(a.start).toLocaleString("he-IL")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadRow({ label, value, ltr }) {
  return (
    <div className="read-row">
      <span className="muted">{label}</span>
      <span dir={ltr ? "ltr" : undefined}>{value}</span>
    </div>
  );
}
