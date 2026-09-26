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
//
// הערה חשובה (מדיון ארכיטקטורה, ספטמבר 2026): prompt:"" הוא "שקט" רק כשגוגל
// מסוגלת לספק את ההרשאה מתוך session/cookie קיימים בדפדפן מול
// accounts.google.com (בפועל: iframe נסתר שנשען על cookie צד-שלישי). דפדפנים
// שחוסמים cookies של צד-שלישי (Safari/iOS ITP כברירת מחדל, וכיוון שאליו
// Chrome הולך בהדרגה) עלולים לחסום את המנגנון הזה מבנית — במקרה כזה אין
// "תיקון קוד" שיחזיר רענון שקט לעבוד באותה סביבה. ההתחברות המפורשת
// (reauthorizeDrive ב-AuthProvider.jsx, שמשתמשת בפופ-אפ מלא ולא ב-iframe
// שקט) ממשיכה לעבוד תמיד, כי היא נווטת ישירות לדף גוגל בהקשר ראשוני (לא
// צד-שלישי) ואינה תלויה ב-cookie חוצה-דומיין.

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
// או null אם אין הסכמה פעילה / אין Client ID / משהו נכשל (כשל כזה הוא חלק
// תקין מהזרימה הרגילה, לא רק תקלה — ראו ההערה למעלה על חסימת cookies).
// שם הפונקציה (requestSilentDriveToken, לשעבר silentDriveToken) משקף במפורש
// שזו "בקשה" לטוקן שקט שעשויה להיכשל, לא הבטחה לקבל אחד.
export async function requestSilentDriveToken(clientId) {
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

// ---------- זיהוי כשל-אימות בתגובת Drive API ----------

// שגיאה ייעודית לכשל אימות (הטוקן נדחה ע"י Drive) — נבדלת משגיאת Drive
// "רגילה" (רשת/quota/404 וכו'). withDriveToken ב-AuthProvider.jsx מזהה אותה
// לפי code==="drive-auth" ומבצע רענון שקט + ניסיון חוזר יחיד; קוד קורא
// (photos.js, backup.js) לא צריך לדעת דבר מעבר לכך שהוא זורק אותה כשמתאים,
// ולא לממש שום לוגיקת רענון/ניסיון-חוזר עצמאית משלו (ראו הערות שם).
export class DriveAuthError extends Error {
  constructor(status) {
    super(`Drive auth failure (${status})`);
    this.name = "DriveAuthError";
    this.code = "drive-auth";
    this.status = status;
  }
}

// בודק אם תגובת Drive API מעידה על כך שהטוקן עצמו נדחה (פג/לא תקף) — ולא על
// בעיית משאב/הרשאה רגילה. המקרה השכיח הוא HTTP 401, אך Drive לעיתים מחזירה
// גם 403 עם reason:"authError" לאותה סיבה בפועל — שני המקרים מטופלים כאן
// באותו אופן כדי שמסלול "רענון שקט + ניסיון חוזר" יכסה את שניהם, ולא רק
// את ה-401 "הנקי".
// מקבל Response (טרם נצרך) ומחזיר בוליאני; קורא ל-res.clone() כדי לא "לצרוך"
// את גוף התגובה — כך שהקורא המקורי עדיין יכול לקרוא אותה שוב בעצמו (למשל
// כדי להוציא הודעת שגיאה מפורטת אם זו לא בעיית אימות).
export async function isDriveAuthFailure(res) {
  if (res.status === 401) return true;
  if (res.status === 403) {
    try {
      const json = await res.clone().json();
      return (json?.error?.errors || []).some((e) => e.reason === "authError");
    } catch {
      return false;
    }
  }
  return false;
}
