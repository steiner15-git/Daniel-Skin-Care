// סכימת "גיליון אבחון עור" — מותאמת לשאלון (חלק א' אנמנזה, חלק ב' דיאגנוזה של העור).
// סוגי שדות:
//   yesNoText  → { yes: bool, text: string }   (עם textLabel לפירוט מותנה)
//   text       → מחרוזת
//   finding    → { main: string, ...extras }    (בחירה עיקרית + שדות פירוט מותנים כשלא "אין")
//   skinTypes  → עד 2 סוגי עור (מערך)

export const SKIN_TYPES = [
  "עור אקנתי",
  "עור שמן",
  "עור מעורב",
  "עור יבש",
  "עור רגיל",
];

const YESNO = ["יש", "אין"];

export const DIAGNOSIS_SECTIONS = [
  {
    key: "health",
    title: "אנמנזה · מצב בריאותי",
    fields: [
      { key: "slowHealing", type: "yesNoText", label: "החלמה איטית של פצעים וצלקות" },
      { key: "skinIrritation", type: "yesNoText", label: "גירוי בעור" },
      { key: "allergy", type: "yesNoText", label: "אלרגיה" },
      { key: "pregnancy", type: "yesNoText", label: "בהריון" },
      { key: "postpartum", type: "yesNoText", label: "לאחר לידה" },
      { key: "fertility", type: "yesNoText", label: "בטיפולי פוריות" },
      { key: "diabetes", type: "yesNoText", label: "סוכרת", textLabel: "מאוזנת עם תרופות?" },
      { key: "heart", type: "yesNoText", label: "מחלת לב" },
      { key: "pacemaker", type: "yesNoText", label: "קוצב לב / מסתם מלאכותי" },
      { key: "bloodPressure", type: "yesNoText", label: "לחץ דם גבוה / נמוך" },
      { key: "thyroid", type: "yesNoText", label: "חוסר איזון בבלוטת התריס" },
      {
        key: "infectious",
        type: "yesNoText",
        label: "הרפס / הפטיטיס / אפילפסיה / נשא H.I.V",
      },
      { key: "metal", type: "yesNoText", label: "מתכת בגוף" },
      { key: "dental", type: "yesNoText", label: "כתרים / תותבות / שתלים בשיניים" },
      { key: "otherDisease", type: "yesNoText", label: "מחלה אחרת", textLabel: "פרט/י" },
    ],
  },
  {
    key: "history",
    title: "היסטוריה רפואית ותכשירים",
    fields: [
      { key: "acnePast", type: "yesNoText", label: "אקנה בעבר" },
      { key: "roaccutaneNow", type: "yesNoText", label: "שימוש ברואקוטן (בהווה)" },
      { key: "roaccutanePast", type: "yesNoText", label: "רואקוטן בעבר", textLabel: "מתי?" },
      { key: "retinA", type: "yesNoText", label: "שימוש ברטין A" },
      {
        key: "prescriptionTopical",
        type: "yesNoText",
        label: "תכשיר מרשם רפואי על העור",
        textLabel: "איזה?",
      },
      { key: "skinDiseasePast", type: "yesNoText", label: "מחלות עור בעבר", textLabel: "פרט/י" },
      { key: "pills", type: "yesNoText", label: "גלולות למניעת הריון" },
      { key: "dailyCare", type: "text", label: "תכשירי טיפוח יומיומיים" },
    ],
  },
  {
    key: "lifestyle",
    title: "הרגלים וסגנון חיים",
    fields: [
      { key: "smoking", type: "yesNoText", label: "עישון", textLabel: "שנים / מס' ליום" },
      { key: "sunExposure", type: "text", label: "רמת חשיפה לשמש (עיסוק / הרגלים / תחביבים)" },
    ],
  },
  {
    key: "observation",
    title: "דיאגנוזה · ממצאים בעת הסתכלות",
    fields: [
      { key: "dermographism", type: "finding", label: "דרמוגרף-טסט (רגישות למגע)", options: YESNO },
      { key: "skinTone", type: "finding", label: "גוון העור", options: ["אחיד", "לא אחיד"] },
      {
        key: "skinColor",
        type: "finding",
        label: "צבע העור",
        options: ["אדום", "בהיר", "כהה", "צהבהב"],
      },
      {
        key: "pores",
        type: "finding",
        label: "נקבוביות",
        options: ["סגורות", "מעט פתוחות", "פתוחות"],
      },
      {
        key: "comedones",
        type: "finding",
        label: "קומדונים",
        options: YESNO,
        extras: [{ key: "area", label: "אזור" }],
      },
      {
        key: "wrinkles",
        type: "finding",
        label: "קמטים",
        options: YESNO,
        extras: [
          { key: "type", label: "סוג", options: ["מימיקה", "גיל"] },
          { key: "area", label: "אזור" },
        ],
      },
    ],
  },
  {
    key: "palpation",
    title: "ממצאים בעזרת מישוש",
    fields: [
      { key: "muscleTone", type: "finding", label: "טונוס השריר", options: ["תקין", "בינוני", "נמוך"] },
      { key: "turgor", type: "finding", label: "טורגור העור", options: ["תקין", "בינוני", "ירוד"] },
      { key: "thickness", type: "finding", label: "עובי העור", options: ["דק", "בינוני", "עבה"] },
      {
        key: "touch",
        type: "finding",
        label: "מגע",
        options: ["גס", "מחוספס", "מעט מחוספס", "חלק"],
      },
    ],
  },
  {
    key: "lesions",
    title: "רישום נגעים בעור",
    fields: [
      {
        key: "papules",
        type: "finding",
        label: "פפולות",
        options: YESNO,
        extras: [{ key: "amount", label: "כמות" }, { key: "area", label: "אזור" }],
      },
      {
        key: "pustules",
        type: "finding",
        label: "פוסטולות",
        options: YESNO,
        extras: [{ key: "amount", label: "כמות" }, { key: "area", label: "אזור" }],
      },
      {
        key: "scars",
        type: "finding",
        label: "צלקות",
        options: YESNO,
        extras: [{ key: "type", label: "סוג" }],
      },
      { key: "milia", type: "finding", label: "מיליומים", options: YESNO },
      {
        key: "pigmentation",
        type: "finding",
        label: "פיגמנטציה",
        options: YESNO,
        extras: [{ key: "type", label: "סוג" }],
      },
      {
        key: "nevi",
        type: "finding",
        label: "נבוסים",
        options: YESNO,
        extras: [{ key: "color", label: "צבע" }],
      },
      { key: "hyperemia", type: "finding", label: "היפרמיה", options: YESNO },
      { key: "telangiectasia", type: "finding", label: "טלאנגיאקטזיה / קופרוז", options: YESNO },
      { key: "hirsutism", type: "finding", label: "שיעור יתר", options: YESNO },
      {
        key: "otherLesions",
        type: "finding",
        label: "נגעים אחרים",
        options: YESNO,
        extras: [{ key: "type", label: "סוג" }],
      },
    ],
  },
  {
    key: "final",
    title: "דיאגנוזה סופית",
    fields: [
      { key: "skinTypes", type: "skinTypes", label: "סוג עור (עד 2)" },
      { key: "generalNote", type: "textarea", label: "הערה (מצב עור)" },
    ],
  },
];
