# Daniel Skin Care — תוספת PRD: פאזה 4 (עדכון סטטוס #2)

**מסמך זה מחליף את `Daniel-skin-care_PRD-addendum-phase4-status.md` הקודם.** הוא נכתב אחרי שהתקבל `Daniel-skin-care_Phase4-plan.md` המלא — מקור האמת לפרטי המימוש של כל סעיפי פאזה 4 — ואחרי סבב בדיקה מפורש שהשווה את מה שבוצע בפועל מול אותו מסמך, מצא כמה פערים אמיתיים, ותיקן אותם. אינו מחליף את `Daniel-skin-care_PRD.txt` או את `Daniel-skin-care_PRD-addendum-features.md` (מילסטון 3) — שניהם עדיין בתוקף במלואם.

**סטטוס נכון לחתך הנוכחי:** סעיפים 2, 3, 4, 5, 6, 7, 8 **הושלמו והוטמעו**; סעיף 9 **הושלם ברובו** — כולל המשך Business.jsx — לפי אודיט per-consumer שהתוכנית עצמה דורשת, עם שני צרכנים שנותרו מוגבלים במכוון (BottomNav/Dashboard, ClientsList); סעיף 1 **טרם הותחל**.

---

## 📊 סטטוס בנייה — טבלת מעקב

| # | פיצ'ר | סטטוס |
|---|---|---|
| 1 | ניקוי שכפול `todayInput()` | ⏳ **טרם הותחל** — מחוץ להיקף הנוכחי, ללא תוכנית פעילה לטפל בו |
| 2 | אטומיות לסגירת תור (`CloseAppointment.jsx`) | ✅ בוצע והוטמע |
| 3 | `clientId` על הכנסות `series` | ✅ בוצע והוטמע |
| 4 | התראת מלאי נמוך בדשבורד | ✅ בוצע והוטמע |
| 5 | מעקב ביטולים (סיבה + ניתוח no-show) | ✅ **בוצע והוטמע במלואו** — כולל תיקון פער (ראו §5 למטה) |
| 6 | לקוחה הופנתה ע״י | ✅ בוצע והוטמע |
| 7 | קישור וואטסאפ | ✅ **בוצע והוטמע במלואו** — כולל תיקון 3 פערים (ראו §7 למטה) |
| 8 | גיבוי חכם | ✅ **בוצע והוטמע, במנגנון שונה מהמפורט במקור אך תואם לתוכנית** (ראו §8 למטה) |
| 9 | חלונות זמן לרשימות ללא הגבלה | ✅ **בוצע ברובו** — כולל המשך Business.jsx; 2 צרכנים נותרו מוגבלים במכוון (ראו §9 למטה) |

---

## 2. אטומיות לסגירת תור

ללא שינוי מהדיווח הקודם. שני מסלולי הסגירה ב-`CloseAppointment.jsx` (`confirmFromPackage`, `confirmDone`) עברו מ-2 כתיבות `repo` נפרדות ל-`writeBatch` יחיד דרך `useBatchRepo()`, באותו דפוס כמו `SeriesPurchase.jsx`/`ProductSell.jsx`.

## 3. `clientId` על הכנסות `series`

ללא שינוי. `SeriesPurchase.jsx` שומר `clientId: clientId || null` על רשומת ה-`income` בתוך אותו `batchRepo.commit`. רכישות סדרה שבוצעו לפני התיקון ימשיכו לא לכלול `clientId` — מגבלה על נתונים היסטוריים, לא באג פעיל.

## 4. התראת מלאי נמוך בדשבורד

ללא שינוי. `utils/reminders.js`'s `lowStockProducts(products)` + כרטיס התראה רביעי ב-`Dashboard.jsx`, לפי אותו קריטריון בדיוק כמו התגית ב-`Products.jsx`.

## 5. מעקב ביטולים (סיבה + ניתוח no-show)

### ✅ סטטוס: בוצע והוטמע במלואו

**קובץ חדש:** `src/utils/cancellations.js` — `CANCEL_REASONS` (לא הגיעה / ביטלה מראש / אחר), `CANCEL_REASON_LABELS` (מיפוי value→label), ו-`clientCancellationStats(appts, clientId)`.

