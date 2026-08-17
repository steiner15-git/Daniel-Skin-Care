// נקודת כניסה אחת לשכבת הנתונים. בוחר backend לפי מצב ההרצה:
// - מצב תצוגה מקומי (VITE_DEV_USER=1, בלי אמולטור) → localStorage
// - אחרת → Firestore (ענן או אמולטור)
// המסכים מייבאים תמיד מכאן, ואינם יודעים באיזה backend נעשה שימוש.
import * as firestore from "./firestore";
import * as local from "./localStore";

const LOCAL =
  import.meta.env.VITE_DEV_USER === "1" &&
  import.meta.env.VITE_USE_EMULATOR !== "1";

const impl = LOCAL ? local : firestore;

export const IS_LOCAL = LOCAL;
export const useSettingDoc = impl.useSettingDoc;
export const useCollectionData = impl.useCollectionData;
export const useRepo = impl.useRepo;
export const useAuditLog = impl.useAuditLog;
