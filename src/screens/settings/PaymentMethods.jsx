import NameListEditor from "./NameListEditor";

export default function PaymentMethods() {
  return (
    <NameListEditor
      docKey="paymentMethods"
      title="אמצעי תשלום"
      itemLabel="שם אמצעי התשלום"
      addLabel="הוספת אמצעי תשלום"
      defaults={["מזומן", "אשראי", "ביט", "אחר"]}
    />
  );
}
