import { useMemo } from "react";
import { useSettingDoc } from "./index";
import { normalizeYears } from "../utils/vat";

// הגדרות מע"מ לפי שנת מס (users/{uid}/settings/vat → { years: [...] }).
// years הוא מערך מנורמל וממוין, ויציב (אותו reference כל עוד התוכן לא השתנה)
// — כדי שצרכנים עם useMemo/useEffect לא יחושבו מחדש בכל רינדור (במצב מקומי
// useSettingDoc מחזיר אובייקט חדש בכל קריאה).
export function useVatSettings() {
  const { data, loading, save } = useSettingDoc("vat");
  const key = JSON.stringify(data?.years || []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const years = useMemo(() => normalizeYears(data?.years), [key]);
  return { years, loading, save, doc: data };
}
