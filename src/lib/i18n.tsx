"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Language = "he" | "en";

const STORAGE_KEY = "contextlm_lang";

export interface Translations {
  brand: {
    subtitle: string;
  };
  lang: {
    switchLabel: string;
    switchTitle: string;
    currentCode: string;
    targetCode: string;
  };
  auth: {
    badge: string;
    headline: string;
    description: string;
    feature1Title: string;
    feature1Desc: string;
    feature2Title: string;
    feature2Desc: string;
    feature3Title: string;
    feature3Desc: string;
    footerPipeline: string;
    loginTitle: string;
    loginSubtitle: string;
    continueWithGoogle: string;
    orWithCredentials: string;
    username: string;
    usernamePlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    signingIn: string;
    signIn: string;
    newToContextLm: string;
    createAccount: string;
    errMissingCreds: string;
    errInvalidCreds: string;
    errAccountBlocked: string;
    errNetworkLogin: string;
    errGoogleNotConfigured: string;
    signupTitle: string;
    signupSubtitle: string;
    usernameSignupPlaceholder: string;
    displayName: string;
    displayNamePlaceholder: string;
    passwordMinPlaceholder: string;
    confirmPassword: string;
    confirmPasswordPlaceholder: string;
    creatingAccount: string;
    signUpAndOpen: string;
    alreadyHaveAccount: string;
    errUsernamePattern: string;
    errDisplayName: string;
    errPasswordLength: string;
    errPasswordMismatch: string;
    errUnableCreate: string;
    errNetworkSignup: string;
  };
  blocked: {
    title: string;
    subtitle: string;
    reasonLabel: string;
    defaultReason: string;
    contactNote: string;
    signOut: string;
  };
  navbar: {
    adminPortalTitle: string;
    workspaceTitle: string;
    adminBadge: string;
    sourcesUnit: string;
    tokensUnit: string;
    workspaceBtn: string;
    adminPortalBtn: string;
    collapseSources: string;
    openSources: string;
    sourcesCount: (n: number) => string;
    signOutTitle: string;
    logout: string;
  };
  chat: {
    groundedBadge: string;
    activeSourcesCount: (n: number) => string;
    noActiveSources: string;
    clearChat: string;
    emptyTitleNoDocs: string;
    emptyTitleNoActive: string;
    emptyTitleReady: string;
    emptyDescNoDocs: string;
    emptyDescNoActive: string;
    emptyDescReady: string;
    suggestedHeading: string;
    guardrailTriggeredTitle: string;
    strictRefusalBadge: string;
    synthesizing: string;
    verifiedCitationsLabel: string;
    cachedTok: (n: string) => string;
    inputPlaceholderActive: string;
    inputPlaceholderEmpty: string;
    strictlySourcesOnly: string;
    streaming: string;
    askSources: string;
    errLoadWorkspace: string;
    errUploadFailed: string;
    errToggleFailed: string;
    errDeleteFailed: string;
    errRequestFailed: string;
    errOutputGuard: string;
    errStreamError: string;
    errConnectionInterrupted: string;
    starterSingle1: (f: string) => string;
    starterSingle2: (f: string) => string;
    starterSingle3: (f: string) => string;
    starterMulti1: (n: number) => string;
    starterMulti2: (f1: string, f2: string) => string;
    starterMulti3: string;
  };
  sources: {
    title: string;
    activeTok: (compact: string) => string;
    closePanel: string;
    maxReachedTitle: string;
    maxReachedDesc: string;
    extracting: string;
    dropOrBrowse: string;
    formatsHint: string;
    addSources: string;
    storageLabel: (used: string) => string;
    emptyTitle: string;
    emptyDesc: string;
    includeAria: (filename: string) => string;
    tokUnit: string;
    deleteBtn: string;
    cancelBtn: string;
    previewTitle: string;
    deleteTitle: string;
    verifiedPreviewLabel: string;
    loadingPreview: string;
    sourceDocumentFallback: string;
    errMaxFiles: string;
    errRemainingFiles: (remaining: number) => string;
    errUnsupportedType: (name: string) => string;
    errFileTooLarge: (name: string) => string;
    errTotalStorage: (name: string) => string;
    errTokenCeiling: (name: string) => string;
  };
  admin: {
    pageTitle: string;
    pageSubtitle: string;
    updatedAt: (time: string) => string;
    refreshTelemetry: string;
    loadingMetrics: string;
    errLoadTelemetry: string;
    errNetworkTelemetry: string;
    privacyBannerTitle: string;
    privacyBannerDesc: string;
    kpiTotalUsers: string;
    kpiLast24h: (n: number) => string;
    kpiBlockedBadge: (n: number) => string;
    kpiStandardBadge: (n: number) => string;
    kpiFilesUploaded: string;
    kpiIndexedStorage: string;
    kpiTokensConsumed: string;
    kpiCached: (compact: string, rate: number) => string;
    kpiLatencySecurity: string;
    kpiAnswered: (n: number) => string;
    kpiDangerousFlags: (n: number) => string;
    chart24hTitle: string;
    chart24hSubtitle: string;
    chartPeakWindow: (label: string, share: number) => string;
    chartAwaitingTelemetry: string;
    chartLegendPeak: string;
    chartLegendStandard: string;
    chartQueriesSeries: string;
    chartQueriesValue: (n: string) => string;
    chartTokensNote: (n: string) => string;
    chartPeakTag: string;
    chartWeeklyTitle: string;
    chartWeeklySubtitle: string;
    chartLegendVolume: string;
    chartLegendLatency: string;
    days: Record<string, string>;
    usersTableTitle: string;
    usersTableSubtitle: string;
    searchPlaceholder: string;
    filterAll: string;
    filterActive: string;
    filterBlocked: string;
    colUser: string;
    colStatus: string;
    colFiles: string;
    colQueries: string;
    colInputTok: string;
    colOutputTok: string;
    colTotalTok: string;
    colEstCost: string;
    colLastActive: string;
    colActions: string;
    noMatchingUsers: string;
    statusActive: string;
    statusBlocked: string;
    totalFilesSub: (n: number) => string;
    dangerousFlagsTooltip: (n: number) => string;
    cachedTooltip: (n: string) => string;
    cachedSub: (n: string) => string;
    blockBtn: string;
    unblockBtn: string;
    protectedAdmin: string;
    blockModalTitle: (username: string) => string;
    blockModalDesc: string;
    blockReasonLabel: string;
    blockReasonPlaceholder: string;
    confirmBlock: string;
    cancel: string;
    blocking: string;
    unblocking: string;
    errBlockAction: string;
    relJustNow: string;
    relMinsAgo: (n: number) => string;
    relHoursAgo: (n: number) => string;
    relDaysAgo: (n: number) => string;
    dangerousFeedTitle: string;
    dangerousFeedSubtitle: string;
    dangerousEventsCount: (n: number) => string;
    zeroDangerousTitle: string;
    zeroDangerousDesc: string;
    colTimestamp: string;
    colUsername: string;
    colThreatType: string;
    colFlaggedText: string;
    colRule: string;
    colLatency: string;
    colAction: string;
    badgeDangerous: string;
    userBlockedPill: string;
    blockUserQuick: string;
    providerCredentials: string;
    providerGoogle: string;
  };
}

