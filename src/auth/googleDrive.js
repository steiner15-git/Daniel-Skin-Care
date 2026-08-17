// רענון שקט (ללא פופ-אפ) של טוקן גישה ל-Google Drive, באמצעות Google Identity
// Services (GIS). פותר את הבעיה שבה טוקן ה-Drive שנשמר מ-signInWithPopup פג
// (בד"כ אחרי כשעה) והמשתמשת נתקעת ללא גישה עד רענון ידני/פופ-אפ נוסף.
//
// דורש Client ID מסוג "Web application" מ-Google Cloud Console (לרוב כבר קיים
// אוטומטית תחת פרויקט ה-Firebase). יש להגדיר VITE_GOOGLE_CLIENT_ID בסביבה,
// ולוודא שדומיין האתר (וגם localhost בפיתוח) מוגדר תחת "Authorized JavaScript
// origins" באותו Client ID.
//
// אם אין Client ID מוגדר, או שהרענון השקט נכשל (למשל אין הסכמה פעילה בדפדפן),
// הפונקציה מחזירה null — והקוד הקורא (AuthProvider) נופל בחזרה לפופ-אפ מלא.

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

let gisLoadPromise = null;

function loadGis() {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gis-load-failed"));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

let tokenClient = null;

async function getTokenClient(clientId) {
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => {}, // מוחלף בפועל בכל קריאה, ראו למטה
    });
  }
  return tokenClient;
}

// מנסה לקבל טוקן Drive בשקט (prompt: ""). מחזיר { token, expiresIn } בהצלחה,
// או null אם אין הסכמה פעילה / אין Client ID / משהו נכשל.
export async function silentDriveToken(clientId) {
  if (!clientId) return null;
  try {
    const client = await getTokenClient(clientId);
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      client.callback = (resp) => {
        if (resp?.access_token) {
          finish({ token: resp.access_token, expiresIn: Number(resp.expires_in) || 3600 });
        } else {
          finish(null);
        }
      };
      client.error_callback = () => finish(null);
      // בטיחות: אם GIS לא עונה כלל (למשל חסימת רשת/פופ-אפ) — לא נתקע לנצח
      setTimeout(() => finish(null), 8000);
      try {
        client.requestAccessToken({ prompt: "" });
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
}
