import { useMemo, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { where } from "firebase/firestore";
import ScreenHeader from "../../components/ScreenHeader";
import PaymentBadge from "../../components/PaymentBadge";
import DateField from "../../components/DateField";
import ClientBasicFields from "./ClientBasicFields";
import DiagnosisSummary from "./DiagnosisSummary";
import ClientAlbum from "./ClientAlbum";
import { useCollectionData, useRepo, useAuditLog } from "../../data";
import { useConfirm } from "../../context/ConfirmDialogProvider";
import { useToast } from "../../context/ToastProvider";
import { formatDate } from "../../utils/datetime";
import { formatILS } from "../../utils/money";
import { clientCancellationStats } from "../../utils/cancellations";
import { whatsappUrl } from "../../utils/invite";
import {
  creditState,
  creditBalance,
  creditLabel,
  CREDIT_STATE_LABEL,
  round2,
  toMillis,
} from "../../utils/credits";
import { useReminderSettings } from "../../data/useReminderSettings";
import { useReferralRewardApproval } from "../../data/useReferralReward";
import { completedReferralCounts, doneClientIds, referralRewardState } from "../../utils/reminders";
import { fullName, ageFromBirthday, normalizePhone, isReferred, normalizeReferral } from "./clientUtils";

const TABS = [
  { key: "details", label: "פרטי לקוחה" },
  { key: "appointments", label: "רשימת תורים" },
  { key: "products", label: "מוצרים" },
  { key: "album", label: "אלבום" },
];

export default function ClientCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { items: clients, loading } = useCollectionData("clients");
  // מסוננת בצד השרת לפי clientId — במקום להוריד את כל קולקציית התורים
  // ולסנן בזיכרון (מיותר משמעותית עם היסטוריית תורים גדולה). ב-Firestore
  // הופך למנוי עצמאי עם where(); במצב מקומי (localStore.js) ה-constraint
  // מתעלם ממנו במכוון וממשיך להחזיר את כל האוסף — הפילטור בזיכרון למטה
  // (AppointmentsTab, ProductsTab דרך useCollectionData("income") נפרד)
  // כבר קיים ומטפל בשני המצבים באופן זהה.
  const { items: appts } = useCollectionData("appointments", where("clientId", "==", id));
  const repo = useRepo("clients");
  const log = useAuditLog();
  const confirmDialog = useConfirm();

  const client = clients.find((c) => c.id === id);
  // תמיכה בקפיצה ישירה לטאב מסוים (למשל מטאב "רכישות"/"מכירות" ברשימות
  // הסדרות/מוצרים, addendum #13/#14) — location.state.tab, ברירת מחדל "details".
  const [tab, setTab] = useState(location.state?.tab || "details");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

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
  // תוקן QA (2026-09): נוסף try/catch. לפני התיקון, כשל רשת/Firestore בעת
  // אישור עריכת לקוחה היה יוצא בשקט — ה-UI פשוט לא היה משתנה, בלי הודעת
  // שגיאה, והמשתמשת לא הייתה יודעת אם העריכה נשמרה או לא. כעת נשארים
  // במצב עריכה (עם ה-draft הקיים) ומוצגת הודעה מפורשת.
  async function confirmEdit() {
    setSaving(true);
    try {
      // normalizeReferral: הלקוחה המפנה נשמרת רק כשמקור ההגעה הוא "המלצה".
      // מנקה גם הפניה "יתומה" שנשארה מלפני התיקון (ראו clientUtils.js).
      const cleaned = normalizeReferral(draft);
      await repo.update(id, cleaned);
      await log({
        action: "client_edit",
        entity: { type: "client", id, desc: fullName(cleaned) },
      });
      setEditing(false);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "שמירת פרטי הלקוחה נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    } finally {
      setSaving(false);
    }
  }
  // תוקן QA (2026-09): נוסף try/catch. לפני התיקון, כשל בהעברה לארכיון היה
  // עלול לנווט בחזרה למסך הלקוחות (navigate("/clients")) גם אם הכתיבה
  // בפועל נכשלה — נותן רושם שגוי שהפעולה הצליחה.
  async function archive() {
    const ok = await confirmDialog({
      title: "שליחה לארכיון",
      message: "להעביר את הלקוחה לארכיון? היסטוריית התורים תישמר.",
      confirmLabel: "העברה לארכיון",
      danger: true,
    });
    if (!ok) return;
    try {
      await repo.update(id, { archived: true });
      await log({
        action: "client_archive",
        entity: { type: "client", id, desc: fullName(client) },
      });
      navigate("/clients");
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "העברה לארכיון נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    }
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
          clients={clients}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          duplicatePhone={duplicatePhone}
          saving={saving}
          onStartEdit={startEdit}
          onCancel={() => setEditing(false)}
          onConfirm={confirmEdit}
          onArchive={archive}
          id={id}
        />
      )}

      {tab === "appointments" && (
        <AppointmentsTab appts={appts} clientId={id} clientName={fullName(client)} />
      )}

      {tab === "products" && <ProductsTab clientId={id} />}

      {tab === "album" && <ClientAlbum clientId={id} clientName={fullName(client)} />}
    </>
  );
}