**קבצים ששונו:**
- `src/context/ConfirmDialogProvider.jsx` — מומש בפועל `reasonOptions`: chips לבחירת סיבה (עיצוב `.chip`/`.chip--on` קיים, ללא CSS חדש), כפתור ראשי נעול עד לבחירה, ה-`Promise` מתפתר לערך שנבחר (לא ל-`true`). נתמך רק בשלב 1 של הדיאלוג, לא בתוך `secondConfirm`.
- `src/screens/appointments/CloseAppointment.jsx`, `src/screens/calendar/Calendar.jsx` — `cancelAppt()` מעביר `reasonOptions`, שומר `cancelReason` על התור, רושם `appointment_cancel` בלוג שינויים.
- `src/screens/business/AuditLog.jsx` — נוסף `appointment_cancel: "ביטול תור"` למפת התוויות.
- `src/screens/clients/ClientCard.jsx` — כרטיס "ביטולים: X מתוך Y תורים (Z%) · לא הגיעה: N" בטאב "רשימת תורים", מוצג רק כשיש ביטולים.

**שדה סכימה חדש:** `appointments.cancelReason` (string, אופציונלי — אחד מ-`no_show`/`cancelled_in_advance`/`other`).

### תיקון פער (נמצא באודיט מול Phase4-plan.md)

המימוש המקורי שמר את הסיבה רק בשדה `after: {cancelReason}` של רשומת הלוג. **תוקן:** `entity.desc` עצמו כולל כעת את התווית הקריאה של הסיבה (למשל "טיפול פנים · דנה כהן · לא הגיעה"), כך שהיא מופיעה ישירות בשורת הלוג ולא רק בתוך "אחרי: {...}" — ב-`CloseAppointment.jsx` וב-`Calendar.jsx` כאחד.

---

## 6. לקוחה הופנתה ע״י

ללא שינוי. שדה `clients.referredByClientId`, UI ב-`ClientBasicFields.jsx` (מוצג כשמקור הגעה = "המלצה"), תצוגה דו-כיוונית ב-`ClientCard.jsx`.

---

## 7. קישור וואטסאפ

### ✅ סטטוס: בוצע והוטמע במלואו

**קבצים ששונו:**
- `src/utils/invite.js` — `toWhatsappPhone()` (המרה לפורמט בינלאומי 972...) ו-`whatsappUrl(phone, text?)` (קישור wa.me; `text` אופציונלי — בלי טקסט פותח שיחה חופשית).
- `src/screens/clients/ClientBasicFields.jsx` — צ'קבוקס "מעוניינת לקבל זימון תור בוואטסאפ" מתחת לשדה הטלפון (שדה חדש: `clients.whatsappInvite`).
- `src/screens/appointments/AppointmentForm.jsx` — צ'קבוקס נפרד "שליחת זימון בוואטסאפ" (state: `sendInviteWhatsapp`, ברירת מחדל מ-`client.whatsappInvite`), וניווט אוטומטי למסך השליחה גם אם רק הוואטסאפ סומן.
- `src/screens/appointments/SendInvite.jsx` — כפתור נוסף "פתיחת הודעת WhatsApp" עם אותו תוכן כמו המייל (כולל קישור ליומן, ללא מחיר). הטלפון נשאב מכרטיס הלקוחה (`clients.find` לפי `appt.clientId`), לא רק מ-`appt.phone` — ראו "חריגה מכוונת" למטה. סימון `inviteSentWhatsapp` על התור.
- `src/screens/clients/ClientCard.jsx` — שורת "זימון בוואטסאפ: מעוניינת/לא מעוניינת" בטאב פרטי לקוחה.

**שדות סכימה חדשים:** `clients.whatsappInvite` (boolean), `appointments.inviteSentWhatsapp` (boolean).

### חריגה מכוונת, לטובה

המפרט המקורי הניח `disabled={!appt.phone}` ישירות על כפתור ה-WhatsApp ב-`SendInvite.jsx`. בפועל, `appt.phone` נשמר **רק** ללקוחה שהוזנה ידנית (ראו `AppointmentForm.jsx`) — ללקוחה קיימת (הרוב המכריע של התורים) השדה תמיד ריק, מה שהיה משאיר את כפתור הוואטסאפ מנוטרל כמעט תמיד הלכה למעשה. **תוקן:** `SendInvite.jsx` טוען גם את `clients` ומאתר את הטלפון לפי `appt.clientId` כשקיים, עם נפילה חזרה ל-`appt.phone`. בלי השינוי הזה הפיצ'ר היה כמעט חסר תועלת בפועל.

### תיקוני פער (נמצאו באודיט מול Phase4-plan.md)

