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

/* ---------- Hook: קולקציה של ישויות ---------- */
export function useCollectionData(name, ...constraints) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
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
  }, [user, name, JSON.stringify(constraints.map((c) => c?.type))]);

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
