import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { SkeletonRows } from "../../components/Skeleton";
import { useCollectionData } from "../../data";
import { useReminderSettings } from "../../data/useReminderSettings";
import { useReferralRewardApproval } from "../../data/useReferralReward";
import { inactiveClients, referralRewards } from "../../utils/reminders";
import { fullName, normalizePhone } from "./clientUtils";

// השהיה לפני כתיבת מונח החיפוש ל-URL: כתיבה בכל הקשה גורמת לעומס על
// history.replaceState (Safari חוסם קריאות תכופות מדי).
const URL_SYNC_DELAY_MS = 300;

export default function ClientsList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get("filter");
  const inactiveFilter = filterParam === "inactive";
  const referralFilter = filterParam === "referral";

  const { items, loading } = useCollectionData("clients");
  // התורים נדרשים רק כשסינון "לקוחות לא פעילות" / "תגמול הפניות" פעיל
  // (חישוב תור אחרון שבוצע / הפניות שהושלמו) — נטענים ממילא ע"י
  // useCollectionData בכל מקרה (מנוי בזמן אמת משותף), כך שאין עלות רשת
  // נוספת גם כשהסינון כבוי.
  const { items: appts, loading: loadingAppts } = useCollectionData("appointments");
  const { data: reminders } = useReminderSettings();
  const approveReward = useReferralRewardApproval();

  // מונח החיפוש: state מקומי (כדי שההקלדה תישאר חלקה), שמסונכרן ל-?q= ב-URL
  // (replace, עם השהיה). כשחוזרים לרשימה אחרי כניסה לכרטיסיית לקוחה — החיפוש
  // משוחזר מה-URL, וה-ScrollReset משחזר את הגלילה.
  const [q, setQ] = useState(() => searchParams.get("q") || "");

  useEffect(() => {
    if ((searchParams.get("q") || "") === q) return;
    const t = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (q) next.set("q", q);
          else next.delete("q");
          return next;
        },
        { replace: true }
      );
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // ניקוי סינון ה"לא פעילות"/"תגמול הפניות" בלבד — החיפוש הנוכחי נשמר.
  function clearFilter() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("filter");
        return next;
      },
      { replace: true }
    );
  }

  const active = useMemo(() => items.filter((c) => !c.archived), [items]);
  const archivedCount = items.length - active.length;

  const inactiveList = useMemo(
    () => inactiveClients(active, appts, reminders.inactiveClientMonths).map((x) => x.client),
    [active, appts, reminders.inactiveClientMonths]
  );

  // לקוחות מפנות עם תגמול ממתין לאישור (ראו utils/reminders.js). כולל מיפוי
  // לפי מזהה — משמש גם לסימון 🎁 בשורות הרשימה הרגילה.
  const rewards = useMemo(
    () => referralRewards(items, appts, reminders.referralRewardThreshold),
    [items, appts, reminders.referralRewardThreshold]
  );
  const rewardById = useMemo(() => new Map(rewards.map((r) => [r.client.id, r])), [rewards]);
  const referralList = useMemo(() => rewards.map((r) => r.client), [rewards]);

  const baseList = inactiveFilter ? inactiveList : referralFilter ? referralList : active;

  const filtered = useMemo(() => {
    const term = q.trim();
    const digits = normalizePhone(term);
    const list = baseList.filter((c) => {
      const name = fullName(c);
      const byName = term && name.includes(term);
      const byPhone = digits && normalizePhone(c.phone).includes(digits);
      return !term || byName || byPhone;
    });
    return list.sort((a, b) => fullName(a).localeCompare(fullName(b), "he"));
  }, [baseList, q]);

  const anyFilter = inactiveFilter || referralFilter;

  return (
    <>
      <ScreenHeader
        title="לקוחות"
        action={
          <button className="btn" onClick={() => navigate("/clients/new")}>
            + לקוחה
          </button>
        }
      />

      {inactiveFilter && (
        <div
          className="notice"
          style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <span>מציגה לקוחות שלא ביקרו מעל {reminders.inactiveClientMonths} חודשים</span>
          <button className="btn btn--ghost btn--sm" onClick={clearFilter}>
            נקה סינון
          </button>
        </div>
      )}

      {referralFilter && (
        <div
          className="notice"
          style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        >
          <span>
            מציגה לקוחות זכאיות לתגמול הפניות (כל {reminders.referralRewardThreshold} הפניות
            שהושלמו)
          </span>
          <button className="btn btn--ghost btn--sm" onClick={clearFilter}>
            נקה סינון
          </button>
        </div>
      )}

      <div className="field">
        <input
          placeholder="חיפוש לפי שם או טלפון"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading || (anyFilter && loadingAppts) ? (
        <SkeletonRows count={5} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {inactiveFilter
            ? "אין לקוחות התואמות לסינון זה."
            : referralFilter
            ? "אין כרגע לקוחות הממתינות לתגמול הפניות."
            : active.length === 0
            ? "עדיין אין לקוחות. הוסיפי לקוחה ראשונה."
            : "לא נמצאו תוצאות."}
        </div>
      ) : (
        <div className="list">
          {filtered.map((c) => {
            const reward = rewardById.get(c.id);

            // בסינון "תגמול הפניות": שורה עם כפתור "אישור מתנה". הכפתור מחוץ
            // ל-Link (אלמנט לחיץ בתוך אלמנט לחיץ אינו תקין).
            if (referralFilter && reward) {
              return (
                <div key={c.id} className="card list-item">
                  <Link
                    to={`/clients/${c.id}`}
                    className="list-item__main"
                    style={{ color: "inherit", flex: 1 }}
                  >
                    <strong>🎁 {fullName(c)}</strong>
                    <span className="muted">
                      {reward.completedCount} הפניות שהושלמו · מתנות שניתנו: {reward.given}
                    </span>
                  </Link>
                  <div className="list-item__actions">
                    <button className="btn" onClick={() => approveReward(c)}>
                      אישור מתנה
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <Link key={c.id} to={`/clients/${c.id}`} className="card list-item">
                <div className="list-item__main">
                  <strong>
                    {reward ? "🎁 " : ""}
                    {fullName(c)}
                  </strong>
                  {c.phone && <span className="muted sensitive" dir="ltr">{c.phone}</span>}
                </div>
                <span className="nav-card__chev">‹</span>
              </Link>
            );
          })}
        </div>
      )}

      {!anyFilter && archivedCount > 0 && (
        <Link to="/clients/archive" className="archive-link">
          ארכיון לקוחות ({archivedCount}) →
        </Link>
      )}
    </>
  );
}