const HE: Translations = {
  brand: {
    subtitle: "מענה חכם ומבוסס ממסמכים",
  },
  lang: {
    switchLabel: "English",
    switchTitle: "Switch interface language to English",
    currentCode: "HE",
    targetCode: "EN",
  },
  auth: {
    badge: "מבוסס מקורות בלבד • אפס המצאות חיצוניות",
    headline: "תשאלו את המסמכים שלכם במהירות של פחות משנייה.",
    description:
      "העלו עד 10 קבצי PDF, חוזים, מפרטים או גיליונות נתונים וקבלו תשובות מדויקות המבוססות אך ורק על המקורות שבחרתם — עם הפניות לחיצות והגנת 4 שכבות מפני הזרקת פרומפטים.",
    feature1Title: "הזרמת Fast-Path SSE",
    feature1Desc: "תשובות בזמן אמת עם מטמון הקשר חכם וללא עיכובי מסד וקטורי.",
    feature2Title: "הפניות ישירות למקור",
    feature2Desc: "כל טענה מקושרת ישירות לקטע הממוספר במסמך המקורי.",
    feature3Title: "הגנת 4 שכבות",
    feature3Desc: "סינון ביטויים, בידוד XML מוצפן, מסווג מהיר ובקרת פלט.",
    footerPipeline: "מנוע מענה מבוסס מקורות v1.0",
    loginTitle: "התחברות ל-ContextLM",
    loginSubtitle: "היכנסו למחברת המסמכים המבוססת שלכם או לפורטל הניהול.",
    continueWithGoogle: "המשך עם Google",
    orWithCredentials: "או באמצעות שם משתמש וסיסמה",
    username: "שם משתמש",
    usernamePlaceholder: "למשל: alex_chen או admin",
    password: "סיסמה",
    passwordPlaceholder: "הזינו את הסיסמה שלכם",
    signingIn: "מתחבר…",
    signIn: "התחברות",
    newToContextLm: "חדשים ב-ContextLM?",
    createAccount: "יצירת חשבון",
    errMissingCreds: "יש להזין גם שם משתמש וגם סיסמה.",
    errInvalidCreds: "שם המשתמש או הסיסמה שגויים. נסו שוב.",
    errAccountBlocked:
      "חשבונך נחסם על ידי מנהל המערכת. לא ניתן להתחבר בשלב זה.",
    errNetworkLogin: "שגיאת רשת בעת ההתחברות. אנא נסו שוב.",
    errGoogleNotConfigured:
      "התחברות Google אינה מוגדרת בסביבה זו. התחברו עם שם משתמש וסיסמה או הגדירו GOOGLE_CLIENT_ID.",
    signupTitle: "יצירת חשבון חדש",
    signupSubtitle: "התחילו להעלות עד 10 מקורות מבוססים תוך שניות.",
    usernameSignupPlaceholder: "3–24 אותיות באנגלית, ספרות או קו תחתון",
    displayName: "שם תצוגה",
    displayNamePlaceholder: "למשל: מאיה כהן",
    passwordMinPlaceholder: "לפחות 8 תווים",
    confirmPassword: "אימות סיסמה",
    confirmPasswordPlaceholder: "הזינו שוב את הסיסמה",
    creatingAccount: "יוצר חשבון…",
    signUpAndOpen: "הרשמה ופתיחת המחברת",
    alreadyHaveAccount: "כבר יש לכם חשבון?",
    errUsernamePattern:
      "שם המשתמש חייב להכיל 3–24 תווים: אותיות באנגלית, ספרות וקו תחתון בלבד.",
    errDisplayName: "יש להזין שם תצוגה.",
    errPasswordLength: "הסיסמה חייבת להכיל לפחות 8 תווים.",
    errPasswordMismatch: "הסיסמאות אינן תואמות.",
    errUnableCreate: "לא ניתן ליצור את החשבון כרגע.",
    errNetworkSignup: "שגיאת רשת בעת יצירת החשבון. אנא נסו שוב.",
  },
  blocked: {
    title: "הגישה לחשבון נחסמה",
    subtitle: "חשבונך הושעה על ידי מנהל המערכת ואינו מורשה להשתמש בשירות.",
    reasonLabel: "סיבת החסימה:",
    defaultReason: "חסימת אבטחה או הפרת מדיניות השימוש של המערכת.",
    contactNote: "אם לדעתך מדובר בטעות, יש לפנות למנהל המערכת לבירור.",
    signOut: "התנתקות מהמערכת",
  },
  navbar: {
    adminPortalTitle: "פורטל בקרה וניהול",
    workspaceTitle: "המחברת המבוססת שלי",
    adminBadge: "מנהל",
    sourcesUnit: "מקורות",
    tokensUnit: "טוקנים",
    workspaceBtn: "סביבת עבודה",
    adminPortalBtn: "פורטל ניהול",
    collapseSources: "סגירת חלונית המקורות",
    openSources: "פתיחת חלונית המקורות",
    sourcesCount: (n) => `מקורות (${n})`,
    signOutTitle: "התנתקות",
    logout: "יציאה",
  },
  chat: {
    groundedBadge: "מצב מבוסס מקורות בלבד",
    activeSourcesCount: (n) =>
      n === 1 ? "מקור פעיל אחד בהקשר" : `${n} מקורות פעילים בהקשר`,
    noActiveSources: "לא נבחרו מקורות פעילים",
    clearChat: "ניקוי שיחה",
    emptyTitleNoDocs: "הוסיפו את המקור הראשון כדי להתחיל",
    emptyTitleNoActive: "בחרו לפחות מקור אחד בחלונית המקורות",
    emptyTitleReady: "שאלו כל שאלה על המקורות שבחרתם",
    emptyDescNoDocs:
      "העלו עד 10 קבצי PDF, DOCX, TXT, MD או CSV בחלונית המקורות. כל תשובה מבוססת אך ורק על המסמכים שלכם עם הפניות מדויקות.",
    emptyDescNoActive:
      "סמנו מסמך אחד או יותר בחלונית המקורות כדי לטעון אותם לחלון ההקשר המבוסס.",
    emptyDescReady:
      "ContextLM עונה אך ורק מתוך המסמכים שסימנתם — ללא השערות חיצוניות, עם הפניות לחיצות והגנה בזמן אמת מפני הזרקות.",
    suggestedHeading: "שאלות מומלצות על המקורות",
    guardrailTriggeredTitle: "מנגנון האבטחה והגבולות הופעל",
    strictRefusalBadge: "סירוב קפדני מחוץ למקורות",
    synthesizing: "מגבש תשובה מבוססת מקורות…",
    verifiedCitationsLabel: "הפניות מאומתות למקורות (לחצו להצצה)",
    cachedTok: (n) => `${n} טוקנים מהמטמון`,
    inputPlaceholderActive:
      "שאלו שאלה עובדתית על המקורות המסומנים… (Enter לשליחה, Shift+Enter לשורה חדשה)",
    inputPlaceholderEmpty: "העלו וסמנו מקורות כדי לשאול שאלות מבוססות…",
    strictlySourcesOnly: "מקורות מסומנים בלבד",
    streaming: "מזרים תשובה…",
    askSources: "שאל את המקורות",
    errLoadWorkspace: "לא ניתן לטעון את נתוני סביבת העבודה. אנא רעננו.",
    errUploadFailed: "העלאת הקבצים נכשלה.",
    errToggleFailed: "עדכון בחירת המקור נכשל.",
    errDeleteFailed: "מחיקת המסמך נכשלה.",
    errRequestFailed: "לא ניתן היה להשלים את הבקשה.",
    errOutputGuard: "נחסם על ידי מנגנון הגנת הפלט.",
    errStreamError: "אירעה שגיאה במהלך הזרמת התשובה.",
    errConnectionInterrupted: "החיבור נקטע בזמן ההמתנה לתשובה המבוססת.",
    starterSingle1: (f) => `סכם את העובדות המרכזיות והמסקנות העיקריות המופיעות ב-${f}.`,
    starterSingle2: (f) => `פרט את כל התאריכים, הנתונים המספריים או הדרישות המוזכרים ב-${f}.`,
    starterSingle3: (f) => `אילו סיכונים פתוחים, הסתייגויות או משימות לביצוע מופיעים ב-${f}?`,
    starterMulti1: (n) => `סכם ושלב את הנקודות העיקריות מתוך ${n} המקורות שסימנתי.`,
    starterMulti2: (f1, f2) =>
      `השווה בין מה שנאמר ב-${f1} לבין ${f2} לגבי מונחים או מדדים מרכזיים.`,
    starterMulti3:
      "חלץ את כל המועדים, המספרים או ההתחייבויות הספציפיות מתוך המסמכים הפעילים.",
  },
  sources: {
    title: "מקורות",
    activeTok: (compact) => `${compact} טוקנים פעילים`,
    closePanel: "סגירת חלונית המקורות",
    maxReachedTitle: "הגעתם למגבלת 10 המקורות.",
    maxReachedDesc: "מחקו מקור קיים כדי להעלות מקור חדש.",
    extracting: "מחלץ ומאנדקס טקסט…",
    dropOrBrowse: "גררו קבצים לכאן או בחרו מהמחשב",
    formatsHint: "PDF, DOCX, TXT, MD, CSV • עד 10 MB לקובץ",
    addSources: "הוספת מקורות",
    storageLabel: (used) => `אחסון: ${used} / 50 MB`,
    emptyTitle: "עדיין לא הועלו מקורות",
    emptyDesc:
      "העלו חוזים, מאמרי מחקר, נהלים או טבלאות CSV. ContextLM יענה אך ורק מתוך המקורות שתסמנו.",
    includeAria: (filename) => `כלול את ${filename} בהקשר`,
    tokUnit: "טוקנים",
    deleteBtn: "מחיקה",
    cancelBtn: "ביטול",
    previewTitle: "תצוגה מקדימה של הטקסט שחולץ",
    deleteTitle: "מחיקת מקור",
    verifiedPreviewLabel: "תצוגה מקדימה מאומתת של המקור",
    loadingPreview: "טוען קטע טקסט מהמקור…",
    sourceDocumentFallback: "מסמך מקור",
    errMaxFiles: "הגעתם למגבלת 10 מקורות. מחקו מקור כדי להעלות נוסף.",
    errRemainingFiles: (remaining) =>
      remaining === 1
        ? "ניתן להעלות עוד מקור אחד בלבד (מקסימום 10 בסך הכול)."
        : `ניתן להעלות עוד עד ${remaining} מקורות בלבד (מקסימום 10 בסך הכול).`,
    errUnsupportedType: (name) =>
      `הקובץ "${name}" אינו נתמך. פורמטים מותרים: PDF, TXT, MD, CSV, DOCX.`,
    errFileTooLarge: (name) => `הקובץ "${name}" חורג ממגבלת 10 MB לקובץ.`,
    errTotalStorage: (name) =>
      `העלאת "${name}" תחרוג ממגבלת האחסון המצטברת של 50 MB.`,
    errTokenCeiling: (name) =>
      `בחירת "${name}" תחרוג מתקרת 150,000 הטוקנים הפעילים. בטלו סימון של מקור גדול תחילה.`,
  },
  admin: {
    pageTitle: "מרכז בקרה ואבטחה",
    pageSubtitle:
      "מדדי שימוש בזמן אמת, שעות עומס, ניהול חסימת משתמשים ובקרת תכנים שסומנו כמסוכנים",
    updatedAt: (time) => `עודכן ${time}`,
    refreshTelemetry: "רענון נתונים",
    loadingMetrics: "טוען נתוני בקרה…",
    errLoadTelemetry: "טעינת נתוני הבקרה נכשלה.",
    errNetworkTelemetry: "שגיאת רשת בעת טעינת נתוני הבקרה.",
    privacyBannerTitle: "פרטיות מלאה: אין למנהל גישה לטקסטים של משתמשים",
    privacyBannerDesc:
      "למנהלי המערכת אין כל גישה למסמכים שהועלו או לשיחות רגילות של משתמשים. רק הודעות שסומנו אוטומטית כמסוכנות על ידי מנגנון האבטחה נחשפות ביומן הבקרה.",
    kpiTotalUsers: "סה״כ משתמשים",
    kpiLast24h: (n) => `+${n} ב-24 השעות האחרונות`,
    kpiBlockedBadge: (n) => `${n} חסומים`,
    kpiStandardBadge: (n) => `${n} רגילים`,
    kpiFilesUploaded: "קבצים שהועלו",
    kpiIndexedStorage: "נפח אחסון מאונדקס (ללא גישה לתוכן)",
    kpiTokensConsumed: "צריכת טוקנים",
    kpiCached: (compact, rate) => `במטמון: ${compact} (${rate}%)`,
    kpiLatencySecurity: "זמן תגובה ואבטחה",
    kpiAnswered: (n) => `${n} שאילתות שנענו`,
    kpiDangerousFlags: (n) => `${n} אירועים מסוכנים`,
    chart24hTitle: "התפלגות פעילות ב-24 שעות (זמני שיא)",
    chart24hSubtitle: "תעבורת שאילתות לפי שעות UTC — 3 שעות השיא מודגשות",
    chartPeakWindow: (label, share) => `חלון שיא: ${label} (${share}% מהתעבורה)`,
    chartAwaitingTelemetry: "ממתין לנתוני שאילתות",
    chartLegendPeak: "3 שעות השיא",
    chartLegendStandard: "שעות רגילות",
    chartQueriesSeries: "שאילתות",
    chartQueriesValue: (n) => `${n} שאילתות`,
    chartTokensNote: (n) => ` • ${n} טוקנים`,
    chartPeakTag: " (שיא)",
    chartWeeklyTitle: "נפח וזמן תגובה לפי ימי השבוע",
    chartWeeklySubtitle: "כמות שאילתות שבועית (עמודות) מול זמן תגובה ממוצע במילישניות (קו)",
    chartLegendVolume: "נפח שאילתות",
    chartLegendLatency: "זמן תגובה ממוצע (ms)",
    days: {
      Sun: "א׳",
      Mon: "ב׳",
      Tue: "ג׳",
      Wed: "ד׳",
      Thu: "ה׳",
      Fri: "ו׳",
      Sat: "ש׳",
    },
    usersTableTitle: "ניהול משתמשים, שימוש וחסימות",
    usersTableSubtitle:
      "מכסות קבצים, טוקנים, התראות אבטחה ושליטה בחסימת משתמשים — ללא חשיפת תכנים אישיים",
    searchPlaceholder: "חיפוש לפי שם משתמש, שם או ספק…",
    filterAll: "הכול",
    filterActive: "פעילים",
    filterBlocked: "חסומים",
    colUser: "משתמש",
    colStatus: "סטטוס",
    colFiles: "קבצים",
    colQueries: "שאילתות",
    colInputTok: "טוקני קלט",
    colOutputTok: "טוקני פלט",
    colTotalTok: "סה״כ טוקנים",
    colEstCost: "עלות משוערת",
    colLastActive: "פעילות אחרונה",
    colActions: "פעולות",
    noMatchingUsers: "לא נמצאו משתמשים תואמים.",
    statusActive: "פעיל",
    statusBlocked: "חסום",
    totalFilesSub: (n) => `${n} סה״כ`,
    dangerousFlagsTooltip: (n) => `${n} תכנים שסומנו כמסוכנים`,
    cachedTooltip: (n) => `טוקנים שנחסכו במטמון: ${n}`,
    cachedSub: (n) => `(${n} במטמון)`,
    blockBtn: "חסום משתמש",
    unblockBtn: "בטל חסימה",
    protectedAdmin: "מנהל מוגן",
    blockModalTitle: (username) => `חסימת המשתמש @${username}`,
    blockModalDesc:
      "משתמש חסום ינותק מיידית מהגישה למחברת ולא יוכל להתחבר או לשלוח שאילתות עד להסרת החסימה.",
    blockReasonLabel: "סיבת החסימה (אופציונלי)",
    blockReasonPlaceholder: "למשל: ניסיונות חוזרים להזרקת פרומפטים או שימוש מסוכן",
    confirmBlock: "אישור חסימה",
    cancel: "ביטול",
    blocking: "חוסם…",
    unblocking: "מבטל חסימה…",
    errBlockAction: "עדכון סטטוס החסימה נכשל.",
    relJustNow: "עכשיו",
    relMinsAgo: (n) => `לפני ${n} דק׳`,
    relHoursAgo: (n) => `לפני ${n} שע׳`,
    relDaysAgo: (n) => `לפני ${n} ימים`,
    dangerousFeedTitle: "יומן תכנים שסומנו כמסוכנים בלבד",
    dangerousFeedSubtitle:
      "מציג אך ורק טקסטים שנחסמו עקב חשד להזרקה, פריצה או תוכן מסוכן — טקסטים רגילים של משתמשים אינם נגישים כאן",
    dangerousEventsCount: (n) => `${n} אירועים מסוכנים`,
    zeroDangerousTitle: "לא נרשמו תכנים מסוכנים",
    zeroDangerousDesc:
      "כאשר מערכת ההגנה מזהה ניסיון הזרקת פרומפטים או תוכן מסוכן, הטקסט המסומן יופיע כאן לצורך בקרה וחסימת המשתמש במידת הצורך.",
    colTimestamp: "מועד",
    colUsername: "משתמש",
    colThreatType: "סיווג",
    colFlaggedText: "טקסט שסומן כמסוכן",
    colRule: "כלל זיהוי",
    colLatency: "זמן",
    colAction: "חסימה",
    badgeDangerous: "מסוכן",
    userBlockedPill: "משתמש חסום",
    blockUserQuick: "חסום",
    providerCredentials: "סיסמה",
    providerGoogle: "Google",
  },
};