1. **שכפול קוד:** `toWhatsappPhone` ניקה ספרות בעצמו במקום להשתמש ב-`normalizePhone` הקיים כבר ב-`clientUtils.js`. **תוקן** — עכשיו מייבא ומשתמש בו ישירות.
2. **כפתור חסר:** לא היה כפתור "שליחת הודעה בוואטסאפ" עצמאי (שיחה חופשית) בכרטיסיית לקוחה — רק שורת מצב של ההעדפה. **תוקן** — נוסף כפתור `💬 וואטסאפ` צמוד לשדה הטלפון ב-`ClientCard.jsx`'s Details tab, פותח `whatsappUrl(client.phone)` בלי טקסט.
3. **שם שדה מבלבל:** ה-state המקומי של הצ'קבוקס ב-`AppointmentForm.jsx` נקרא בתחילה `whatsappInvite` — זהה לשם שדה ההעדפה על הלקוחה עצמה. **תוקן** — שונה ל-`sendInviteWhatsapp` (מקביל למבנה הקיים `sendInvite`/`client.emailInvite`).
4. **הערה חסרה:** נוספה ב-`Invitation.jsx` הבהרה שהתוכן (גוף ההודעה) משמש גם את זימון ה-WhatsApp, שאין לו שדה "נושא" נפרד.

---

## 8. גיבוי חכם

### ✅ סטטוס: בוצע והוטמע, במנגנון שונה מהמפורט במקור

**המנגנון הסופי (אחרי תיקון):** תואם לכוונת התוכנית — מעקב אחר `updatedAt` המרבי בפועל בין הקולקציות המגובות, מול חותמת (watermark) של הגיבוי המוצלח האחרון — אך המימוש הראשון שנמסר היה שונה (דגל בוליאני שמסומן ישירות בכל כתיבה), ותוקן בסבב נפרד אחרי השוואה מול `Phase4-plan.md`.

**קבצים (גרסה סופית):**
- `src/data/backupWatermark.js` (קובץ חדש; מחליף את `data/backupDirty.js` שנמחק) — `BACKUP_COLLECTIONS` (הכנסות/הוצאות/לקוחות/חבילות — תואם ל-4 קריאות ה-`getAll` ב-`data/backup.js`), `maxUpdatedAt(collectionsByName)` (סורק את הרשומות הטעונות ומחזיר את ה-`updatedAt` הגבוה ביותר, תומך גם ב-Firestore Timestamp וגם במספר Date.now() מקומי), `readBackupWatermark()`/`writeBackupWatermark()`.
- `src/data/backupStatus.js` — נוסף `markBackupSkipped()` ושדה סטטוס שלישי `lastSkippedAt`, לצד `lastSuccessAt`/`lastErrorAt` הקיימים.
- `src/data/useAutoBackup.js` — `useAutoBackup()` נרשם עכשיו ל-4 הקולקציות המגובות דרך `useCollectionData` (משתף מנוי עם כל מסך אחר שכבר מנוי עליהן, כמו `BottomNav` על `income` — לא נוספת עלות רשת). `runBackupOnce(uid, ensureDriveToken, {force, currentMax})`: כש-`force=false` (כל הריצות האוטומטיות) ו-`currentMax <= watermark`, מדלג לגמרי על גישת Drive ורושם `markBackupSkipped()`. `force=true` (כפתור "גיבוי עכשיו") מתעלם מהבדיקה תמיד.
- `src/data/firestore.js`, `src/data/localStore.js` — **הוסרה** כל מודעות לגיבוי משכבת ה-`repo` (`useRepo`/`useBatchRepo` חזרו לצורתם הפשוטה — אינם צריכים "לדעת" על גיבוי כלל, הפרדת אחריות נקייה יותר מהגישה הקודמת).
- `src/screens/settings/Backup.jsx` — כפתור "גיבוי עכשיו" מעביר `force:true`; מוצגת שורת "בדיקה אחרונה: אין שינויים חדשים" כש-`lastSkippedAt` הוא האירוע העדכני ביותר.

**שדה localStorage חדש:** `dsc:driveBackupWatermark` (מחליף את `dsc:driveBackupDirty` שהוסר).

### תיקון פער (נמצא באודיט מול Phase4-plan.md)

הגרסה הראשונה השתמשה בדגל בוליאני (`markBackupDirty()` שנקרא מתוך `useRepo`/`useBatchRepo` בכל כתיבה לקולקציה מגובה) במקום מעקב `updatedAt` בפועל כפי שהתוכנית מפרטת. **תוקן במלואו** לפי התיאור למעלה — כולל מחיקת `data/backupDirty.js` הישן.

