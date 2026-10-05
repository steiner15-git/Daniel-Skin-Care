import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import ClientPicker from "../components/ClientPicker";
import DateField from "../components/DateField";
import { useCollectionData, useBatchRepo, useSettingDoc, useAuditLog } from "../data";
import { useConfirm } from "../context/ConfirmDialogProvider";
import { fullName } from "./clients/clientUtils";
import { formatILS } from "../utils/money";
import { dateInputValue } from "../utils/datetime";
import { round2 } from "../utils/credits";

// רכישת שובר מתנה (addendum שוברים/זיכוי, P-1..P-10). נתיבים:
//   /vouchers/:id/purchase — מהגדרת שובר (סכום ותוקף ברירת מחדל מההגדרה)
//   /vouchers/purchase     — שובר בסכום חופשי (בלי הגדרה)
//
// batch אטומי אחד (useBatchRepo): [לקוחה חדשה, אם נבחרה "הוספה מהירה"] +
// income של הקונה (source:"voucher") + credits של המקבלת. אם ה-batch נכשל —
// לא נשארת לקוחה יתומה ולא הכנסה בלי יתרה (או להפך).
export default function VoucherPurchase() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { items: vouchers, loading } = useCollectionData("vouchers");
  const batchRepo = useBatchRepo();
  const { data: pmDoc } = useSettingDoc("paymentMethods");
  const methods = pmDoc?.items ?? [{ id: "cash", name: "מזומן" }];
  const log = useAuditLog();
  const confirmDialog = useConfirm();

  const v = id ? vouchers.find((x) => x.id === id) : null;
  const thisYear = new Date().getFullYear();

  const [buyer, setBuyer] = useState({ clientId: "", clientName: "" });
  const [recipMode, setRecipMode] = useState("existing"); // existing | new
  const [recipient, setRecipient] = useState({ clientId: "", clientName: "" });
  const [newClient, setNewClient] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [amount, setAmount] = useState("");
  const [expiryDate, setExpiryDate] = useState(""); // ריק = ללא תוקף (ברירת מחדל)
  const [date, setDate] = useState(dateInputValue(new Date()));
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  // ברירות מחדל מההגדרה (סכום ותוקף) — פעם אחת כשההגדרה נטענת.
  useEffect(() => {
    if (v) {
      setAmount(String(v.amount ?? ""));
      setExpiryDate(v.expiryDate || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id]);

  if (id && loading) return <p className="muted">טוען…</p>;
  if (id && !v)
    return (
      <>
        <ScreenHeader title="רכישת שובר" />
        <div className="empty-state">הגדרת השובר לא נמצאה.</div>
      </>
    );

  const amountNum = round2(Math.max(0, Number(amount) || 0));
  const buyerName = buyer.clientName.trim();
  const recipientValid =
    recipMode === "existing" ? !!recipient.clientId : !!newClient.firstName.trim();
  const recipientDisplay =
    recipMode === "existing" ? recipient.clientName : fullName(newClient);
  const sameClient =
    recipMode === "existing" && buyer.clientId && buyer.clientId === recipient.clientId;
  const canSave = !!buyerName && recipientValid && amountNum > 0 && !!paymentMethod;

  function setNew(patch) {
    setNewClient((c) => ({ ...c, ...patch }));
  }

  async function confirmPurchase() {
    setSaving(true);
    const incomeId = batchRepo.newId("income");
    const creditId = batchRepo.newId("credits");
    try {
      let recipientId = recipient.clientId;
      let recipientName = recipient.clientName;
      const ops = [];

      // P-2: מקבלת ללא כרטיסייה — נוצרת באותו batch.
      if (recipMode === "new") {
        recipientId = batchRepo.newId("clients");
        recipientName = fullName(newClient);
        ops.push({
          name: "clients",
          id: recipientId,
          type: "add",
          data: {
            firstName: newClient.firstName.trim(),
            lastName: newClient.lastName.trim(),
            phone: newClient.phone.trim(),
            email: newClient.email.trim(),
            emailInvite: false,
            diagnosis: {},
            archived: false,
          },
        });
      }

      // ההכנסה נרשמת אצל הקונה (clientId ריק לקונה מזדמנת).
      ops.push({
        name: "income",
        id: incomeId,
        type: "add",
        data: {
          source: "voucher",
          creditId,
          clientId: buyer.clientId || null,
          clientName: buyerName,
          giftToClientId: recipientId,
          giftToName: recipientName,
          treatmentName: v?.name || "שובר מתנה",
          note: "שובר מתנה",
          amount: amountNum,
          date,
          invoiceNumber: "",
          paymentMethod,
          paid,
        },
      });

      // היתרה נרשמת אצל המקבלת.
      ops.push({
        name: "credits",
        id: creditId,
        type: "add",
        data: {
          clientId: recipientId,
          clientName: recipientName,
          amount: amountNum,
          remaining: amountNum,
          source: "voucher",
          giftFromClientId: buyer.clientId || null,
          giftFromName: buyerName,
          voucherId: v?.id || null,
          voucherName: v?.name || null,
          expiryDate: expiryDate || null,
          incomeId,
          reason: "",
          status: "active",
          voucherSentEmail: false,
          voucherSentWhatsapp: false,
        },
      });

      await batchRepo.commit(ops);

      // לוג אחרי שה-commit הצליח — כשל בלוג לא אמור להציג "הרכישה נכשלה".
      try {
        await log({
          action: "voucher_purchase",
          entity: {
            type: "credit",
            id: creditId,
            desc: `${buyerName} ← ${recipientName} · ${formatILS(amountNum)}`,
          },
          after: { amount: amountNum, expiryDate: expiryDate || null },
        });
      } catch (e) {
        console.error("[audit] voucher_purchase failed", e);
      }
    } catch (e) {
      setSaving(false);
      await confirmDialog({
        title: "שגיאה",
        message: "רכישת השובר נכשלה: " + (e?.message || e),
        alertOnly: true,
      });
      return;
    }
    // P-9: מעבר אוטומטי למסך השליחה.
    navigate(`/vouchers/${creditId}/send`, { replace: true, state: { from: "purchase" } });
  }

  return (
    <>
      <ScreenHeader
        title="רכישת שובר מתנה"
        action={
          <button className="btn btn--ghost" onClick={() => navigate("/vouchers")}>
            חזרה
          </button>
        }
      />

      {v && (
        <div className="card">
          <div className="read-row">
            <span className="muted">שובר</span>
            <span>{v.name}</span>
          </div>
        </div>
      )}

      <div className="card">
        <ClientPicker
          label="קונה (מי שמשלמת)"
          clientId={buyer.clientId}
          clientName={buyer.clientName}
          onChange={setBuyer}
        />
      </div>

      <div className="card">
        <label className="muted" style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
          מקבלת השובר
        </label>
        <div className="seg">
          <button
            className={"seg__btn" + (recipMode === "existing" ? " on" : "")}
            onClick={() => setRecipMode("existing")}
          >
            לקוחה קיימת
          </button>
          <button
            className={"seg__btn" + (recipMode === "new" ? " on" : "")}
            onClick={() => setRecipMode("new")}
          >
            הוספה מהירה
          </button>
        </div>

        {recipMode === "existing" ? (
          <ClientPicker
            label="חיפוש מקבלת"
            allowCasual={false}
            clientId={recipient.clientId}
            clientName={recipient.clientName}
            onChange={setRecipient}
          />
        ) : (
          <>
            <div className="row-2">
              <div className="field">
                <label>שם פרטי</label>
                <input
                  value={newClient.firstName}
                  onChange={(e) => setNew({ firstName: e.target.value })}
                />
              </div>
              <div className="field">
                <label>שם משפחה</label>
                <input
                  value={newClient.lastName}
                  onChange={(e) => setNew({ lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="row-2" style={{ marginBottom: 0 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>טלפון (לשליחת השובר)</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={newClient.phone}
                  onChange={(e) => setNew({ phone: e.target.value })}
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>אימייל (לשליחת השובר)</label>
                <input
                  type="email"
                  dir="ltr"
                  value={newClient.email}
                  onChange={(e) => setNew({ email: e.target.value })}
                />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
              תיווצר כרטיסיית לקוחה חדשה למקבלת, יחד עם הרכישה.
            </p>
          </>
        )}

        {sameClient && (
          <p className="warn-text">⚠ הקונה והמקבלת הן אותה לקוחה (ניתן להמשיך).</p>
        )}
      </div>

      <div className="card">
        <div className="row-2">
          <div className="field">
            <label>סכום השובר (₪)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label>תאריך תשלום</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>בתוקף עד (אופציונלי — ריק = ללא תוקף)</label>
          <DateField
            value={expiryDate}
            onChange={setExpiryDate}
            fromYear={thisYear}
            toYear={thisYear + 10}
          />
          {expiryDate && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 8 }}
              onClick={() => setExpiryDate("")}
            >
              נקה תאריך
            </button>
          )}
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
        הרכישה תיצור הכנסה של {formatILS(amountNum)} על {buyerName || "הקונה"} ויתרת זיכוי של{" "}
        {formatILS(amountNum)} בחשבון {recipientDisplay || "המקבלת"}.
      </div>

      <div className="save-row">
        <button className="btn" disabled={saving || !canSave} onClick={confirmPurchase}>
          {saving ? "שומרת…" : "אישור רכישה"}
        </button>
      </div>
    </>
  );
}
