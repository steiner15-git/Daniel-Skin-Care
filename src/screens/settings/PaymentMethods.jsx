import NameListEditor from "./NameListEditor";
import { DEFAULT_PAYMENT_METHODS } from "../../data/useListSettings";

export default function PaymentMethods() {
  return (
    <NameListEditor
      docKey="paymentMethods"
      title="אמצעי תשלום"
      itemLabel="שם אמצעי התשלום"
      addLabel="הוספת אמצעי תשלום"
      defaults={DEFAULT_PAYMENT_METHODS}
    />
  );
}
