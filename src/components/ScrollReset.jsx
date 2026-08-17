import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// כל מסך נפתח מלמעלה — איפוס גלילה במעבר בין מסכים (דרישת ניווט גלובלית)
export default function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
