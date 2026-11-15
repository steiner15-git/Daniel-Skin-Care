import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

/* ---------- בניית נתיבים (מודל היברידי) ---------- */
// הגדרות:  users/{uid}/settings/{key}
// ישויות:  users/{uid}/{collectionName}/{id}

function settingRef(uid, key) {
  return doc(db, "users", uid, "settings", key);
}
function collRef(uid, name) {
  return collection(db, "users", uid, name);
}
function itemRef(uid, name, id) {
  return doc(db, "users", uid, name, id);
}

/* ---------- Hook: מסמך הגדרות בודד ---------- */
export function useSettingDoc(key) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = onSnapshot(
      settingRef(user.uid, key),
      (snap) => {
        setData(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user, key]);

  async function save(partial) {
    if (!user) return;
    await setDoc(
      settingRef(user.uid, key),
      { ...partial, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  return { data, loading, save };
}

/* ---------- מאגר מנויים משותף (subscription pooling) ---------- */
// כמה קומפוננטות שקוראות ל-useCollectionData(name) עבור אותה קולקציה
// ("תני לי את כל האוסף, אני מסננת בזיכרון" — הדפוס הדומיננטי בכל האפליקציה:
// appointments/income/clients/clientPackages וכו', למשל BottomNav+Dashboard+
// SummaryTabs על אותה קולקציה בו-זמנית), חולקות מאזין onSnapshot אחד במקום
// לפתוח מנוי עצמאי כל אחת. זה מפחית משמעותית קריאות Firestore על מסלולים
// נפוצים (בפרט BottomNav, שמחובר תמיד בכל מסך ב-AppShell וצורך appointments+
// income, וכעת גם useAutoBackup.js שנרשם לקולקציות המגובות, Phase 4 §8).
//
// שאילתות ממוקדות (שדה=ערך) אינן משתתפות במאגר המשותף — הן עוברות דרך
// useCollectionWhere למטה, עם מנוי עצמאי ומפתח מפורש.
//
// לא React state — Map מודולרי רגיל, כדי שהמאגר ישרוד בין רינדורים/
// קומפוננטות בלי תלות ב-Context. מנוי נסגר אוטומטית כשמספר ה-subscribers
// יורד ל-0 (כל הצרכנים עשו unmount) — אין צורך בניקוי ידני.
//
// Phase 4 §9: אותו Map משמש גם למנויים מוגבלי-שנה (subscribeRangeQuery
// למטה) — מפתחות אלו כוללים סיומת שנה (${uid}:${name}:${year}) שאינה
// מתנגשת עם מפתחות ה-collection המלא (${uid}:${name}).
const collectionRegistry = new Map();

function subscribeShared(uid, name, onUpdate) {
  const key = `${uid}:${name}`;
  let entry = collectionRegistry.get(key);

  if (!entry) {
    entry = { items: [], loading: true, subscribers: new Set() };
    collectionRegistry.set(key, entry);
    entry.unsub = onSnapshot(
      collRef(uid, name),
      (snap) => {
        entry.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        entry.loading = false;
        entry.subscribers.forEach((fn) => fn(entry.items, entry.loading));
      },
      () => {
        entry.loading = false;
        entry.subscribers.forEach((fn) => fn(entry.items, entry.loading));
      }
    );
  }

  entry.subscribers.add(onUpdate);
  // סנכרון מיידי עם מה שכבר נטען (אם קומפוננטה נטענת אחרי שהמנוי כבר
  // פעיל) — כך שהיא לא ממתינה ל-snapshot הבא כדי לקבל נתונים/loading:false.
  onUpdate(entry.items, entry.loading);

  return () => {
    entry.subscribers.delete(onUpdate);
    if (entry.subscribers.size === 0) {
      entry.unsub();
      collectionRegistry.delete(key);
    }
  };
}

// Phase 4 §9 — מנוי חי מוגבל לשנה קלנדרית בודדת, לצרכנים שתמיד מציגים טווח
// מוגדר-מראש (Calendar.jsx לפי השנה המוצגת, AuditLog.jsx לפי "כמה שנים
// אחורה", Business.jsx's IncomeTab/ExpenseTab לפי השנה הנבחרת). מפתח
// pooling נפרד (${uid}:${name}:${year}) — אם שני צרכנים שואלים על אותה
// שנה, הם משתפים מנוי אחד, בדיוק כמו subscribeShared.
//
// timestampField: השדה שלפיו מגבילים הוא Firestore Timestamp (כמו
// auditLog.ts, שנכתב עם serverTimestamp()) ולא מחרוזת ISO (כמו income.date/
// expenses.date/appointments.start) — קובע אם גבולות הטווח נבנים כאובייקטי
// Date או כמחרוזות "YYYY-01-01". השוואת מחרוזת עובדת נכון כאן כי כל
// המחרוזות הקיימות בפורמט ISO קבוע-רוחב (מיון לקסיקוגרפי = מיון כרונולוגי).
function subscribeRangeQuery(uid, name, poolSuffix, dateField, year, timestampField, onUpdate) {
  const key = `${uid}:${name}:${poolSuffix}`;
  let entry = collectionRegistry.get(key);

  if (!entry) {
    entry = { items: [], loading: true, subscribers: new Set() };
    collectionRegistry.set(key, entry);
    const startBound = timestampField ? new Date(`${year}-01-01T00:00:00`) : `${year}-01-01`;
    const endBound = timestampField
      ? new Date(`${year + 1}-01-01T00:00:00`)
      : `${year + 1}-01-01`;
    const q = query(
      collRef(uid, name),
      where(dateField, ">=", startBound),
      where(dateField, "<", endBound)
    );
    entry.unsub = onSnapshot(
      q,
      (snap) => {
        entry.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        entry.loading = false;
        entry.subscribers.forEach((fn) => fn(entry.items, entry.loading));
      },
      () => {
        entry.loading = false;
        entry.subscribers.forEach((fn) => fn(entry.items, entry.loading));
      }
    );
  }

  entry.subscribers.add(onUpdate);
  onUpdate(entry.items, entry.loading);

  return () => {
    entry.subscribers.delete(onUpdate);
    if (entry.subscribers.size === 0) {
      entry.unsub();
      collectionRegistry.delete(key);
    }
  };
}

/* ---------- Hook: קולקציה של ישויות ---------- */
// תוקן QA (A-01): הפונקציה כבר לא מקבלת constraints. בגרסה הקודמת מפתח
// ה-effect נבנה מ-JSON.stringify(constraints.map(c => c.type)) — כלומר רק
// מסוג האילוץ ("where"), לא מהשדה/הערך. החלפת id בין שני רינדורים (אותה
// קומפוננטה, לקוחה אחרת) לא הפעילה מחדש את המנוי, והוצגו נתוני השאילתה
// הקודמת. שאילתות ממוקדות עברו ל-useCollectionWhere עם מפתח מפורש.
export function useCollectionData(name) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    return subscribeShared(user.uid, name, (its, ld) => {
      setItems(its);
      setLoading(ld);
    });
  }, [user, name]);

  return { items, loading };
}

