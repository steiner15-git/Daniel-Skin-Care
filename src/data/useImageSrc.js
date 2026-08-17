import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { downloadPhoto } from "./photos";

// מחזיר src לתצוגה: אם יש base64 מקומי — משתמש בו; אחרת מוריד מ-Drive לפי fileId
// (רק כש-enabled), ומנקה את ה-object URL בעת פירוק הרכיב.
export function useImageSrc(localData, driveFileId, enabled = true) {
  const { ensureDriveToken } = useAuth();
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
        const token = await ensureDriveToken();
        if (!token) return;
        url = await downloadPhoto(token, driveFileId);
        if (!cancelled) setSrc(url);
      } catch {
        /* טעינת התמונה מ-Drive נכשלה */
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [localData, driveFileId, enabled, ensureDriveToken]);

  return src;
}
