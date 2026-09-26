import { useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useAuth } from "../../auth/AuthProvider";
import { IS_LOCAL } from "../../data";
import { runBackupOnce } from "../../data/useAutoBackup";
import { readBackupFileId } from "../../data/backup";
import { readBackupStatus } from "../../data/backupStatus";
import { useConfirm } from "../../context/ConfirmDialogProvider";

// אמולטור (VITE_DEV_USER=1 יחד עם VITE_USE_EMULATOR=1): IS_LOCAL כבוי, אבל
// אין התחברות אמיתית ל-Google ולכן אין טוקן Drive — הגיבוי לא יכול לעבוד שם.
const EMULATOR_MODE = import.meta.env.VITE_DEV_USER === "1" && !IS_LOCAL;

function tsToStr(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("he-IL");
}

// סיבת הכשל כטקסט להצגה: "no-token" מתורגם, כל השאר (HTTP + הודעת Drive)
// מוצג כפי שנשמר.
function reasonText(reason) {
  if (!reason) return "";
  if (reason === "no-token") return "החיבור ל-Google Drive פג — נדרשת התחברות מחדש.";
  return reason;
}

export default function Backup() {
  const { user, withDriveToken, reauthorizeDrive } = useAuth();
  const confirmDialog = useConfirm();
  const [status, setStatus] = useState(() => readBackupStatus());
  const [running, setRunning] = useState(false);

  const fileId = readBackupFileId(user?.uid);
  const fileUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : "";

  // force:true — לחיצה על "גיבוי עכשיו" היא בקשה מפורשת של המשתמשת, ולכן
  // תמיד מבצעת גיבוי בפועל מול Drive (Phase 4 §8), בניגוד לריצות
  // האוטומטיות (useAutoBackup.js) שמדלגות בשקט כשאין שינוי updatedAt מרבי
  // מעבר לחותמת הגיבוי האחרון.
  async function runNow() {
    setRunning(true);
    const result = await runBackupOnce(user.uid, withDriveToken, { force: true });
    setStatus(readBackupStatus());
    setRunning(false);
    if (result.ok) return;

    if (result.reason === "no-token") {
      const reconnect = await confirmDialog({
        title: "הגיבוי נכשל",
        message: "החיבור ל-Google Drive פג. להתחבר מחדש ולנסות שוב?",
        confirmLabel: "התחברות מחדש",
        cancelLabel: "ביטול",
      });
      if (!reconnect) return;
      await reauthorizeDrive();
      setRunning(true);
      const retry = await runBackupOnce(user.uid, withDriveToken, { force: true });
      setStatus(readBackupStatus());
      setRunning(false);
      if (!retry.ok && retry.reason === "other") {
        await confirmDialog({
          title: "הגיבוי נכשל",
          message: `הגיבוי נכשל.\n${retry.detail || ""}`,
          alertOnly: true,
        });
      }
    } else {
      await confirmDialog({
        title: "הגיבוי נכשל",
        message: `הגיבוי נכשל.\n${result.detail || "בדקי את החיבור לרשת ונסי שוב מאוחר יותר."}`,
        alertOnly: true,
      });
    }
  }

  // Phase 4 §8 — "בדיקה אחרונה דילגה" מוצג רק כשהאירוע האחרון בפועל הוא
  // דילוג (lastSkippedAt חדש יותר מ-lastSuccessAt) ואין כשל פעיל — אחרת
  // ההודעות הקיימות (הצלחה/כישלון) כבר מספרות את הסיפור המדויק יותר.
  const showSkipped =
    !status.lastErrorAt &&
    status.lastSkippedAt &&
    (!status.lastSuccessAt || status.lastSkippedAt > status.lastSuccessAt);

  return (
    <>
      <SettingsSubHeader title="גיבוי" />

      <div className="card">
        {status.lastErrorAt ? (
          <>
            <p className="warn-text" style={{ marginTop: 0 }}>
              ⚠ הגיבוי האחרון נכשל ({tsToStr(status.lastErrorAt)})
            </p>
            {status.lastErrorReason && (
              <p
                className="muted"
                dir={status.lastErrorReason === "no-token" ? undefined : "ltr"}
                style={{ fontSize: 12, margin: "8px 0 0", wordBreak: "break-word" }}
              >
                {reasonText(status.lastErrorReason)}
              </p>
            )}
            {status.lastSuccessAt && (
              <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                גיבוי מוצלח אחרון: {tsToStr(status.lastSuccessAt)}
              </p>
            )}
          </>
        ) : status.lastSuccessAt ? (
          <p className="muted" style={{ margin: 0 }}>
            גיבוי אחרון: {tsToStr(status.lastSuccessAt)}
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            טרם בוצע גיבוי.
          </p>
        )}
        {showSkipped && (
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
            בדיקה אחרונה ({tsToStr(status.lastSkippedAt)}): אין שינויים חדשים לגיבוי.
          </p>
        )}
      </div>

      {IS_LOCAL ? (
        <div className="notice" style={{ marginTop: 16 }}>
          הגיבוי האוטומטי לא פעיל במצב תצוגה מקומי.
        </div>
      ) : EMULATOR_MODE ? (
        <div className="notice" style={{ marginTop: 16 }}>
          גיבוי ל-Drive אינו זמין במצב אמולטור — אין שם התחברות אמיתית ל-Google ולכן אין
          טוקן Drive. יש לבדוק גיבוי מול Firebase אמיתי.
        </div>
      ) : (
        <div className="save-row" style={{ justifyContent: "flex-start", marginTop: 16 }}>
          <button className="btn" disabled={running} onClick={runNow}>
            {running ? "מגבה…" : "גיבוי עכשיו"}
          </button>
        </div>
      )}

      {fileUrl && (
        <a
          className="btn btn--ghost btn--block"
          style={{ marginTop: 16 }}
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          פתיחת קובץ הגיבוי ב-Drive
        </a>
      )}
    </>
  );
}