const EN: Translations = {
  brand: {
    subtitle: "Grounded Document Q&A",
  },
  lang: {
    switchLabel: "עברית",
    switchTitle: "החלף שפת ממשק לעברית",
    currentCode: "EN",
    targetCode: "HE",
  },
  auth: {
    badge: "Strictly Grounded • Zero External Hallucination",
    headline: "Interrogate your documents at sub-second speed.",
    description:
      "Upload up to 10 PDFs, contracts, specs, or spreadsheets and receive deterministic answers grounded exclusively in your selected sources—with clickable inline citations and 4-layer prompt-injection defense.",
    feature1Title: "Fast-Path SSE",
    feature1Desc: "Prefix-cached 1.05M context streaming with zero vector-DB drag.",
    feature2Title: "Inline Citations",
    feature2Desc: "Every claim links directly to its numbered source snippet.",
    feature3Title: "4-Layer Guard",
    feature3Desc: "Regex, nonce XML sandbox, nano classifier & output canary.",
    footerPipeline: "Deterministic Fast-Path Pipeline v1.0",
    loginTitle: "Sign in to ContextLM",
    loginSubtitle: "Access your grounded document notebook or admin portal.",
    continueWithGoogle: "Continue with Google",
    orWithCredentials: "Or with credentials",
    username: "Username",
    usernamePlaceholder: "e.g. alex_chen or admin",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    signingIn: "Signing in…",
    signIn: "Sign In",
    newToContextLm: "New to ContextLM?",
    createAccount: "Create Account",
    errMissingCreds: "Please enter both your username and password.",
    errInvalidCreds: "Invalid username or password. Please try again.",
    errAccountBlocked:
      "Your account has been blocked by an administrator and cannot sign in.",
    errNetworkLogin: "Network error while signing in. Please try again.",
    errGoogleNotConfigured:
      "Google OAuth is not configured on this instance. Use username/password or configure GOOGLE_CLIENT_ID.",
    signupTitle: "Create your account",
    signupSubtitle: "Start uploading up to 10 grounded sources in seconds.",
    usernameSignupPlaceholder: "3–24 letters, numbers, or _",
    displayName: "Display Name",
    displayNamePlaceholder: "e.g. Maya Patel",
    passwordMinPlaceholder: "Minimum 8 characters",
    confirmPassword: "Confirm Password",
    confirmPasswordPlaceholder: "Re-enter your password",
    creatingAccount: "Creating account…",
    signUpAndOpen: "Sign Up & Open Notebook",
    alreadyHaveAccount: "Already have an account?",
    errUsernamePattern:
      "Username must be 3–24 characters using only letters, numbers, and underscores.",
    errDisplayName: "Please enter your display name.",
    errPasswordLength: "Password must be at least 8 characters long.",
    errPasswordMismatch: "Passwords do not match.",
    errUnableCreate: "Unable to create account.",
    errNetworkSignup: "Network error while creating your account. Please try again.",
  },
  blocked: {
    title: "Account Access Blocked",
    subtitle: "Your account has been suspended by a system administrator.",
    reasonLabel: "Reason:",
    defaultReason: "Security enforcement or violation of usage policy.",
    contactNote: "If you believe this is a mistake, please contact your administrator.",
    signOut: "Sign Out",
  },
  navbar: {
    adminPortalTitle: "Security & Telemetry Portal",
    workspaceTitle: "My Grounded Notebook",
    adminBadge: "Admin",
    sourcesUnit: "Sources",
    tokensUnit: "tokens",
    workspaceBtn: "Workspace",
    adminPortalBtn: "Admin Portal",
    collapseSources: "Collapse Sources panel",
    openSources: "Open Sources panel",
    sourcesCount: (n) => `Sources (${n})`,
    signOutTitle: "Sign out",
    logout: "Logout",
  },
  chat: {
    groundedBadge: "Grounded Mode: Strictly Sources Only",
    activeSourcesCount: (n) =>
      `${n} active ${n === 1 ? "source" : "sources"} in context`,
    noActiveSources: "No active sources selected",
    clearChat: "Clear Chat",
    emptyTitleNoDocs: "Add your first source to begin",
    emptyTitleNoActive: "Select at least one source in the Sources panel",
    emptyTitleReady: "Ask anything about your selected sources",
    emptyDescNoDocs:
      "Upload up to 10 PDF, DOCX, TXT, MD, or CSV files in the Sources drawer. Every answer is grounded exclusively in your documents with inline citations.",
    emptyDescNoActive:
      "Check one or more uploaded documents in the Sources drawer to load them into the grounded context window.",
    emptyDescReady:
      "ContextLM answers strictly from your checked documents—with zero outside speculation, inline clickable citations, and real-time injection protection.",
    suggestedHeading: "Suggested grounded questions",
    guardrailTriggeredTitle: "Security & Scope Guardrail Triggered",
    strictRefusalBadge: "Strict Grounding Refusal",
    synthesizing: "Synthesizing grounded answer…",
    verifiedCitationsLabel: "Verified Source Citations (click to inspect)",
    cachedTok: (n) => `${n} cached tok`,
    inputPlaceholderActive:
      "Ask a factual question about your checked sources… (Enter to send, Shift+Enter for newline)",
    inputPlaceholderEmpty:
      "Upload and select sources to ask grounded questions…",
    strictlySourcesOnly: "Strictly Sources Only",
    streaming: "Streaming…",
    askSources: "Ask Sources",
    errLoadWorkspace: "Unable to load workspace data. Please refresh.",
    errUploadFailed: "Upload failed.",
    errToggleFailed: "Failed to update source selection.",
    errDeleteFailed: "Failed to delete document.",
    errRequestFailed: "Request could not be completed.",
    errOutputGuard: "Blocked by output security guardrail.",
    errStreamError: "An error occurred while streaming the response.",
    errConnectionInterrupted:
      "Connection interrupted while waiting for grounded response.",
    starterSingle1: (f) =>
      `Summarize the key facts and core conclusions stated in ${f}.`,
    starterSingle2: (f) =>
      `List all specific dates, figures, or requirements mentioned in ${f}.`,
    starterSingle3: (f) =>
      `What open risks, caveats, or action items appear in ${f}?`,
    starterMulti1: (n) =>
      `Synthesize the main points across my ${n} selected sources.`,
    starterMulti2: (f1, f2) =>
      `Compare what ${f1} and ${f2} state regarding key terms or metrics.`,
    starterMulti3:
      "Extract any specific deadlines, numbers, or obligations across the active documents.",
  },
  sources: {
    title: "Sources",
    activeTok: (compact) => `${compact} active tok`,
    closePanel: "Close Sources panel",
    maxReachedTitle: "Maximum 10 sources reached.",
    maxReachedDesc: "Delete a source below to upload another.",
    extracting: "Extracting & indexing text…",
    dropOrBrowse: "Drop files here or browse",
    formatsHint: "PDF, DOCX, TXT, MD, CSV • Max 10 MB each",
    addSources: "Add Sources",
    storageLabel: (used) => `Storage: ${used} / 50 MB`,
    emptyTitle: "No sources uploaded yet",
    emptyDesc:
      "Upload contracts, research papers, SOPs, or CSV tables. ContextLM will answer strictly from your checked sources.",
    includeAria: (filename) => `Include ${filename} in context`,
    tokUnit: "tok",
    deleteBtn: "Delete",
    cancelBtn: "Cancel",
    previewTitle: "Preview extracted text",
    deleteTitle: "Delete source",
    verifiedPreviewLabel: "Verified Source Preview",
    loadingPreview: "Loading extracted source snippet…",
    sourceDocumentFallback: "Source Document",
    errMaxFiles: "Maximum 10 sources reached. Delete a source to upload another.",
    errRemainingFiles: (remaining) =>
      `You can upload at most ${remaining} more ${remaining === 1 ? "source" : "sources"} (max 10 total).`,
    errUnsupportedType: (name) =>
      `"${name}" is not supported. Allowed types: PDF, TXT, MD, CSV, DOCX.`,
    errFileTooLarge: (name) => `"${name}" exceeds the 10 MB per-file limit.`,
    errTotalStorage: (name) =>
      `Uploading "${name}" exceeds the 50 MB cumulative storage limit.`,
    errTokenCeiling: (name) =>
      `Selecting "${name}" exceeds the 150,000 active context token ceiling. Uncheck a large source first.`,
  },
  admin: {
    pageTitle: "Security & Observability Portal",
    pageSubtitle:
      "Real-time token economics, peak traffic windows, user access blocking, and flagged dangerous content only",
    updatedAt: (time) => `Updated ${time}`,
    refreshTelemetry: "Refresh Telemetry",
    loadingMetrics: "Loading security & telemetry metrics…",
    errLoadTelemetry: "Failed to load admin telemetry.",
    errNetworkTelemetry: "Network error while fetching telemetry.",
    privacyBannerTitle: "Strict Privacy Enforced: No Access to User Texts",
    privacyBannerDesc:
      "Administrators have zero access to user documents or regular chat messages. Only texts explicitly flagged as dangerous by the security guardrails appear in the audit log below.",
    kpiTotalUsers: "Total Users",
    kpiLast24h: (n) => `+${n} in last 24h`,
    kpiBlockedBadge: (n) => `${n} blocked`,
    kpiStandardBadge: (n) => `${n} standard`,
    kpiFilesUploaded: "Files Uploaded",
    kpiIndexedStorage: "Indexed storage (content hidden)",
    kpiTokensConsumed: "Tokens Consumed",
    kpiCached: (compact, rate) => `Cached: ${compact} (${rate}%)`,
    kpiLatencySecurity: "Latency & Security",
    kpiAnswered: (n) => `${n} answered`,
    kpiDangerousFlags: (n) => `${n} dangerous flags`,
    chart24hTitle: "24-Hour Activity Distribution (Most Used Times)",
    chart24hSubtitle: "Query traffic across UTC hours — top 3 peak hours highlighted",
    chartPeakWindow: (label, share) =>
      `Peak Activity Window: ${label} (${share}% of traffic)`,
    chartAwaitingTelemetry: "Awaiting query telemetry",
    chartLegendPeak: "Top 3 Peak Hours",
    chartLegendStandard: "Standard Hours",
    chartQueriesSeries: "Queries",
    chartQueriesValue: (n) => `${n} queries`,
    chartTokensNote: (n) => ` • ${n} tokens`,
    chartPeakTag: " (Peak)",
    chartWeeklyTitle: "Day-of-Week Volume & Latency",
    chartWeeklySubtitle:
      "Weekly query count (bars) vs. average response time in ms (line)",
    chartLegendVolume: "Query Volume",
    chartLegendLatency: "Avg Latency (ms)",
    days: {
      Sun: "Sun",
      Mon: "Mon",
      Tue: "Tue",
      Wed: "Wed",
      Thu: "Thu",
      Fri: "Fri",
      Sat: "Sat",
    },
    usersTableTitle: "Users, Usage & Access Control",
    usersTableSubtitle:
      "Token accounting, file counts, dangerous flags, and user blocking — zero access to private user content",
    searchPlaceholder: "Filter username, name, auth…",
    filterAll: "All",
    filterActive: "Active",
    filterBlocked: "Blocked",
    colUser: "User",
    colStatus: "Status",
    colFiles: "Files",
    colQueries: "Queries",
    colInputTok: "Input Tok",
    colOutputTok: "Output Tok",
    colTotalTok: "Total Tok",
    colEstCost: "Est. Cost",
    colLastActive: "Last Active",
    colActions: "Actions",
    noMatchingUsers: "No matching users found.",
    statusActive: "Active",
    statusBlocked: "Blocked",
    totalFilesSub: (n) => `${n} total`,
    dangerousFlagsTooltip: (n) => `${n} texts flagged as dangerous`,
    cachedTooltip: (n) => `Cached tokens saved: ${n}`,
    cachedSub: (n) => `(${n} cached)`,
    blockBtn: "Block User",
    unblockBtn: "Unblock",
    protectedAdmin: "Admin Protected",
    blockModalTitle: (username) => `Block @${username}`,
    blockModalDesc:
      "Blocked users immediately lose access to their workspace and cannot sign in or send queries until unblocked.",
    blockReasonLabel: "Block reason (optional)",
    blockReasonPlaceholder:
      "e.g. Repeated prompt injection attempts or dangerous content",
    confirmBlock: "Confirm Block",
    cancel: "Cancel",
    blocking: "Blocking…",
    unblocking: "Unblocking…",
    errBlockAction: "Failed to update user block status.",
    relJustNow: "just now",
    relMinsAgo: (n) => `${n}m ago`,
    relHoursAgo: (n) => `${n}h ago`,
    relDaysAgo: (n) => `${n}d ago`,
    dangerousFeedTitle: "Flagged Dangerous Texts Only",
    dangerousFeedSubtitle:
      "Displays ONLY texts flagged as dangerous (prompt injections, jailbreaks, exploits) — normal user messages and documents are never exposed",
    dangerousEventsCount: (n) => `${n} dangerous events`,
    zeroDangerousTitle: "Zero dangerous texts recorded",
    zeroDangerousDesc:
      "Whenever the security guardrails flag a prompt injection or dangerous payload, only that flagged text appears here for review and optional user blocking.",
    colTimestamp: "Timestamp",
    colUsername: "Username",
    colThreatType: "Severity",
    colFlaggedText: "Flagged Dangerous Text",
    colRule: "Detection Rule",
    colLatency: "Latency",
    colAction: "Access",
    badgeDangerous: "DANGEROUS",
    userBlockedPill: "Blocked",
    blockUserQuick: "Block",
    providerCredentials: "Credentials",
    providerGoogle: "Google",
  },
};