function DetailsTab({
  client,
  clients,
  editing,
  draft,
  setDraft,
  duplicatePhone,
  saving,
  onStartEdit,
  onCancel,
  onConfirm,
  onArchive,
  id,
}) {
  // Phase 4 §6 — "הופנתה ע״י": שם הלקוחה המפנה (אם קיים), ו"לקוחות שהופנו
  // ע״י לקוחה זו" (חיפוש הפוך: מי מצביע אליה דרך referredByClientId).
  // הפניה נחשבת רק כשמקור ההגעה הוא "המלצה" (isReferred) — כך הפניה "יתומה"
  // שנשארה על רשומה ישנה לא מוצגת ולא נספרת.
  const referrer = useMemo(
    () => (isReferred(client) ? clients.find((c) => c.id === client.referredByClientId) : null),
    [clients, client]
  );
  const referredClients = useMemo(
    () => clients.filter((c) => isReferred(c) && c.referredByClientId === id && !c.archived),
    [clients, id]
  );

  // תגמול הפניות: הספירה דורשת את תורי כל הלקוחות שהופנו (לא רק של הלקוחה
  // הזו), ולכן שולפים את כל ה-appointments. הם כבר נטענים ממילא במאגר
  // המשותף (BottomNav), כך שאין מנוי Firestore נוסף. הקריאה חייבת להיות
  // לפני ה-early-return של מצב העריכה (סדר hooks קבוע).
  const { items: allAppts } = useCollectionData("appointments");
  const { data: reminders } = useReminderSettings();
  const approveReward = useReferralRewardApproval();
  const doneIds = useMemo(() => doneClientIds(allAppts), [allAppts]);
  const completedCount = useMemo(
    () => completedReferralCounts(clients, allAppts).get(id) || 0,
    [clients, allAppts, id]
  );
  const reward = referralRewardState(client, completedCount, reminders.referralRewardThreshold);

  if (editing) {
    return (
      <>
        <ClientBasicFields
          value={draft}
          onChange={setDraft}
          duplicatePhone={duplicatePhone}
          clients={clients}
          excludeClientId={id}
        />
        <div className="save-row">
          <button className="btn btn--muted" onClick={onCancel}>
            ביטול
          </button>
          <button className="btn" disabled={saving} onClick={onConfirm}>
            {saving ? "שומרת…" : "אישור שמירה"}
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
        {/* Phase 4 §7 — כפתור "שליחת הודעה בוואטסאפ" לצד שדה הטלפון: שיחה
            חופשית (whatsappUrl בלי טקסט), נפרד מהזימון המובנה עם קישור-ליומן
            שנשלח דרך מסך "שליחת זימון" (SendInvite.jsx). */}
        <div className="read-row">
          <span className="muted">טלפון</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span dir="ltr" className="sensitive">{client.phone || "—"}</span>
            {client.phone && (
              <a
                className="btn btn--ghost btn--sm"
                href={whatsappUrl(client.phone)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                💬 וואטסאפ
              </a>
            )}
          </span>
        </div>
        <ReadRow label="אימייל" value={client.email || "—"} ltr sensitive />
        <ReadRow
          label="זימון במייל"
          value={client.emailInvite ? "מעוניינת" : "לא מעוניינת"}
        />
        <ReadRow
          label="זימון בוואטסאפ"
          value={client.whatsappInvite ? "מעוניינת" : "לא מעוניינת"}
        />
        <ReadRow
          label="תאריך לידה"
          value={client.birthday ? `${client.birthday}${age != null ? ` · גיל ${age}` : ""}` : "—"}
        />
        <ReadRow label="מקור הגעה" value={client.source || "—"} />
        {isReferred(client) && (
          <div className="read-row">
            <span className="muted">הופנתה ע״י</span>
            {referrer ? (
              <Link to={`/clients/${referrer.id}`}>{fullName(referrer)} ‹</Link>
            ) : (
              <span className="muted">— לקוחה לא נמצאה —</span>
            )}
          </div>
        )}
        {client.notes && (
          <div className="read-row read-row--col">
            <span className="muted">הערות פנימיות חסויות</span>
            <span className="sensitive" style={{ whiteSpace: "pre-wrap" }}>{client.notes}</span>
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

      {referredClients.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>לקוחות שהופנו ע״י לקוחה זו ({referredClients.length})</h3>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
            הפניות שהושלמו: {completedCount} · מתנות שניתנו: {reward.given}
            {reminders.referralRewardThreshold > 0 &&
              ` · סף לתגמול: ${reminders.referralRewardThreshold}`}
          </p>
          {reward.pending > 0 && (
            <div
              className="notice"
              style={{
                marginTop: 0,
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span>🎁 זכאית לתגמול הפניות{reward.pending > 1 ? ` (${reward.pending} מתנות)` : ""}</span>
              <button className="btn btn--sm" onClick={() => approveReward(client)}>
                אישור מתנה
              </button>
            </div>
          )}
          <div className="list">
            {referredClients.map((c) => (
              <Link key={c.id} to={`/clients/${c.id}`} className="card list-item">
                <div className="list-item__main">
                  <strong>{fullName(c)}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {doneIds.has(c.id) ? "השלימה טיפול · נספרת" : "טרם השלימה טיפול · לא נספרת"}
                  </span>
                </div>
                <span className="nav-card__chev">‹</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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

function AppointmentsTab({ appts, clientId, clientName }) {
  const { items: packages } = useCollectionData("clientPackages");
  const { items: income } = useCollectionData("income");

  // מיפוי מזהה-הכנסה → רשומת הכנסה, כדי לדעת אם תור/רכישת סדרה באמת סומנו
  // "שולם" בפועל (addendum #5) — אותו דפוס בדיוק כמו incomeById ב-Calendar.jsx.
  const incomeById = useMemo(() => {
    const map = {};
    for (const r of income) map[r.id] = r;
    return map;
  }, [income]);

  // Phase 4 §5 — מעקב ביטולים: מחושב מתוך appts הגולמי (כולל תורים
  // מבוטלים), לפני הסינון של status!=="cancelled" למטה — אחרת אין דרך
  // לספור אותם.
  const cancelStats = useMemo(() => clientCancellationStats(appts, clientId), [appts, clientId]);

  // appts כבר מגיע מסונן לפי clientId מ-Firestore (where clientId==clientId);
  // עדיין מסננים כאן status!=="cancelled" בזיכרון — תור שבוטל ביומן נשאר
  // ברשומות (לצורך היסטוריה/דוחות) אך מסומן status:"cancelled" ואינו נמחק,
  // בדיוק כפי שהיומן (Calendar.jsx) עושה, אחרת תור מבוטל "נדבק" לרשימת
  // התורים של הלקוחה לנצח.
  const mine = appts.filter((a) => a.clientId === clientId && a.status !== "cancelled");
  const now = Date.now();
  const past = mine
    .filter((a) => new Date(a.start).getTime() < now)
    .sort((a, b) => new Date(b.start) - new Date(a.start));
  const future = mine
    .filter((a) => new Date(a.start).getTime() >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const myPackages = packages.filter((p) => p.clientId === clientId);

  // "תשלומים נוספים": הכנסות ידניות (IncomeForm) והכנסות מרכישת שובר מתנה
  // (VoucherPurchase — הקונה היא clientId של ההכנסה) שמקושרות ללקוחה דרך
  // clientId. שאר סוגי ההכנסה כבר מוצגים במקומם — תור שנסגר בתורי העבר,
  // רכישת סדרה בפס החבילות, מכירת מוצר בטאב "מוצרים" — ולכן לא נכללים כאן.
  // (D-4: הסינון הורחב ל-"voucher".)
  const extraPayments = income
    .filter((r) => (r.source === "manual" || r.source === "voucher") && r.clientId === clientId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <>
      <CreditsSection clientId={clientId} clientName={clientName} />

      <PackagesSection packages={myPackages} incomeById={incomeById} />

      {cancelStats.cancelledCount > 0 && (
        <div className="notice" style={{ marginTop: 0 }}>
          ביטולים: {cancelStats.cancelledCount} מתוך {cancelStats.totalAppointments} תורים (
          {cancelStats.cancellationRate}%)
          {cancelStats.noShow > 0 && ` · לא הגיעה: ${cancelStats.noShow}`}
        </div>
      )}

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
        <ApptList list={past} incomeById={incomeById} showStatus />
      )}

      {extraPayments.length > 0 && (
        <>
          <h3 className="group-title">תשלומים נוספים</h3>
          <div className="list">
            {extraPayments.map((r) => (
              <div key={r.id} className="card list-item">
                <div className="list-item__main">
                  <strong>
                    {r.treatmentName || r.note || "תשלום"} <PaymentBadge income={r} />
                  </strong>
                  <span className="muted">
                    {formatDate(r.date)} · <span className="sensitive">{formatILS(r.amount)}</span>
                    {r.source === "voucher" && r.giftToName ? ` · ל${r.giftToName}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// טאב "מוצרים" בכרטיסיית לקוחה (addendum #15). מקור: רשומות income עם
// source:"product" ו-clientId תואם. שים לב: ProductSell.jsx עודכן כדי
// לשמור clientId על ההכנסה (בעבר נשמר רק clientName) — בלעדיו לא ניתן היה
// לשייך מכירות מוצר ללקוחה באופן אמין.
function ProductsTab({ clientId }) {
  const { items: income, loading } = useCollectionData("income");
  const mine = income
    .filter((r) => r.source === "product" && r.clientId === clientId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (loading) return <p className="muted">טוען…</p>;
  if (mine.length === 0)
    return (
      <div className="empty-state" style={{ padding: 16 }}>
        עדיין לא נמכרו מוצרים ללקוחה זו.
      </div>
    );

  return (
    <div className="list">
      {mine.map((r) => (
        <div key={r.id} className="card list-item">
          <div className="list-item__main">
            <strong>
              {r.treatmentName || "מוצר"} <PaymentBadge income={r} />
            </strong>
            <span className="muted">
              {formatDate(r.date)} · {formatILS(r.amount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function packageState(p) {
  if (p.status !== "active" || (p.remainingSessions ?? 0) <= 0) return "נוצלה";
  if (p.expiryDate && new Date(p.expiryDate) < new Date(new Date().toDateString())) return "פקעה";
  return "פעילה";
}

// ---------- יתרת זיכוי (addendum שוברים/זיכוי, C-1..C-8) ----------
// אזור "יתרת זיכוי" בטאב "רשימת תורים", מעל פס החבילות: סה"כ יתרה זמינה,
// רשימת היתרות (שוברי מתנה שהתקבלו + זיכויים רגילים), הוספת זיכוי ידני
// (ללא הכנסה — הכסף כבר נרשם קודם), ועריכה/מחיקה (CRUD). האזור מוצג תמיד
// (בקומפקטיות כשאין יתרות), כי הוא נקודת הכניסה היחידה ליצירת זיכוי רגיל.
// כל הסכומים מסומנים .sensitive (מצב קליניקה).
const CREDIT_STATE_ORDER = { active: 0, expired: 1, used: 2 };

function CreditsSection({ clientId, clientName }) {
  const { items: allCredits } = useCollectionData("credits");
  const repo = useRepo("credits");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ amount: "", reason: "", expiryDate: "" });
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  // יתרות שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const thisYear = new Date().getFullYear();

  const mine = useMemo(
    () =>
      allCredits
        .filter((c) => c.clientId === clientId && !hiddenIds.has(c.id))
        .sort((a, b) => {
          const sa = CREDIT_STATE_ORDER[creditState(a)];
          const sb = CREDIT_STATE_ORDER[creditState(b)];
          if (sa !== sb) return sa - sb;
          return toMillis(b.createdAt) - toMillis(a.createdAt);
        }),
    [allCredits, clientId, hiddenIds]
  );
  const balance = creditBalance(mine, clientId);

  // כשל בכתיבת הלוג אחרי שהפעולה עצמה הצליחה לא אמור להציג "הפעולה נכשלה".
  async function safeLog(entry) {
    try {
      await log(entry);
    } catch (e) {
      console.error("[audit] failed", e);
    }
  }

  async function addCredit() {
    const amount = round2(Math.max(0, Number(draft.amount) || 0));
    if (amount <= 0) return;
    setSaving(true);
    try {
      const reason = draft.reason.trim();
      const newId = await repo.add({
        clientId,
        clientName,
        amount,
        remaining: amount,
        source: "refund",
        giftFromClientId: null,
        giftFromName: null,
        voucherId: null,
        voucherName: null,
        expiryDate: draft.expiryDate || null,
        incomeId: null,
        reason,
        status: "active",
      });
      await safeLog({
        action: "credit_create",
        entity: { type: "credit", id: newId, desc: `${clientName} — זיכוי${reason ? ` · ${reason}` : ""}` },
        after: { amount, expiryDate: draft.expiryDate || null },
      });
      setDraft({ amount: "", reason: "", expiryDate: "" });
      setAdding(false);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "הוספת הזיכוי נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c) {
    setEditId(c.id);
    setEditDraft({
      remaining: c.remaining ?? 0,
      expiryDate: c.expiryDate || "",
      status: c.status || "active",
    });
  }

  async function saveEdit(c) {
    // remaining נעצר בין 0 לסכום המקורי (0 ≤ remaining ≤ amount).
    const remaining = Math.min(
      round2(Math.max(0, Number(editDraft.remaining) || 0)),
      round2(c.amount)
    );
    const patch = {
      remaining,
      expiryDate: editDraft.expiryDate || null,
      status: remaining <= 0 ? "used" : editDraft.status,
    };
    setSaving(true);
    try {
      await repo.update(c.id, patch);
      await safeLog({
        action: "credit_edit",
        entity: { type: "credit", id: c.id, desc: `${clientName} — ${creditLabel(c)}` },
        before: { remaining: c.remaining, expiryDate: c.expiryDate || null, status: c.status },
        after: patch,
      });
      setEditId(null);
      setEditDraft(null);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "עדכון הזיכוי נכשל: " + (e?.message || e),
        alertOnly: true,
      });
    } finally {
      setSaving(false);
    }
  }

  // מחיקת יתרה אינה פוגעת בהכנסה של הקונה (C-6). Undo ל-5 שניות.
  async function remove(c) {
    const ok = await confirmDialog({
      title: "מחיקת יתרת זיכוי",
      message: `למחוק את היתרה (${creditLabel(c)})? ההכנסה מהרכישה, אם קיימת, לא תיפגע.`,
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(c.id));
    toast.showUndo({
      message: "יתרת הזיכוי נמחקה",
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(c.id);
          return next;
        }),
      onExpire: async () => {
        try {
          await repo.remove(c.id);
          await safeLog({
            action: "credit_delete",
            entity: { type: "credit", id: c.id, desc: `${clientName} — ${creditLabel(c)}` },
            before: { amount: c.amount, remaining: c.remaining },
          });
        } catch (e) {
          console.error("[CreditsSection] delete failed", e);
        }
      },
    });
  }

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div className="card-head" style={{ marginBottom: mine.length > 0 || adding ? 8 : 0 }}>
        <h3>יתרת זיכוי</h3>
        <strong className="sensitive">{formatILS(balance)}</strong>
      </div>

      {mine.map((c) => {
        const st = creditState(c);
        if (editId === c.id) {
          return (
            <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <strong>{creditLabel(c)}</strong>
              <div className="row-2" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>יתרה (מתוך {formatILS(c.amount)})</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={editDraft.remaining}
                    onChange={(e) => setEditDraft({ ...editDraft, remaining: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>סטטוס</label>
                  <select
                    value={editDraft.status}
                    onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value })}
                  >
                    <option value="active">פעיל</option>
                    <option value="used">נוצל</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>בתוקף עד (ריק = ללא תוקף)</label>
                <DateField
                  value={editDraft.expiryDate}
                  onChange={(v) => setEditDraft({ ...editDraft, expiryDate: v })}
                  fromYear={thisYear - 5}
                  toYear={thisYear + 10}
                />
                {editDraft.expiryDate && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    style={{ marginTop: 8 }}
                    onClick={() => setEditDraft({ ...editDraft, expiryDate: "" })}
                  >
                    נקה תאריך
                  </button>
                )}
              </div>
              <div className="save-row" style={{ marginTop: 0 }}>
                <button className="btn btn--muted" onClick={() => setEditId(null)}>
                  ביטול
                </button>
                <button className="btn" disabled={saving} onClick={() => saveEdit(c)}>
                  שמירה
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={c.id} className="read-row" style={{ alignItems: "center" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>
                {creditLabel(c)}{" "}
                <span className={"badge " + (st === "active" ? "badge--ok" : "badge--info")}>
                  {CREDIT_STATE_LABEL[st]}
                </span>
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                <span className="sensitive">
                  {formatILS(c.remaining)}/{formatILS(c.amount)}
                </span>
                {c.expiryDate ? ` · בתוקף עד ${c.expiryDate}` : ""}
                {c.reason ? ` · ${c.reason}` : ""}
              </span>
            </span>
            <span className="list-item__actions">
              <button className="btn btn--ghost" onClick={() => startEdit(c)}>
                עריכה
              </button>
              <button className="btn btn--muted" onClick={() => remove(c)}>
                מחיקה
              </button>
            </span>
          </div>
        );
      })}

      {adding ? (
        <div style={{ marginTop: 12 }}>
          <div className="row-2">
            <div className="field">
              <label>סכום (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </div>
            <div className="field">
              <label>סיבה</label>
              <input
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>בתוקף עד (אופציונלי — ריק = ללא תוקף)</label>
            <DateField
              value={draft.expiryDate}
              onChange={(v) => setDraft({ ...draft, expiryDate: v })}
              fromYear={thisYear}
              toYear={thisYear + 10}
            />
            {draft.expiryDate && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ marginTop: 8 }}
                onClick={() => setDraft({ ...draft, expiryDate: "" })}
              >
                נקה תאריך
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
            זיכוי אינו יוצר הכנסה — הוא מקוזז מתשלום עתידי של הלקוחה.
          </p>
          <div className="save-row" style={{ marginTop: 0 }}>
            <button
              className="btn btn--muted"
              onClick={() => {
                setAdding(false);
                setDraft({ amount: "", reason: "", expiryDate: "" });
              }}
            >
              ביטול
            </button>
            <button
              className="btn"
              disabled={saving || !(Number(draft.amount) > 0)}
              onClick={addCredit}
            >
              {saving ? "שומרת…" : "הוספת זיכוי"}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn--ghost btn--sm"
          style={{ marginTop: mine.length > 0 ? 12 : 8 }}
          onClick={() => setAdding(true)}
        >
          + הוספת זיכוי
        </button>
      )}
    </div>
  );
}

function PackagesSection({ packages, incomeById }) {
  const repo = useRepo("clientPackages");
  const log = useAuditLog();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  // חבילות שנמחקו אופטימית ל-Undo (ראו ToastProvider).
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const visiblePackages = packages.filter((p) => !hiddenIds.has(p.id));

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
    try {
      await repo.update(p.id, patch);
      await log({
        action: "package_edit",
        entity: { type: "clientPackage", id: p.id, desc: `${p.clientName} — ${p.seriesName}` },
        before: { remainingSessions: p.remainingSessions, expiryDate: p.expiryDate || null, status: p.status },
        after: patch,
      });
      setEditId(null);
      setDraft(null);
    } catch (e) {
      await confirmDialog({
        title: "שגיאה",
        message: "עדכון החבילה נכשל: " + (e?.message || e),
        alertOnly: true,
      });
    }
  }
  async function remove(p) {
    const ok = await confirmDialog({
      title: "מחיקת חבילה",
      message: `למחוק את החבילה "${p.seriesName}"? ההכנסה מהרכישה לא תיפגע.`,
      confirmLabel: "מחיקה",
      danger: true,
    });
    if (!ok) return;
    setHiddenIds((prev) => new Set(prev).add(p.id));
    toast.showUndo({
      message: `החבילה "${p.seriesName}" נמחקה`,
      onUndo: () =>
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        }),
      onExpire: async () => {
        await repo.remove(p.id);
        await log({
          action: "package_delete",
          entity: { type: "clientPackage", id: p.id, desc: `${p.clientName} — ${p.seriesName}` },
        });
      },
    });
  }

  if (visiblePackages.length === 0) {
    return (
      <div className="packages-band">
        <span className="muted">חבילות/סדרות</span>
        <span className="muted" style={{ fontSize: 13 }}>אין חבילות</span>
      </div>
    );
  }

  return (
    <div className="list" style={{ marginBottom: 8 }}>
      {visiblePackages.map((p) => {
        const inc = p.incomeId ? incomeById[p.incomeId] : null;
        return editId === p.id ? (
          <div key={p.id} className="card list-item--edit">
            <strong>{p.seriesName}</strong>
            <div className="row-2" style={{ marginTop: 8 }}>
              <div className="field">
                <label>מפגשים שנותרו (מתוך {p.totalSessions})</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
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
              <strong>
                {p.seriesName} <span className="badge badge--info">{packageState(p)}</span>{" "}
                <PaymentBadge income={inc} />
              </strong>
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
        );
      })}
    </div>
  );
}

// רשימת תורים בכרטיסיית לקוחה. showStatus=true (תורי עבר בלבד, addendum #5)
// מוסיף תגית סטטוס/תשלום זהה ברוחה ל-ItemRow שב-Calendar.jsx: "מחבילה" לתור
// שנסגר בפועל דרך חבילה, "שולם מיתרה" לתור שכוסה במלואו מיתרת זיכוי (D-2),
// PaymentBadge לתור רגיל שנסגר, או "ממתין לסגירה" (לחיץ → מסך אישור ביצוע)
// לתור שמועדו עבר וטרם נסגר. תורים עתידיים (showStatus כברירת מחדל false)
// נשארים ללא שינוי — כולל תגית "מחבילה" הישנה המבוססת על clientPackageId
// (כוונת חיוב, לא חיוב בפועל).
function ApptList({ list, incomeById = {}, showStatus = false }) {
  const navigate = useNavigate();
  return (
    <div className="list">
      {list.map((a) => {
        const isDone = a.status === "done";
        const linkedIncome = a.incomeId ? incomeById[a.incomeId] : null;

        return (
          <div key={a.id} className="card list-item">
            <div className="list-item__main">
              <strong>
                {a.treatmentName || "טיפול"}{" "}
                {!showStatus && a.clientPackageId && (
                  <span className="badge badge--info">מחבילה</span>
                )}
                {showStatus &&
                  (a.chargedFromPackage ? (
                    <span className="badge badge--info">מחבילה</span>
                  ) : a.chargedFromCredit ? (
                    <span className="badge badge--ok">שולם מיתרה</span>
                  ) : isDone ? (
                    <PaymentBadge income={linkedIncome} />
                  ) : (
                    <button
                      type="button"
                      className="badge badge--pending badge--btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/appointments/${a.id}/close`, { state: { from: "clientCard" } });
                      }}
                    >
                      ממתין לסגירה
                    </button>
                  ))}
              </strong>
              <span className="muted">{new Date(a.start).toLocaleString("he-IL")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReadRow({ label, value, ltr, sensitive }) {
  return (
    <div className="read-row">
      <span className="muted">{label}</span>
      <span dir={ltr ? "ltr" : undefined} className={sensitive ? "sensitive" : undefined}>
        {value}
      </span>
    </div>
  );
}
