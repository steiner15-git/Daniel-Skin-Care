# Daniel Skin Care — דוח Spec Compliance
**מול:** `Daniel-skin-care_PRD.txt` + `Daniel-skin-care_PRD-addendum-features.md`
**בוצע על בסיס:** קבצי הקוד שהועלו לפרויקט (הקבצים המצורפים לשיחה זו, לא הרפו המלא)

---

## תמצית מנהלים

הקוד **תואם באופן מלא** לשני מסמכי הדרישות — ה-PRD המקורי ותוספת מילסטון 3. לא נמצאה סטייה מהותית מהמפרט שאינה כבר מתועדת ומוסברת באדנדום עצמו.

**הממצא המשמעותי ביותר בבדיקה הזו:** שלושה מתוך ארבעת פערי ה-QA ה"קריטיים" שתועדו בזיכרון (מהאודיט הקודם) **כבר תוקנו בפועל בקוד שהועלה**, אך התיעוד לא עודכן בהתאם. פירוט למטה בסעיף 4.

---

## 1. PRD מקורי (`Daniel-skin-care_PRD.txt`) — תאימות

| תחום | סטטוס | הערות |
|---|---|---|
| ארכיטקטורה (Vite+React, Firebase Auth, Firestore היברידי, Drive `drive.file`, Netlify) | ✅ | תואם `firebase.js`, `data/index.js`, `data/firestore.js` |
| ללא AI, ללא שרת רקע, מסלול חינמי בלבד | ✅ | אין קריאות AI, אין Cloud Functions בקוד |
| גיבוי אוטומטי ל-Drive כקובץ Excel יחיד, מתעדכן במקום | ✅ | `data/backup.js` — PATCH לאותו `FILE_ID_KEY`, לא צובר קבצים |
| בר תחתון קבוע + איפוס גלילה בכל מסך | ✅ | `AppShell.jsx`, `ScrollReset.jsx`, `global.css .bottom-nav{position:fixed}` |
| מסך בית: לו"ז יומי, ממתינים לסגירה (מוגבל ל-3 + "הצג הכל"), 4 כפתורי פעולה מהירה בדיוק (הכנסה/הוצאה/סדרות/מוצרים, ללא "תור חדש"/"יומן"/"הוספת לקוחה") | ✅ | `Dashboard.jsx` תואם אחד-לאחד, כולל ההחרגות המפורשות |
| לקוחות: שלב 1+2, צ'קבוקס זימון מיד מתחת לאימייל, אזהרת טלפון כפול לא-חוסמת, הערות פנימיות | ✅ | `AddClient.jsx`, `ClientBasicFields.jsx` |
| טופס אבחון עור (סכימה מלאה, עדכון דורס ללא היסטוריה) | ✅ | `diagnosisSchema.js`, `DiagnosisForm.jsx`, `ClientDiagnosis.jsx` |
| ארכיון לקוחות (soft-delete + שחזור + מחיקה סופית עם אישור כפול) | ✅ | `ClientArchive.jsx` |
| כרטיסיית לקוחה מטאבים, מצב-צפייה→עריכה→אישור | ✅ | `ClientCard.jsx` (כיום 4 טאבים — ראו סעיף 2, טאב "מוצרים" נוסף באדנדום) |
| אלבום: `Clinic_Photos/{שם_לקוחה}/`, מטא-דאטה בלבד ב-Firestore, ללא preview עד לחיצה | ✅ | `data/photos.js`, `ClientAlbum.jsx`, `AllPhotos.jsx` |
| תיאום תור: תאריך/שעה/משך בשורות נפרדות, התנגשות/שעות-פעילות כאזהרה בלבד | ✅ | `AppointmentForm.jsx` |
| שליחת זימון: `mailto:` + קישור "הוסף ליומן Google" מוטבע, ללא מחיר, נגיש שוב בכל עת | ✅ | `utils/invite.js`, `SendInvite.jsx` |
| סגירת תור → הכנסה רק לאחר "אישור ביצוע"; "שולם" ידני בלבד; ביטול ללא הכנסה | ✅ | `CloseAppointment.jsx` |
| יומן: לוח שנה + רשימה, סינון/מיון, עריכה/ביטול/שליחה חוזרת | ✅ | `Calendar.jsx` |
| שדות שעה 24h בכל האפליקציה (ללא AM/PM) | ✅ | `TimeField.jsx` בשימוש עקבי |
| ניהול עסק: סדר שדות הכנסה (סכום/תאריך→חשבונית→אמצעי תשלום), סדר שדות הוצאה (תאריך→תיאור→שם עסק→חשבונית→לפני מע"מ→מע"מ→סה"כ→קטגוריה) | ✅ | `IncomeForm.jsx`, `ExpenseForm.jsx` |
| הכנסה "שולם" לא ניתנת למחיקה עד הסרת הסימון; הוצאה חופשית לעריכה/מחיקה | ✅ | `Business.jsx` `IncomeTab.remove()` בודק `r.paid` |
| הוצאה קבועה (חודשי/שנתי), רישום אידמפוטנטי לפי `lastPosted` | ✅ | `useRecurringExpenses.js` |
| תמונת חשבונית: ללא preview, תגית "📎 תמונה", סינון עם/בלי | ✅ | `ReceiptField.jsx` |
| ייצוא Excel שנתי עם עמודת "סוג" ו"מספר חשבונית" | ✅ | `utils/exportXlsx.js` |
| הגדרות: 6 תתי-מסכים מהמפרט המקורי + "תזכורות" (הרחבה מהאדנדום, ראו §2) | ✅ | `SettingsHome.jsx` |
| לוג שינויים — מבנה ופעולות נרשמות | ✅ | `AuditLog.jsx`, שימוש עקבי ב-`useAuditLog()` |
| סדרות ומוצרים (מילסטון 2): רב-טיפול, תוקף כתאריך, מלאי+סף התראה, חיוב מחבילה | ✅ | `Series.jsx` (DefinitionsTab), `Products.jsx` (InventoryTab), `SeriesPurchase.jsx`, `ProductSell.jsx` |
| פרטיות פיננסית מוחלטת כלפי הלקוחה (אין מחיר בזימון) | ✅ | `inviteTokens()`/`SendInvite.jsx` לא כוללים מחיר |
| Firestore Security Rules — בידוד לפי `uid` | ✅ | `firestore.rules` |

**סטטוס PRD מקורי: תאימות מלאה. לא נמצא פער.**

---

## 2. תוספת PRD — מילסטון 3 (`Daniel-skin-care_PRD-addendum-features.md`) — תאימות

כל 15 הפיצ'רים + מצב קליניקה + מודל האישור/Undo, כפי שמתועדים בטבלת הסטטוס באדנדום, אומתו מול הקוד בפועל:

| # | פיצ'ר | קובץ/ים שאומתו | סטטוס |
|---|---|---|---|
| — | מצב קליניקה | `ClinicModeProvider.jsx`, `ScreenHeader.jsx` (אייקון עין), `global.css .sensitive` | ✅ |
| 6 | אישור מותאם + Undo | `ConfirmDialogProvider.jsx`, `ToastProvider.jsx` — בשימוש עקבי בכל מסכי המחיקה | ✅ |
| 1+2 | רענון טוקן Drive + התאוששות | `useDriveUpload.js`, בשימוש ב-`ReceiptField`, `ClientAlbum`, `AllPhotos` | ✅ |
| 9 | תזכורות (מסמך מאוחד `settings/reminders`) | `useReminderSettings.js` (fallback שקט מהמסמך הישן, `useMemo` נכון) | ✅ |
| 10 | באדג'ים בניווט | `BottomNav.jsx` — קורא `useReminderSettings` + `utils/reminders.js` | ✅ |
| 5 | סטטוס תשלום בכרטיסיית לקוחה | `ClientCard.jsx` `ApptList` — `chargedFromPackage` לתורי עבר, `clientPackageId` לעתידיים (התיקון המתועד) | ✅ |
| 13 | טאב "רכישות" | `Series.jsx` `PurchasesTab` — סינון/מיון/ברירת מחדל "פעילה+פקעה" | ✅ |
| 14 | טאב "מכירות" | `Products.jsx` `SalesTab` — מסונן `source:"product"` | ✅ |
| 15 | טאב "מוצרים" בכרטיסיית לקוחה | `ClientCard.jsx` `ProductsTab` | ✅ |
| 12 | התראת פקיעת חבילה | `utils/reminders.js` `expiringPackages()`, `Dashboard.jsx`, `Series.jsx` (`?tab=purchases&filter=expiring`) | ✅ |
| 3+4 | סיכום מורחב | `SummaryByProduct.jsx`, `SummaryByClient.jsx`, `StackedBarChart.jsx`, `incomeCategorize.js` | ✅ |
| 7 | הגדרות → גיבוי | `Backup.jsx`, `backupStatus.js`, `FILE_ID_KEY` מיוצא | ✅ |
| 8 | Skeleton loading | `Skeleton.jsx` בשימוש ב-7 המסכים המתועדים | ✅ |
| 11 | חיפוש גלובלי | `GlobalSearch.jsx` — 4 קטגוריות בסדר הנכון, לקוחות בארכיון כלולות (כמתועד) | ✅ |

כל הסטיות המכוונות המתועדות באדנדום (למשל `StackedBarChart.jsx` נפרד מ-`BarChart.jsx`, מנגנון "מקטע בהיר" כאומדן, Top-10 שנתי קבוע ב"לפי לקוחה") — **אומתו כתואמות לתיאור** בקוד בפועל.

**שדה `income.clientId`:** אומת ב-`ProductSell.jsx` (`clientId: clientId || null`) — בדיוק כפי שמתועד כתיקון-דיעבד. הכנסות `source:"series"` אכן לא כוללות `clientId` ישיר, כמתועד.

**סטטוס אדנדום: תאימות מלאה לכל 15 הפיצ'רים.**

---

## 3. פריט פתוח יחיד מהזיכרון — לא ניתן לאימות

**מחיקת `src/screens/settings/PaymentVerification.jsx`** (קובץ מת, הוחלף ע"י `Reminders.jsx`) — הקובץ הזה **לא נכלל** בקבצים שהועלו לשיחה זו, כך שאי-אפשר לאשר או להפריך אם נמחק בפועל. `App.jsx` ו-`SettingsHome.jsx` הנוכחיים אינם מפנים אליו כלל (route `settings/reminders` בלבד קיים) — כך שגם אם הקובץ עדיין קיים בדיסק, הוא אכן "מת" (unreachable). **מומלץ:** ודאי בגרסת הרפו המקומית שהקובץ נמחק בפועל; אם לא — זו עדיין הפעולה היחידה שנותרה פתוחה מרשימת ה-QA.

---

## 4. ⚠️ ממצא מרכזי: 3 מתוך 4 פערי-QA "קריטיים" בזיכרון כבר תוקנו בקוד

בבדיקת הקבצים שהועלו מול התיעוד הקיים בזיכרון (מאודיט QA קודם), התברר שהתיעוד **מיושן** — הקוד בפועל כבר כולל את התיקונים:

### 4.1 ✅ תוקן בפועל: Firestore read-quota / subscriptions כפולים ב-BottomNav
הזיכרון קבע: *"BottomNav.jsx פותח מנויי onSnapshot עצמאיים... מומלץ AppDataProvider משותף."*
**בפועל:** `data/firestore.js` מכיל כעת מנגנון **subscription pooling** מלא (`collectionRegistry`, `subscribeShared`) — כל קריאה ל-`useCollectionData(name)` ללא constraints (המקרה השכיח בכל האפליקציה) חולקת מנוי `onSnapshot` יחיד לכל קולקציה/uid, ללא קשר לכמה קומפוננטות קוראות לה בו-זמנית (BottomNav + Dashboard + Business וכו'). המנוי נסגר אוטומטית כש-subscribers מגיע ל-0. זה בדיוק הפתרון שהומלץ — רק שכבר מומש, לא כ-Context נפרד אלא כ-registry מודולרי בתוך `firestore.js` עצמו (גישה שקולה, אולי אף פשוטה יותר).

### 4.2 ✅ תוקן בפועל: סינון בצד לקוח ב-ClientCard
הזיכרון קבע: *"ClientCard.jsx מביא את כל קולקציית appointments ומסנן בצד הלקוח."*
**בפועל:** `ClientCard.jsx` משתמש כעת ב-`useCollectionData("appointments", where("clientId", "==", id))` — שאילתה מסוננת בצד השרת. יש הערת קוד מפורשת בקובץ שמסבירה את הבחירה (query עם constraint לא משתתף ב-pool המשותף, וזה תקין כי מדובר בשאילתה ייחודית לכל לקוחה).

### 4.3 ✅ תוקן בפועל: try/catch לא עקבי בזרימות אישור
הזיכרון קבע: *"try/catch לא עקבי ב-CloseAppointment.jsx / SeriesPurchase.jsx / ProductSell.jsx — כתיבה כושלת משאירה UI תקוע."*
**בפועל:** שלושת הקבצים כוללים כעת `try/catch` מלא סביב פעולות ה-Firestore, עם שחרור `setSaving(false)` והצגת שגיאה דרך `confirmDialog({alertOnly:true})`. יתרה מזאת — **סעיף 4.7.1 בהוראות הפרויקט עצמן** (Project Instructions) כבר מתעד את שלושת הקבצים הללו כ**"ה-reference pattern"** לטיפול בשגיאות. כלומר: לא רק שהתיקון בוצע, הוא גם עוגן כתקן מחייב לקוד עתידי.

### 4.4 ⚠️ עדיין פתוח (מבני, לא "תוקן" באותו אופן): כתיבות לא-אטומיות רב-שלביות
הזיכרון קבע: *"רצפי כתיבה רב-שלביים ב-ProductSell.jsx ו-SeriesPurchase.jsx מסתכנים ברשומות יתומות."*
**בפועל:** הסיכון המבני עדיין קיים באופן עקרוני — `ProductSell.confirmSale()` מבצע `incomeRepo.add()` ואז `productRepo.update()` (ניכוי מלאי) כשתי קריאות נפרדות; אם הראשונה מצליחה והשנייה נכשלת, נוצרת רשומת הכנסה בלי ניכוי מלאי תואם. `SeriesPurchase.confirmPurchase()` דומה (`incomeRepo.add()` ואז `packageRepo.add()`). **מה כן תוקן:** הכשל כעת *מדווח* למשתמשת (בזכות ה-try/catch מ-§4.3) במקום להיכשל בשקט — כך שלפחות יש מודעות לכשל ברגע שהוא קורה, גם אם השחזור/ניקוי נשאר ידני. תיקון מלא (אטומיות אמיתית) דורש Firestore batched writes/transactions, ששני הקבצים עדיין לא משתמשים בהם.
**המלצה:** זהו הפריט האמיתי היחיד שנותר "פתוח" מרשימת ה-QA המקורית ברמת ארכיטקטורה (לא רק תיעוד). עדיפות בינונית — הסיכון בפועל נמוך (משתמשת יחידה, כשלי רשת נדירים), אך אם רוצים לסגור אותו לגמרי, הפתרון הוא לעטוף כל אחת משתי הזרימות ב-`writeBatch` יחיד של Firestore.

---

## 5. שאר פריטי ה-QA מהזיכרון — סטטוס

| ממצא | סטטוס נוכחי |
|---|---|
| `todayInput()` משוכפל ב-9 קבצים | ⚠️ עדיין לא טופל — גם האדנדום עצמו מתעד זאת כחוב ידוע, לא בהיקף אף פיצ'ר. עדיפות נמוכה, כפי שסעיף 4.6 בהוראות הפרויקט קובע במפורש ("Ask before large refactors"). |
| תיעוד מיושן (סעיף 4.7 בהוראות הפרויקט מתאר `confirm()` ילידי) | ✅ **לא רלוונטי יותר** — סעיף 4.7 בהוראות הפרויקט הנוכחיות (כפי שמופיע בהקשר הזה) כבר מתאר נכון את `ConfirmDialogProvider`/`ToastProvider` הבלעדיים, כולל תת-סעיף 4.7.1 על טיפול בשגיאות. אין פה פער בין תיעוד לקוד. |

---

## 6. מסקנות והמלצות

1. **אין פערי Spec Compliance מהותיים** בין הקוד לשני מסמכי הדרישות — כל מה שנדרש נבנה, וכל סטייה מהמפרט המילולי מתועדת ומנומקת באדנדום עצמו.
2. **יש לעדכן את זיכרון הפרויקט (userMemories):** שלושה מארבעת פערי ה-QA ה"קריטיים" (subscription pooling, שאילתת ClientCard, try/catch) כבר נפתרו בקוד שהועלה, וסעיף 4.7.1 בהוראות הפרויקט כבר מעגן את הפתרון השלישי כתקן. הזיכרון הנוכחי עדיין מתאר אותם כפתוחים — זהו הפער היחיד שנמצא, והוא **פער בתיעוד, לא בקוד**.
3. **פריט אמיתי אחד שנותר פתוח:** אטומיות כתיבה רב-שלבית ב-`ProductSell.jsx`/`SeriesPurchase.jsx` (§4.4 לעיל) — אופציונלי לטפל, עדיפות בינונית-נמוכה.
4. **פריט לאימות ידני:** מחיקת `PaymentVerification.jsx` — לא ניתן לאשר מתוך הקבצים שהועלו.

אשמח לעדכן את הזיכרון בהתאם לממצאים האלה, או להכין קובצי תיקון ל-`writeBatch` בשני מסכי הרכישה אם תרצי לסגור גם את הפריט המבני שנותר.
