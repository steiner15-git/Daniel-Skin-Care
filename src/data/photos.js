// אחסון תמונות אלבום ב-Google Drive (scope drive.file). מבנה: Clinic_Photos/{שם_לקוחה}/.
// ב-Firestore נשמרת מטא-דאטה בלבד (driveFileId, תאריך, תיאור); הבייטים ב-Drive.
// במצב תצוגה מקומי המודול אינו בשימוש — התמונות נשמרות כ-base64 ב-localStorage.

import { IS_LOCAL } from "./index";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function driveFetch(url, token, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  return res;
}

async function findFolder(token, name, parentId) {
  const parts = [`name='${name.replace(/'/g, "\\'")}'`, `mimeType='${FOLDER_MIME}'`, "trashed=false"];
  if (parentId) parts.push(`'${parentId}' in parents`);
  const q = encodeURIComponent(parts.join(" and "));
  const res = await driveFetch(`${DRIVE_FILES}?q=${q}&fields=files(id)`, token);
  const json = await res.json();
  return json.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const metadata = { name, mimeType: FOLDER_MIME };
  if (parentId) metadata.parents = [parentId];
  const res = await driveFetch(`${DRIVE_FILES}?fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const json = await res.json();
  return json.id;
}

async function ensureFolder(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

export async function uploadPhoto(token, { folders = [], base64, mimeType, fileName }) {
  let parent = null;
  for (const name of folders) parent = await ensureFolder(token, name || "ללא שם", parent);
  const boundary = "dscimg" + Math.random().toString(36).slice(2);
  const metadata = {
    name: fileName || `photo-${Date.now()}.jpg`,
    mimeType,
    ...(parent ? { parents: [parent] } : {}),
  };
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    "Content-Transfer-Encoding: base64\r\n\r\n" +
    base64 +
    `\r\n--${boundary}--`;
  const res = await driveFetch(`${DRIVE_UPLOAD}&fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json();
  return json.id;
}

export async function downloadPhoto(token, fileId) {
  const res = await driveFetch(`${DRIVE_FILES}/${fileId}?alt=media`, token);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function deletePhoto(token, fileId) {
  await driveFetch(`${DRIVE_FILES}/${fileId}`, token, { method: "DELETE" });
}

// מקטין תמונה לפני שמירה (רוחב מקסימלי) ומחזיר dataURL של JPEG — חוסך מקום
// ב-Drive ובמגבלת localStorage במצב מקומי.
export function resizeImage(file, maxWidth = 1600, quality = 0.85, mime = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// שומר תמונה מקובץ: במצב מקומי מחזיר { localData }; בענן מעלה ל-Drive
// תחת נתיב התיקיות שסופק ומחזיר { driveFileId }. משמש גם לאלבום וגם לחשבוניות.
export async function storeImage(file, { folders, ensureDriveToken }) {
  const dataUrl = await resizeImage(file);
  if (IS_LOCAL) return { localData: dataUrl, mimeType: "image/jpeg" };
  const token = await ensureDriveToken();
  if (!token) throw new Error("no-token");
  const base64 = dataUrl.split(",")[1];
  const driveFileId = await uploadPhoto(token, { folders, base64, mimeType: "image/jpeg" });
  return { driveFileId, mimeType: "image/jpeg" };
}
