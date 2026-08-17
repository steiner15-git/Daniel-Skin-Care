// שכבת נתונים מקומית (localStorage) — משמשת במצב תצוגה מקומי (VITE_DEV_USER=1)
// כתחליף ל-Firestore כשההתחברות/הרשת חסומות. חושפת בדיוק את אותו API
// כמו data/firestore.js כך שהמסכים אינם יודעים באיזה backend הם משתמשים.
import { useEffect, useReducer } from "react";

const PREFIX = "dsc:";
const bus = new EventTarget();
const emit = () => bus.dispatchEvent(new Event("change"));

function useBus() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const h = () => force();
    bus.addEventListener("change", h);
    return () => bus.removeEventListener("change", h);
  }, []);
}

function genId() {
  return `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function readColl(name) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + "coll:" + name) || "[]");
  } catch {
    return [];
  }
}
function writeColl(name, arr) {
  localStorage.setItem(PREFIX + "coll:" + name, JSON.stringify(arr));
  emit();
}
function readDoc(key) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + "settings:" + key) || "null");
  } catch {
    return null;
  }
}
function writeDoc(key, obj) {
  localStorage.setItem(PREFIX + "settings:" + key, JSON.stringify(obj));
  emit();
}

export function useSettingDoc(key) {
  useBus();
  const data = readDoc(key);
  async function save(partial) {
    writeDoc(key, { ...(readDoc(key) || {}), ...partial, updatedAt: Date.now() });
  }
  return { data, loading: false, save };
}

// מתעלם מאילוצי שאילתה (constraints) — המסכים מסננים/ממיינים בצד הלקוח
export function useCollectionData(name) {
  useBus();
  return { items: readColl(name), loading: false };
}

export function useRepo(name) {
  return {
    async add(data) {
      const id = genId();
      const arr = readColl(name);
      arr.push({ id, ...data, createdAt: Date.now(), updatedAt: Date.now() });
      writeColl(name, arr);
      return id;
    },
    async set(id, data) {
      const arr = readColl(name);
      const i = arr.findIndex((x) => x.id === id);
      const rec = { ...(i >= 0 ? arr[i] : { id }), ...data, updatedAt: Date.now() };
      if (i >= 0) arr[i] = rec;
      else arr.push(rec);
      writeColl(name, arr);
    },
    async update(id, data) {
      const arr = readColl(name);
      const i = arr.findIndex((x) => x.id === id);
      if (i >= 0) {
        arr[i] = { ...arr[i], ...data, updatedAt: Date.now() };
        writeColl(name, arr);
      }
    },
    async remove(id) {
      writeColl(
        name,
        readColl(name).filter((x) => x.id !== id)
      );
    },
    async getAll() {
      return readColl(name);
    },
  };
}

export function useAuditLog() {
  return async function log({ action, entity, before, after }) {
    const arr = readColl("auditLog");
    arr.push({
      id: genId(),
      ts: Date.now(),
      action,
      entity,
      before: before ?? null,
      after: after ?? null,
    });
    writeColl("auditLog", arr);
  };
}
