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

export default function ProductSell() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.from === "products" ? "/products" : "/";

  const { items: products, loading } = useCollectionData("products");
  const { items: clients } = useCollectionData("clients");
  const incomeRepo = useRepo("income");
  const productRepo = useRepo("products");
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [{ id: "cash", name: "מזומן" }];
  const log = useAuditLog();

  const p = products.find((x) => x.id === id);

  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [qty, setQty] = useState(1);
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
  if (!p)
    return (
      <>
        <ScreenHeader title="מכירת מוצר" />
        <div className="empty-state">המוצר לא נמצא.</div>
      </>
    );

  const stock = p.stock ?? 0;
  const qtyNum = Number(qty) || 0;
  const amountVal = amount == null ? (Number(p.price) || 0) * qtyNum : amount;
  const outOfStock = stock <= 0;
  const qtyInvalid = qtyNum < 1 || qtyNum > stock;

  async function confirmSale() {
    setSaving(true);
    const incomeId = await incomeRepo.add({
      source: "product",
      productId: p.id,
      quantity: qtyNum,
      // clientId נשמר כאן (בנוסף ל-clientName) כדי שטאב "מוצרים" בכרטיסיית
      // הלקוחה (addendum #15) וקישור הלקוחה בטאב "מכירות" (addendum #14)
      // יוכלו לשייך את המכירה בוודאות, ולא רק לפי התאמת שם טקסטואלית.
      clientId: clientId || null,
      clientName,
      treatmentName: qtyNum > 1 ? `${p.name} ×${qtyNum}` : p.name,
      note: "מכירת מוצר",
      amount: Number(amountVal) || 0,
      date,
      invoiceNumber: "",
      paymentMethod,
      paid,
    });
    await productRepo.update(p.id, { stock: Math.max(0, stock - qtyNum) });
    await log({
      action: "product_sale",
      entity: {
        type: "product",
        id: p.id,
        desc: `${p.name}${clientName ? ` — ${clientName}` : ""}`,
      },
      after: { incomeId },
    });
    navigate(backTo);
  }

  return (
    <>
      <ScreenHeader
        title="מכירת מוצר"
        action={
          <button className="btn btn--ghost" onClick={() => navigate(backTo)}>
            חזרה
          </button>
        }
      />

      <div className="card">
        <div className="read-row">
          <span className="muted">מוצר</span>
          <span>{p.name}</span>
        </div>
        <div className="read-row">
          <span className="muted">במלאי</span>
          <span>{p.stock ?? 0}</span>
        </div>
      </div>

      {outOfStock && (
        <div className="notice" style={{ marginTop: 0 }}>
          המוצר אזל מהמלאי. עדכני את הכמות במסך המוצרים לפני מכירה.
        </div>
      )}

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
            <label>לקוחה (אופציונלי)</label>
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
            <label>כמות (מתוך {stock})</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={stock}
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setAmount(null);
              }}
            />
          </div>
          <div className="field">
            <label>סכום שהתקבל (₪)</label>
            <input
              type="number"
              inputMode="numeric"
              value={amountVal}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>תאריך תשלום</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {qtyInvalid && !outOfStock && (
          <p className="warn-text" style={{ marginTop: 0 }}>
            ⚠ הכמות חייבת להיות בין 1 ל-{stock}.
          </p>
        )}
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
        המכירה תיצור רשומת הכנסה של {formatILS(amountVal)} ותנכה {qtyNum > 1 ? `${qtyNum} יחידות` : "יחידה אחת"} מהמלאי.
      </div>

      <div className="save-row">
        <button
          className="btn"
          disabled={saving || outOfStock || qtyInvalid || !paymentMethod}
          onClick={confirmSale}
        >
          {saving ? "שומרת…" : "אישור מכירה"}
        </button>
      </div>
    </>
  );
}
