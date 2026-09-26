import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { downloadPhoto } from "./photos";

// מחזיר src לתצוגה: אם יש base64 מקומי — משתמש בו; אחרת מוריד מ-Drive לפי
// fileId (רק כש-enabled), ומנקה את ה-object URL בעת פירוק הרכיב.
//
// עדכון ארכיטקטורה (ספטמבר 2026): ההורדה עוברת דרך withDriveToken (במקום
// ensureDriveToken + downloadPhoto ישירות) — כך שאם Drive דוחה את הטוקן
// בפועל (למשל אחרי שהאפליקציה הייתה מושהית ברקע וטיימרי הרענון הפרואקטיביים
// לא רצו, מצב שכיח בדפדוף באלבום ב-PWA שנפתחת לפרקי זמן קצרים), מתבצע
// רענון שקט + ניסיון חוזר יחיד באופן שקוף — במקום שהתמונה פשוט לא תיטען.
export function useImageSrc(localData, driveFileId, enabled = true) {
  const { withDriveToken } = useAuth();
  const [src, setSrc] = useState(localData || "");

  useEffect(() => {
    if (localData) {
      setSrc(localData);
      return;
    }
    if (!enabled || !driveFileId) return;
    let url;
    let cancelled = false;
    (async () => {
      try {
        url = await withDriveToken((token) => downloadPhoto(token, driveFileId));
        if (!cancelled) setSrc(url);
      } catch {
        /* טעינת התמונה מ-Drive נכשלה (אין טוקן / רענון+ניסיון-חוזר לא הצליחו / שגיאת רשת) */
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [localData, driveFileId, enabled, withDriveToken]);

  return src;
}
