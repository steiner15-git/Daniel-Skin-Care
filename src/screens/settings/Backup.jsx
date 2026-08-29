import { useState } from "react";
import SettingsSubHeader from "./SettingsSubHeader";
import { useAuth } from "../../auth/AuthProvider";
import { IS_LOCAL } from "../../data";
import { runBackupOnce } from "../../data/useAutoBackup";
import { FILE_ID_KEY } from "../../data/backup";
import { readBackupStatus } from "../../data/backupStatus";
import { useConfirm } from "../../context/ConfirmDialogProvider";

function tsToStr(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("he-IL");
}

function readFileId() {
  try {
    return localStorage.getItem(FILE_ID_KEY) || "";
  } catch {
    return "";
  }
}

export default function Backup() {
  const { user, ensureDriveToken, reauthorizeDrive } = useAuth();
  const confirmDialog = useConfirm();
  const [status, setStatus] = useState(() => readBackupStatus());
  const [running, setRunning] = useState(false);

  const fileId = readFileId();
  const fileUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : "";

  async function runNow() {
    setRunning(true);
    const result = await runBackupOnce(user.uid, ensureDriveToken);
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
      await runBackupOnce(user.uid, ensureDriveToken);
      setStatus(readBackupStatus());
      setRunning(false);
    } else {
      await confirmDialog({
        title: "הגיבוי נכשל",
        message: "הגיבוי נכשל. בדקי את החיבור לרשת ונסי שוב מאוחר יותר.",
        alertOnly: true,
      });
    }
  }

  return (
    <>
      <SettingsSubHeader title="גיבוי" />

      <div className="card">
        {status.lastErrorAt ? (
          <>
            <p className="warn-text" style={{ marginTop: 0 }}>
              ⚠ הגיבוי האחרון נכשל ({tsToStr(status.lastErrorAt)})
            </p>
            {status.lastSuccessAt && (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
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
      </div>

      {IS_LOCAL ? (
        <div className="notice" style={{ marginTop: 16 }}>
          הגיבוי האוטומטי לא פעיל במצב תצוגה מקומי.
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