// תוקן QA (A-01) — שאילתת שוויון על שדה בודד (field == value), חיה, עם מפתח
// מפורש שכולל uid+קולקציה+שדה+ערך: כל שינוי באחד מהם סוגר את המנוי הישן
// ופותח חדש. עד שהמנוי החדש מחזיר snapshot מוחזר מצב ריק+טעינה (ולא נתוני
// השאילתה הקודמת). החתימה היא (name, field, value) ולא אובייקט constraint,
// כדי שמסכים לא יצטרכו לייבא דבר מ-firebase/firestore (כלל 4.4) ושמימוש
// localStore.js יוכל להיות מקביל פשוט.
export function useCollectionWhere(name, field, value) {
  const { user } = useAuth();
  const key = `${user?.uid}:${name}:${field}:${String(value)}`;
  const [state, setState] = useState({ key: "", items: [], loading: true });

  useEffect(() => {
    if (!user || value == null) return;
    setState({ key, items: [], loading: true });
    return onSnapshot(
      query(collRef(user.uid, name), where(field, "==", value)),
      (snap) =>
        setState({
          key,
          loading: false,
          items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        }),
      () => setState((s) => ({ ...s, key, loading: false }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state : { items: [], loading: true };
}

// Phase 4 §9 — קולקציה מוגבלת לשנה קלנדרית בודדת (חי, onSnapshot). לשימוש
// כשצרכן תמיד מציג בדיוק שנה אחת בזמן נתון ומעדכן אותה כשעוברים שנה (למשל
// Calendar.jsx לפי cursor.getFullYear()). לא מתאים לצרכן שצריך לצבור טווח
// גדל בהדרגה — לכך ראו useMultiYearCollectionData למטה.
//
// year === null ⇒ "כל השנים": נופל בחזרה למאגר המשותף הרגיל (ללא הגבלת
// שנה) דרך subscribeShared — אותו מנגנון בדיוק כמו useCollectionData(name)
// הרגיל, כולל שיתוף מנוי עם כל צרכן אחר שגם קורא לקולקציה המלאה (למשל
// SummaryTabs). נוסף ב-Business.jsx's IncomeTab/ExpenseTab (§9 המשך) כדי
// לאפשר החלפה נקייה בין "שנה בודדת" ל"כל השנים" מקריאת-hook אחת בלבד —
// כך שרק מנוי אחד פעיל בכל רגע נתון, לא שניים במקביל.
export function useYearRangeCollectionData(name, dateField, year, { timestampField = false } = {}) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (year == null) {
      return subscribeShared(user.uid, name, (its, ld) => {
        setItems(its);
        setLoading(ld);
      });
    }
    return subscribeRangeQuery(
      user.uid,
      name,
      String(year),
      dateField,
      year,
      timestampField,
      (its, ld) => {
        setItems(its);
        setLoading(ld);
      }
    );
  }, [user, name, dateField, year, timestampField]);

  return { items, loading };
}

// Phase 4 §9 — איחוד של כמה שנים בו-זמנית (כל שנה = מנוי חי נפרד, ממוזג
// לזיכרון), לצרכן עם "טען שנים קודמות" (AuditLog.jsx): years גדל בהדרגה
// (למשל [2026] → [2026,2025] → ...), וכל שנה שנוספת מקבלת מנוי חי משלה —
// כך שגם רשומות "ישנות" שנטענו נשארות מסונכרנות בזמן אמת כל עוד הן בטווח
// המבוקש, ולא הופכות ל"תמונת מצב קפואה".
export function useMultiYearCollectionData(name, dateField, years, { timestampField = false } = {}) {
  const { user } = useAuth();
  const [byYear, setByYear] = useState({});
  const [loadingByYear, setLoadingByYear] = useState({});
  const yearsKey = JSON.stringify(years);

  useEffect(() => {
    if (!user) return;
    const unsubs = years.map((year) =>
      subscribeRangeQuery(user.uid, name, String(year), dateField, year, timestampField, (its, ld) => {
        setByYear((prev) => ({ ...prev, [year]: its }));
        setLoadingByYear((prev) => ({ ...prev, [year]: ld }));
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, name, dateField, yearsKey, timestampField]);

  const items = useMemo(
    () => years.flatMap((y) => byYear[y] || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byYear, yearsKey]
  );
  const loading = years.some((y) => loadingByYear[y] !== false);

  return { items, loading };
}

/* ---------- Repository: פעולות CRUD ---------- */
export function useRepo(name) {
  const { user } = useAuth();

  return {
    async add(data) {
      const ref = await addDoc(collRef(user.uid, name), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    async set(id, data) {
      await setDoc(
        itemRef(user.uid, name, id),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },
    async update(id, data) {
      await updateDoc(itemRef(user.uid, name, id), {
        ...data,
        updatedAt: serverTimestamp(),
      });
    },
    async remove(id) {
      await deleteDoc(itemRef(user.uid, name, id));
    },
    async getAll() {
      const snap = await getDocs(collRef(user.uid, name));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}

/* ---------- Batch repository: כתיבות אטומיות רב-קולקציה ---------- */
// פותר את "רצפי כתיבה רב-שלביים לא-אטומיים" שזוהו באודיט QA (ראו
// Daniel-skin-care_PRD-addendum-features.md — "אי-עקביות ידועות" +
// דוח ה-Spec Compliance): רכישת סדרה (SeriesPurchase.jsx: יצירת income +
// clientPackage) ומכירת מוצר (ProductSell.jsx: יצירת income + ניכוי stock)
// היו שני קריאות repo נפרדות — אם הראשונה מצליחה והשנייה נכשלת (רשת/quota
// באמצע), נוצרת רשומה יתומה (הכנסה בלי חבילה/ניכוי מלאי תואם).
//
// writeBatch של Firestore מבטיח שכל הפעולות בקבוצה מצליחות יחד או נכשלות
// יחד (atomic) — אין מצב ביניים. שימוש:
//   const batchRepo = useBatchRepo();
//   const incomeId = batchRepo.newId("income");     // מזהה נוצר מראש, בלי כתיבה
//   const packageId = batchRepo.newId("clientPackages");
//   await batchRepo.commit([
//     { name: "income", id: incomeId, type: "add", data: {...} },
//     { name: "clientPackages", id: packageId, type: "add", data: {...} },
//   ]);
// "add" כאן כותב מסמך מלא לפי מזהה שכבר נוצר מראש (במקום addDoc עם מזהה
// אוטומטי) — כי כל הפעולות בבאטש חייבות להיות ידועות-מזהה מראש לפני commit.
// מכיוון ש-"add" הוא batch.set לפי מזהה, שימוש במזהה דטרמיניסטי (למשל
// useRecurringExpenses.js, A-05) הופך אותו לאידמפוטנטי: כתיבה חוזרת לאותו מזהה
// דורסת את אותו מסמך ואינה יוצרת כפילות.
// "update" מבצע patch על מסמך קיים, באותו אופן כמו useRepo().update. שים לב:
// update על מסמך שאינו קיים גורם לכשל של ה-batch כולו (וזה רצוי — לא נשארת
// כתיבה חלקית).
// "delete" (A-07) מוחק מסמך לפי מזהה: { name, id, type: "delete" } (ללא data).
export function useBatchRepo() {
  const { user } = useAuth();

  return {
    // יוצר מזהה מסמך חדש (ללא כתיבה בפועל) בקולקציה נתונה — לשימוש כ-id
    // בפעולת "add" בתוך אותו batch, או כדי להפנות אליו ממסמך אחר באותו batch
    // (למשל incomeId בתוך רשומת clientPackage).
    newId(name) {
      return doc(collRef(user.uid, name)).id;
    },
    async commit(ops) {
      const batch = writeBatch(db);
      for (const op of ops) {
        const ref = itemRef(user.uid, op.name, op.id);
        if (op.type === "update") {
          batch.update(ref, { ...op.data, updatedAt: serverTimestamp() });
        } else if (op.type === "delete") {
          // A-07: מחיקה בתוך אותו batch (למשל מחיקת הכנסה יחד עם הרשומות
          // המקושרות אליה). מחיקת מסמך שאינו קיים אינה שגיאה ב-Firestore.
          batch.delete(ref);
        } else {
          // "add" — מזהה כבר נוצר מראש דרך newId(), כותבים מסמך מלא.
          batch.set(ref, {
            ...op.data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    },
  };
}

/* ---------- לוג שינויים (Audit Log) ---------- */
// תוקן QA (A-04): הלוג אינו זורק לעולם. הוא נקרא תמיד *אחרי* שהפעולה העיקרית
// הצליחה, ולכן כשל בכתיבת הלוג לא אמור להפוך את הפעולה ל"נכשלה" בעיני
// המשתמשת (מה שגרם לניסיון חוזר ולפעולה כפולה — למשל אישור מתנת הפניות
// פעמיים). מחזיר true/false כדי שקורא שרוצה יוכל לבדוק, והכשל נרשם ל-console
// (קוד השגיאה בלבד, בלי תוכן הרשומה).
export function useAuditLog() {
  const { user } = useAuth();
  return async function log({ action, entity, before, after }) {
    if (!user) return false;
    try {
      await addDoc(collRef(user.uid, "auditLog"), {
        ts: serverTimestamp(),
        action,
        entity, // { type, id, desc }
        before: before ?? null,
        after: after ?? null,
      });
      return true;
    } catch (e) {
      console.error("[audit] write failed", action, e?.code || e?.message);
      return false;
    }
  };
}