const DICTIONARIES: Record<Language, Translations> = {
  he: HE,
  en: EN,
};

interface LanguageContextValue {
  lang: Language;
  dir: "rtl" | "ltr";
  isRtl: boolean;
  setLang: (next: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: "he",
  dir: "ltr",
  isRtl: false,
  setLang: () => {},
  toggleLang: () => {},
  t: HE,
});

const LANG_EVENT = "contextlm-lang-change";

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "he";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "he") return saved;
  } catch {
    // Ignore storage errors
  }
  return "he";
}

function subscribeLanguage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(LANG_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(LANG_EVENT, handler);
  };
}

function writeStoredLanguage(next: Language): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event(LANG_EVENT));
  } catch {
    // Ignore storage/cookie restrictions
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore<Language>(
    subscribeLanguage,
    readStoredLanguage,
    () => "he"
  );

  useEffect(() => {
    // Only update the language attribute; keep layout direction fixed ("ltr")
    // so switching languages never shifts the UI from side to side.
    document.documentElement.lang = lang;
    document.documentElement.dir = "ltr";
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    writeStoredLanguage(next);
  }, []);

  const toggleLang = useCallback(() => {
    const current = readStoredLanguage();
    writeStoredLanguage(current === "he" ? "en" : "he");
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      dir: "ltr",
      isRtl: false,
      setLang,
      toggleLang,
      t: DICTIONARIES[lang],
    }),
    [lang, setLang, toggleLang]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
