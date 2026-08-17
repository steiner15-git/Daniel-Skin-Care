import { useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import { useCollectionData, useRepo, useSettingDoc, useAuditLog } from "../data";
import { fullName } from "./clients/clientUtils";
import { formatILS } from "../utils/money";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function SeriesPurchase() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from === "series" ? "/series" : "/";

  const { items: series, loading } = useCollectionData("series");
  const { items: clients } = useCollectionData("clients");
  const incomeRepo = useRepo("income");
  const packageRepo = useRepo("clientPackages");
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [{ id: "cash", name: "מזומן" }];
  const log = useAuditLog();

  const s = series.find((x) => x.id === id);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [amount, setAmount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [date, setDate] = useState(todayInput());
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredClients = useMemo(() => {
    const term = clientQuery.trim();
    if (!term) return [];
    return clients.filter((c) => !c.archived && fullName(c).includes(term)).slice(0, 6);
  }, [clients, clientQuery]);

  if (loading) return <p className="muted">טוען…</p>;
  if (!s)
    return (
      <>
        <ScreenHeader title="רכישת סדרה" />
        <div className="empty-state">הסדרה לא נמצאה.</div>
      </>
    );

  const amountVal = amount == null ? s.price ?? 0 : amount;

  async function confirmPurchase() {
    setSaving(true);
    const incomeId = await incomeRepo.add({
      source: "series",
      seriesId: s.id,
      clientName,
      treatmentName: s.name,
      amount: Number(amountVal) || 0,
      date,
      invoiceNumber: "",
      paymentMethod,
      paid,
    });
    const packageId = await packageRepo.add({
      clientId,
      clientName,
      seriesId: s.id,
      seriesName: s.name,
      treatmentIds: s.treatmentIds || (s.treatmentId ? [s.treatmentId] : []),
      treatmentName: s.treatmentName,
      totalSessions: Number(s.sessions) || 0,
      remainingSessions: Number(s.sessions) || 0,
      purchaseDate: date,
      expiryDate: s.expiryDate || null,
      incomeId,
      status: "active",
    });
    await log({
      action: "series_purchase",
      entity: { type: "clientPackage", id: packageId, desc: `${clientName} — ${s.name}` },
    });
    navigate(backTo);
  }

  return (
    <>
      <ScreenHeader
        title="רכישת סדרה"
        action={
          <button className="btn btn--ghost" onClick={() => navigate(backTo)}>
            חזרה
          </button>
        }
      />

      <div className="card">
        <div className="read-row">
          <span className="muted">סדרה</span>
          <span>{s.name}</span>
        </div>
        <div className="read-row">
          <span className="muted">טיפול</span>
          <span>{s.treatmentName}</span>
        </div>
        <div className="read-row">
          <span className="muted">מפגשים</span>
          <span>{s.sessions}</span>
        </div>
        {s.expiryDate ? (
          <div className="read-row">
            <span className="muted">בתוקף עד</span>
            <span>{s.expiryDate}</span>
          </div>
        ) : null}
      </div>

      <div className="card">
        {clientId ? (
          <div className="picked">
            <strong>{clientName}</strong>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setClientId("");
                setClientName("");
              }}
            >
              שינוי
            </button>
          </div>
        ) : (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>בחירת לקוחה</label>
            <input
              placeholder="שם הלקוחה"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
            />
            {filteredClients.length > 0 && (
              <div className="suggest">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    className="suggest__item"
                    onClick={() => {
                      setClientId(c.id);
                      setClientName(fullName(c));
                      setClientQuery("");
                    }}
                  >
                    {fullName(c)}{" "}
                    {c.phone && (
                      <span className="muted" dir="ltr">
                        {c.phone}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

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
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-check" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span>סומן כשולם (אפשר לאשר גם מאוחר יותר במסך ההכנסות)</span>
        </label>
      </div>

      <div className="notice">
        הרכישה תיצור רשומת הכנסה של {formatILS(amountVal)} וחבילת לקוחה עם {s.sessions} מפגשים.
      </div>

      <div className="save-row">
        <button
          className="btn"
          disabled={saving || !clientId || !paymentMethod}
          onClick={confirmPurchase}
        >
          {saving ? "שומרת…" : "אישור רכישה"}
        </button>
      </div>
    </>
  );
}
