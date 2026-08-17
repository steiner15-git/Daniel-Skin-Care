import { useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc, useAuditLog } from "../../data";
import { formatDateTime } from "../../utils/datetime";
import { formatILS } from "../../utils/money";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function CloseAppointment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from === "dashboard" ? "/" : "/calendar";
  const { items: appts, loading } = useCollectionData("appointments");
  const { items: packages } = useCollectionData("clientPackages");
  const apptRepo = useRepo("appointments");
  const incomeRepo = useRepo("income");
  const packageRepo = useRepo("clientPackages");
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [{ id: "cash", name: "מזומן" }];
  const log = useAuditLog();

  const appt = appts.find((a) => a.id === id);
  const [amount, setAmount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [date, setDate] = useState(todayInput());
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  if (loading) return <p className="muted">טוען…</p>;
  if (!appt)
    return (
      <>
        <ScreenHeader title="אישור ביצוע" />
        <div className="empty-state">התור לא נמצא.</div>
      </>
    );

  const amountVal = amount == null ? appt.price ?? 0 : amount;

  const pkg = appt.clientPackageId ? packages.find((p) => p.id === appt.clientPackageId) : null;
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const pkgChargeable =
    pkg &&
    pkg.status === "active" &&
    (pkg.remainingSessions ?? 0) > 0 &&
    (!pkg.expiryDate || new Date(pkg.expiryDate) >= t0);

  async function confirmFromPackage() {
    setSaving(true);
    const remaining = (pkg.remainingSessions ?? 0) - 1;
    await packageRepo.update(pkg.id, {
      remainingSessions: remaining,
      status: remaining <= 0 ? "used" : "active",
    });
    await apptRepo.update(appt.id, {
      status: "done",
      chargedFromPackage: true,
      clientPackageId: pkg.id,
    });
    await log({
      action: "package_charge",
      entity: { type: "clientPackage", id: pkg.id, desc: `${appt.clientName} — ${pkg.seriesName}` },
      before: { remainingSessions: pkg.remainingSessions },
      after: { remainingSessions: remaining },
    });
    navigate(backTo);
  }

  async function confirmDone() {
    setSaving(true);
    const incomeId = await incomeRepo.add({
      source: "appointment",
      appointmentId: appt.id,
      clientName: appt.clientName || "",
      treatmentName: appt.treatmentName || "",
      amount: Number(amountVal) || 0,
      date,
      invoiceNumber: "",
      paymentMethod,
      paid, // אישור התשלום נעשה ידנית ע"י המפעילה, לא אוטומטית
    });
    await apptRepo.update(appt.id, {
      status: "done",
      incomeId,
      paymentMethod,
      // החבילה פקעה/נגמרה — התור חויב רגיל, מנתקים את הקישור לחבילה
      clientPackageId: null,
      chargedFromPackage: false,
    });
    navigate(backTo);
  }

  async function cancelAppt() {
    if (!confirm("לבטל את התור? לא תיווצר הכנסה (למשל: הלקוחה לא הגיעה).")) return;
    await apptRepo.update(appt.id, { status: "cancelled" });
    navigate(backTo);
  }

  return (
    <>
      <ScreenHeader
        title="אישור ביצוע"
        action={
          <button className="btn btn--ghost" onClick={() => navigate(backTo)}>
            חזרה
          </button>
        }
      />

      <div className="card">
        <div className="read-row">
          <span className="muted">לקוחה</span>
          <span>{appt.clientName}</span>
        </div>
        <div className="read-row">
          <span className="muted">טיפול</span>
          <span>{appt.treatmentName}</span>
        </div>
        <div className="read-row">
          <span className="muted">מועד</span>
          <span>{formatDateTime(appt.start)}</span>
        </div>
      </div>

      {pkgChargeable ? (
        <>
          <div className="notice" style={{ marginTop: 0 }}>
            תור זה מחויב מחבילה: <strong>{pkg.seriesName}</strong> — נותרו{" "}
            {pkg.remainingSessions}/{pkg.totalSessions} מפגשים. אישור הביצוע ינכה מפגש אחד
            ולא ייצור הכנסה חדשה.
          </div>
          <div className="save-row" style={{ justifyContent: "space-between" }}>
            <button className="btn btn--danger" onClick={cancelAppt}>
              ביטול תור (לא בוצע)
            </button>
            <button className="btn" disabled={saving} onClick={confirmFromPackage}>
              {saving ? "שומרת…" : "אישור וניכוי מהחבילה"}
            </button>
          </div>
        </>
      ) : (
        <>
          {appt.clientPackageId && (
            <div className="notice" style={{ marginTop: 0 }}>
              ⚠ החבילה שסומנה לתור פקעה או שנגמרו בה המפגשים — התור יחויב כתשלום רגיל.
            </div>
          )}

          <div className="card">
            <div className="row-2">
              <div className="field">
                <label>סכום שהתקבל (₪)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amountVal}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="field">
                <label>תאריך תשלום</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>אמצעי תשלום</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">— בחרי —</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>

            <label className="inline-check" style={{ marginTop: 14 }}>
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              <span>סומן כשולם (אפשר לאשר גם מאוחר יותר במסך ההכנסות)</span>
            </label>
          </div>

          <div className="notice">
            אישור ביצוע ייצור רשומת הכנסה של {formatILS(amountVal)} המשויכת לתור. אישור התשלום
            ("שולם") נעשה על ידך — כאן או מאוחר יותר. לאחר האישור עריכת התור תינעל.
          </div>

          <div className="save-row" style={{ justifyContent: "space-between" }}>
            <button className="btn btn--danger" onClick={cancelAppt}>
              ביטול תור (לא בוצע)
            </button>
            <button className="btn" disabled={saving || !paymentMethod} onClick={confirmDone}>
              {saving ? "שומרת…" : "אישור ויצירת הכנסה"}
            </button>
          </div>
        </>
      )}
    </>
  );
}
