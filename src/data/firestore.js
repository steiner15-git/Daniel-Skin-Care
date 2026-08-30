import { useEffect, useState } from "react";
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
// כמה קומפוננטות שקוראות ל-useCollectionData(name) עבור אותה קולקציה,
// **ללא constraints** (כלומר: "תני לי את כל האוסף, אני מסננת בזיכרון" —
// הדפוס הדומיננטי בכל האפליקציה: appointments/income/clients/clientPackages
// וכו' תמיד נקראים ככה, למשל BottomNav+Dashboard+Business על אותה קולקציה
// בו-זמנית), חולקות מאזין onSnapshot אחד במקום לפתוח מנוי עצמאי כל אחת.
// זה מפחית משמעותית קריאות Firestore על מסלולים נפוצים (בפרט BottomNav,
// שמחובר תמיד בכל מסך ב-AppShell וצורך appointments+income).
//
// קריאות **עם** constraints (למשל שאילתת where ממוקדת-לקוחה ב-ClientCard)
// אינן משתתפות במאגר המשותף — הן ממשיכות לקבל מנוי עצמאי כרגיל, כי הן
// שאילתות ייחודיות שאין טעם/אפשרות לשתף בין קומפוננטות שונות.
//
// לא React state — Map מודולרי רגיל, כדי שהמאגר ישרוד בין רינדורים/
// קומפוננטות בלי תלות ב-Context. מנוי נסגר אוטומטית כשמספר ה-subscribers
// יורד ל-0 (כל הצרכנים עשו unmount) — אין צורך בניקוי ידני.
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

/* ---------- Hook: קולקציה של ישויות ---------- */
export function useCollectionData(name, ...constraints) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // רק קריאות "מלאות" (בלי constraints) משתתפות במאגר המשותף — ראו הסבר
  // מעל subscribeShared.
  const poolable = constraints.length === 0;

  useEffect(() => {
    if (!user) return;

    if (poolable) {
      return subscribeShared(user.uid, name, (its, ld) => {
        setItems(its);
        setLoading(ld);
      });
    }

    // התנהגות קיימת ללא שינוי עבור שאילתות עם constraints — מנוי עצמאי.
    setLoading(true);
    const q = query(collRef(user.uid, name), ...constraints);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, name, poolable, JSON.stringify(constraints.map((c) => c?.type))]);

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
// "update" מבצע patch על מסמך קיים, באותו אופן כמו useRepo().update.
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
export function useAuditLog() {
  const { user } = useAuth();
  return async function log({ action, entity, before, after }) {
    if (!user) return;
    await addDoc(collRef(user.uid, "auditLog"), {
      ts: serverTimestamp(),
      action,
      entity, // { type, id, desc }
      before: before ?? null,
      after: after ?? null,
    });
  };
}