---

## 9. חלונות זמן לרשימות ללא הגבלה

### ✅ סטטוס: בוצע ברובו, לפי אודיט per-consumer

התוכנית עצמה מנחה לבדוק כל צרכן בנפרד לפני צמצום בפועל, ולבנות אותו סעיף אחרון בכוונה. האודיט שבוצע מצא ששני צרכנים ניתנים לצמצום בבטחה, וארבעה אינם — עם השלכה אמיתית של נכונות-נתונים אם יוגבלו בלי טיפול נוסף.

**קבצים חדשים/ליבה:**
- `src/data/firestore.js` — `useYearRangeCollectionData(name, dateField, year, {timestampField})` (מנוי חי לשנה קלנדרית בודדת), `useMultiYearCollectionData(name, dateField, years, {timestampField})` (איחוד כמה שנים, כל שנה = מנוי חי נפרד וממוזג — כך שגם רשומות "ישנות" שנטענו נשארות מסונכרנות בזמן אמת). מפתח ה-pooling הורחב ל-`${uid}:${name}:${year}`.
- `useYearRangeCollectionData` הורחב בהמשך (ראו Business.jsx למטה) לתמוך ב-`year: null` = "כל השנים" — נופל בחזרה למאגר המשותף הרגיל, כך שקריאת hook אחת מחליפה בין שנה בודדת ל"הכול" בלי שני מנויים במקביל.
- `src/data/localStore.js` — מקבילות מקומיות (סינון בזיכרון לפי שנה, ללא עלות שאילתה אמיתית).
- `src/data/index.js` — חשיפת שני ה-hooks.

**צרכנים שצומצמו בפועל:**

| צרכן | אוסף | טווח |
|---|---|---|
| `src/screens/business/AuditLog.jsx` | auditLog | ברירת מחדל: שנה נוכחית + קודמת (2 שנים), כפתור "טעני שנים קודמות" מרחיב בהדרגה |
| `src/screens/calendar/Calendar.jsx` | appointments, income | שנה אחת — תמיד השנה המוצגת כרגע ביומן (`cursor.getFullYear()`), מתעדכן אוטומטית בניווט |
| `src/screens/business/Business.jsx` — `SummaryTabs()` | income, expenses | ללא שינוי בהיקף — ממשיך לספק היסטוריה מלאה ל-`Summary()` (שנשארה בית-לבית זהה); רק זז מ-`Business()` לכאן, נטען אך ורק כשטאב "סיכום" פעיל |
| `src/screens/business/Business.jsx` — `IncomeTab`/`ExpenseTab` | income, expenses | ברירת מחדל: השנה הנוכחית בלבד, דרך בורר חדש `YearScopeNav` ("שנה ‹ N › \| כל השנים"); "כל השנים" משחזר את ההתנהגות המלאה המקורית במדויק |

**מגבלה מודעת ב-Calendar.jsx:** מעבר ל"תצוגת רשימה" (checkbox "הצג עבר") מציג רק עבר בתוך אותה שנה קלנדרית שמוצגת כרגע — לא היסטוריה מלאה כמו קודם. ניווט לשנה אחרת נעשה דרך תצוגת "לוח שנה" (cal-nav).

**צרכנים שנותרו במכוון ללא הגבלה (טבלת האודיט):**

| צרכן | אוסף | סיבת האי-צמצום |
|---|---|---|
| `BottomNav.jsx` + `Dashboard.jsx` | appointments (`pendingClosureAppts`), income (`unverifiedIncome`) | תור/הכנסה ישנים שנשכחו הם בדיוק מה שהבאדג' אמור לתפוס — חלון זמן יסתיר אותם, לא רק "יאט פחות" |
| `ClientsList.jsx` (`inactiveClients`) | appointments | מחשב "כמה חודשים מאז הביקור האחרון"; לקוחה שלא ביקרה 3 שנים תיראה כאילו "מעולם לא ביקרה" אם ההיסטוריה חתוכה |

### המשך Business.jsx — הושלם

**גילוי אדריכלי תוך כדי:** `Business()` המקורי שאב `income`/`expenses` פעם אחת ברמה העליונה, משותף לכל שלושת הטאבים — כולל "סיכום", שחייב היסטוריה מלאה (`Summary()` עצמה אסורה לשינוי, לפי דרישת ה-addendum). כלומר הוספת בורר-שנה רק ל-Income/Expense לא הייתה חוסכת דבר בפועל, כל עוד השאיבה המלאה עדיין רצה תמיד בשביל "סיכום". הפתרון: הסרת השאיבה מ-`Business()` לגמרי — כל טאב שואב בעצמו, רק כל עוד הוא מורכב (mounted).

**קבצים ששונו:**
- `src/data/firestore.js` / `src/data/localStore.js` — `useYearRangeCollectionData` תומך כעת ב-`year: null`.
- `src/screens/business/Business.jsx` — `SummaryTabs()` (לא `Summary()` עצמה) עברה לשאוב את ההיסטוריה המלאה ולהזין את `Summary` בדיוק כמו קודם; `IncomeTab`/`ExpenseTab` קיבלו את `YearScopeNav` החדש.

**נבדק מול `YearMonthNav.jsx` הקיים ולא נעשה בו שימוש חוזר במכוון** — הוא בורר "חודשי/שנתי" *בתוך* שנה שכבר נטענה (למסכי "לפי מוצר"/"לפי לקוחה"), לא בורר "איזו שנה לטעון מול הכול" — צורך שונה מספיק כדי להצדיק רכיב נפרד וממוקד (`YearScopeNav`) במקום לעוות קיים.

**תיקון נכונות מכוון:** `IncomeTab` מגיע כברירת מחדל ל-"כל השנים" (לא לשנה הנוכחית) כשהניווט אליו הוא דרך `?filter=unpaid` (deep-link מהדשבורד/בר התחתון) — הכנסה לא-מאומתת עשויה להיות משנה קודמת, וברירת מחדל לשנה הנוכחית הייתה "מאבדת" בשקט את הרשומה שאותה בדיוק ביקשו למצוא.

---

## סיכום שינויי מודל הנתונים (Firestore) — נכון לחתך הנוכחי

| קולקציה | שדה | סטטוס |
|---|---|---|
| `appointments` | `cancelReason` (string, אופציונלי: `no_show`/`cancelled_in_advance`/`other`) | ✅ נכתב בפועל (§5) |
| `appointments` | `inviteSentWhatsapp` (boolean) | ✅ נכתב בפועל (§7) |
| `clients` | `whatsappInvite` (boolean) | ✅ נכתב בפועל (§7) |
| `income` (source:"series") | `clientId` (string/null) | ✅ נכתב בפועל (§3) |
| `clients` | `referredByClientId` (string, אופציונלי) | ✅ נכתב בפועל (§6) |

**אין קולקציות חדשות.** אין שינוי נדרש ב-`firestore.rules` (אותו דפוס `users/{uid}/{document=**}` הקיים).

**localStorage — מפתחות שהוחלפו:** `dsc:driveBackupDirty` (זמני, §8 גרסה ראשונה) → **נמחק**, הוחלף ב-`dsc:driveBackupWatermark` (§8 גרסה סופית).

---

## תיעוד פערים שנמצאו ותוקנו (QA מול Phase4-plan.md)

כל הפערים שפורטו בסעיפים 5/7/8 למעלה נמצאו בסבב QA ייעודי שהשווה את המימוש שנמסר קודם מול `Phase4-plan.md` המלא, אחרי שהתברר שהתשובות הראשוניות ניתנו בלי גישה למסמך. תוקנו במלואם באותו סבב, וכל הקבצים המתוקנים כבר נמסרו. §9 לא נמצא בו פער — המימוש תאם את הצעת התוכנית מלכתחילה (רק היקף היישום צומצם במכוון, כמתועד למעלה).

## רכיבים משותפים חדשים בסבב זה

- ✅ `src/utils/cancellations.js` — `CANCEL_REASONS`/`CANCEL_REASON_LABELS`/`clientCancellationStats` (§5).
- ✅ `ConfirmDialogProvider.jsx`'s `reasonOptions` — הרחבת המנגנון הקיים (§5).
- ✅ `toWhatsappPhone`/`whatsappUrl` ב-`utils/invite.js` (§7).
- ✅ `src/data/backupWatermark.js` — מחליף את `backupDirty.js` (§8).
- ✅ `useYearRangeCollectionData`/`useMultiYearCollectionData` ב-`data/firestore.js`/`data/localStore.js` (§9).
- ✅ `YearScopeNav` (רכיב פנימי ב-`Business.jsx`) — בורר "שנה ‹ N › | כל השנים" ל-`IncomeTab`/`ExpenseTab` (§9 המשך).

## עדיין לא נוגעו כלל

- **§1 — ניקוי שכפול `todayInput()`** — לא הותחל, כמתועד מקודם.
