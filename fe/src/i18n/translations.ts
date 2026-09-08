// Scoped subset of ../expense-tracker's src/i18n/translations.ts — the
// strings used by the screens reskinned so far (AppShell, HomeDashboard,
// TransactionsPage, ExpenseSchedulePage, AnalyticsPage, SyncMenu,
// ConnectGate, ReminderBanner, NotificationDrawer) plus the full Manual/
// Voice/Receipt creation flow (ManualEntryForm, VoiceEntry,
// ExpenseReviewModal, Scanner, CategoryPicker). ExpenseDetailModal/
// WalletSettingsPage stay English — not yet reskinned, same boundary as
// the palette pass. `id` copy is pulled verbatim from their dict where a
// matching key exists; keys with no prototype equivalent (sync UI,
// reminders, Terjadwal/Hutang — features they don't have) are authored
// fresh.

export type Lang = "id" | "en";

export const translations = {
  id: {
    // Nav / shell
    installApp: "Install",
    login: "Login",
    installInstructionsTitle: "Pasang MonthExpense",
    installWelcomeTitle: "Pasang MonthExpense di layar utama",
    installWelcomeBody: "Akses lebih cepat dan bisa dipakai offline. Begini caranya:",
    installBenefitOffline:
      "Bisa dipakai sepenuhnya offline. Pindai struk dan input suara tetap jalan tanpa koneksi.",
    installBenefitPersistent:
      "Model pindai/suara tersimpan lebih stabil. Tab browser bisa dibersihkan otomatis setelah seminggu tidak dibuka, aplikasi terpasang tidak begitu.",
    installBenefitFast: "Langsung buka ke aplikasi, tanpa bilah alamat atau tab browser.",
    installAndroidTapButton: "Ketuk tombol Pasang di atas untuk memasang aplikasi ini.",
    installAndroidStep1: "Ketuk menu ⋮ di kanan atas Chrome",
    installAndroidStep2: 'Ketuk "Instal aplikasi" (atau "Tambahkan ke layar utama")',
    installAndroidStep3: 'Konfirmasi "Instal"',
    installAndroidOtherStep1: "Ketuk menu ⋮ di kanan atas browser",
    installAndroidOtherStep2: 'Ketuk "Instal aplikasi" (atau "Tambahkan ke layar utama")',
    installAndroidOtherStep3: 'Konfirmasi "Instal"',
    installIosSafariStep1: "Ketuk Bagikan di toolbar bawah Safari",
    installIosSafariStep2: 'Gulir ke bawah, ketuk "Tambah ke Layar Utama"',
    installIosSafariStep3: 'Ketuk "Tambah" di kanan atas',
    installIosOtherStep1: "Ketuk Bagikan, di sebelah kolom alamat browser",
    installIosOtherStep2: 'Ketuk "Tambah ke Layar Utama"',
    installIosOtherStep3: 'Ketuk "Tambah"',
    navHome: "Beranda",
    navTransactions: "Transaksi",
    navAnalytics: "Analitik",
    navRecurring: "Rutin",
    addExpense: "Pengeluaran",
    manualUnlimited: "Tanpa batas",
    quickActionsTitle: "Tambah Pengeluaran",
    scanReceiptCard: "Pindai Struk",
    scanReceiptCardSub: "Ekstrak Otomatis",
    voiceCard: "Suara AI",
    voiceCardSub: "EN / ID",
    manualCard: "Manual",
    manualCardSub: "Formulir Kustom",

    // Home
    homeTagline: "Pindai struk. Selesai.",
    aboutThisProject: "Tentang aplikasi ini",
    thisMonth: "Bulan ini",
    scanReceipt: "Pindai Struk",
    voiceInput: "Input Suara",
    spendingSummary: "Ringkasan Pengeluaran",
    noSpendingYet: "Belum ada pengeluaran bulan ini.",
    manageWallets: "Kelola Dompet",
    reminders: "Pengingat",

    // Transactions
    transactionsTitle: "Transaksi",
    filter: "Filter",
    resetFilters: "Atur Ulang",
    applyFilters: "Terapkan",
    allWallets: "Semua Dompet",
    allCategories: "Semua Kategori",
    allMonths: "Semua Bulan",
    searchPlaceholder: "Cari transaksi…",
    noTransactionsFound: "Tidak ada transaksi yang cocok.",

    // Expense schedule page
    recurringExpensesTitle: "Jadwal Pengeluaran",
    scheduleAll: "Semua",
    scheduleScheduled: "Terjadwal",
    scheduleDebt: "Hutang",
    scheduleDaily: "Harian",
    emptyScheduleDay: "Tidak ada untuk tanggal ini.",
    markPaid: "Tandai Lunas",
    markUnpaid: "Batalkan Tandai",
    markSettled: "Tandai Dikembalikan",
    markUnsettled: "Batalkan Tandai",
    overdueByDays: "Terlambat {days} hari",

    // Manual entry — expense type selector
    typeNormal: "Normal (Harian)",
    typeScheduled: "Terjadwal",
    typeDebt: "Hutang",
    addDate: "Tambah Tanggal",
    textReceiptCardTitle: "Struk Teks",
    textReceiptCardSub: "Tempel & Proses",

    // Manual/Voice/Receipt creation flows — shared field labels
    whatWasItFor: "Untuk apa ini?",
    titlePlaceholder: "Kopi, belanja, taksi…",
    amountLabel: "Jumlah",
    dateLabel: "Tanggal",
    noteLabel: "Catatan (opsional)",
    notePlaceholder: "Hal yang perlu diingat tentang ini.",
    submitExpense: "Simpan Pengeluaran",
    saveChanges: "Simpan Perubahan",
    reviewExpenseTitle: "Tinjau Pengeluaran",
    pickAtLeastOneDate: "Pilih setidaknya satu tanggal",
    manualErrorTitleRequired: "Isi judul",
    manualErrorAmountRequired: "Jumlah wajib diisi",
    manualErrorDateRequired: "Pilih tanggal",
    walletFieldLabel: "Dompet",
    categoryFieldLabel: "Kategori",

    // Receipt/voice review — additional fields
    merchantLabel: "Merchant",
    merchantPlaceholder: "Di mana ini terjadi?",
    itemsLabel: "Item (opsional)",
    discountLabel: "Diskon",
    taxLabel: "Pajak",
    serviceChargeLabel: "Biaya Layanan",
    paymentMethodLabel: "Metode Pembayaran",
    paymentMethodPlaceholder: "Tunai, QRIS, transfer bank…",
    subtotalLabel: "Subtotal",
    totalLabel: "Total",
    cashLabel: "Tunai",
    changeLabel: "Kembalian",
    discardButton: "Batalkan",
    saveButton: "Simpan",

    // Expense detail sheet (ExpenseDetailModal)
    expenseDetailTitle: "Detail Pengeluaran",
    sourceScanned: "Dipindai",
    sourceManual: "Manual",
    sourceVoice: "Suara",
    unnamedItem: "Item tanpa nama",
    noLineItemsDetected: "Tidak ada item terdeteksi.",
    addedOn: "Ditambahkan {date}",
    deleteButton: "Hapus",
    editButton: "Ubah",
    deleteExpenseConfirmTitle: "Hapus pengeluaran ini?",
    deleteExpenseConfirmDescription: "Tindakan ini tidak dapat dibatalkan.",
    photoUnavailable: "Foto tidak lagi tersedia",
    viewFullscreenLabel: "Lihat layar penuh",
    expenseTitleFieldLabel: "Judul pengeluaran",

    // Voice entry
    voiceUnsupported: "Input suara tidak didukung di perangkat ini",
    voiceTranscribing: "Mentranskripsi…",
    voiceParsing: "Memahami maksudnya…",
    voiceListening: "Merekam… ketuk lagi untuk memproses",
    voiceTapToSpeak: "Ketuk untuk bicara",
    voiceErrorUnsupported: 'Input suara tidak didukung di browser ini. Gunakan "Tambah manual".',
    voiceErrorMicBlocked: "Akses mikrofon diblokir. Izinkan di pengaturan browser Anda.",
    voiceErrorParseFailed: "Tidak bisa memahami pengeluaran itu.",
    voiceErrorTranscribeFailed: "Tidak bisa mentranskripsi rekaman itu.",
    voiceErrorGeneric: "Tidak terdengar jelas.",
    voiceErrorUnclear: "Tidak bisa memahami ucapan Anda. Coba bicara lebih jelas.",
    voiceErrorQuotaExceeded: "Batas harian input suara sudah tercapai. Coba lagi besok.",
    voiceErrorNoSpeech: "Suara tidak terdengar jelas. Coba lagi, bicara lebih dekat ke mic.",

    // Scanner
    scannerTryAgain: "Coba lagi",
    scannerChoosePhoto: "Pilih foto",
    scannerTapToOpenCamera: "Ketuk untuk buka kamera",
    scannerEnableCamera: "Ketuk untuk aktifkan kamera",
    scannerReadingReceipt: "Membaca struk…",
    scannerParsingReceipt: "Memproses struk…",
    scannerLoadingEngine: "Memuat mesin OCR…",
    scannerErrorUnclear: "Tidak bisa membaca struk ini. Pastikan gambarnya jelas.",
    scannerErrorParseFailed: "Tidak bisa memproses struk ini.",
    scannerErrorQuotaExceeded: "Batas harian pindai struk sudah tercapai. Coba lagi besok.",

    // Paste receipt text (Manual entry's second mode)
    textReceiptCard: "Proses Teks",
    textReceiptPlaceholder:
      "Tempel di sini teks struk/chat, contoh dari laundry, e-commerce, atau ojek online…",
    textReceiptParsing: "Memproses teks…",
    textReceiptFallbackTitle: "Struk",
    textReceiptErrorUnclear: "Tidak bisa memahami teks ini sebagai struk.",
    textReceiptErrorParseFailed: "Tidak bisa memproses teks ini.",
    textReceiptErrorQuotaExceeded:
      "Batas harian tempel teks struk sudah tercapai. Coba lagi besok.",
    quotaRemaining: "Sisa {remaining}/{limit} hari ini",
    cameraRequesting: "Meminta akses kamera…",
    cameraUnavailable: "Kamera tidak tersedia di perangkat/browser ini.",
    cameraSwitchLabel: "Ganti kamera depan/belakang",
    pwaUpdatingTitle: "Memperbarui aplikasi…",
    pwaUpdatingBody: "Mohon tunggu, versi baru sedang dipasang.",
    pwaUpdatedTitle: "Aplikasi diperbarui!",
    pwaUpdatedBody:
      "Aplikasi berhasil diperbarui, anda telah menerima update terbaru dari aplikasi.",
    pwaUpdatedOk: "Oke",
    offlineFeatureUnavailable:
      "Tidak ada koneksi internet. Fitur ini membutuhkannya untuk berfungsi.",
    syncOfflineWarning: "Tidak ada koneksi internet. Sinkronisasi tidak bisa dilakukan sekarang.",
    cameraBlockedTitle: "Akses kamera diblokir",
    cameraBlockedChrome:
      "Klik ikon kamera/gembok di bilah alamat → Izinkan, lalu muat ulang halaman.",
    cameraBlockedFirefox:
      "Klik ikon gembok di bilah alamat → hapus izin yang diblokir, muat ulang, lalu Izinkan saat diminta.",
    cameraBlockedSafariMac: "Menu Safari → Settings for This Website → Camera → Allow.",
    cameraBlockedIos: "Buka app Settings iOS → Safari → Camera → Allow, lalu muat ulang halaman.",
    cameraBlockedOther:
      "Periksa pengaturan situs di browser Anda dan izinkan akses kamera, lalu muat ulang.",

    // Sync
    syncTitle: "Sinkronisasi Google Sheets",
    connectSheets: "Hubungkan Google Sheets",
    syncing: "Menyinkronkan…",
    syncFailed: "Sinkronisasi gagal",
    retry: "Coba lagi",
    syncedAt: "Tersinkron {time}",
    notSyncedYet: "Belum tersinkron",
    copyLink: "Salin tautan spreadsheet",
    restoreSheets: "Pulihkan dari Sheets",
    disconnect: "Putuskan Sambungan",
    cancel: "Batal",
    confirmDisconnectTitle: "Putuskan sambungan?",
    confirmDisconnectBody:
      "Putuskan perangkat ini dari Google Sheets? Data lokal tetap ada. Sambungkan lagi kapan saja.",
    confirmRestoreTitle: "Pulihkan dari Sheets?",
    confirmRestoreBody:
      "Cocokkan data 7 hari terakhir dengan Google Sheets? Data yang lebih lama tidak berubah.",
    connectedAs: "Terhubung sebagai {email}",

    // Connect / login flow
    connectTitle: "Hubungkan Google Sheets",
    sheetDeletedTitle: "Anda telah keluar",
    sheetDeletedBody:
      "Spreadsheet Google Sheets yang terhubung sepertinya sudah dihapus, jadi perangkat ini diputuskan secara otomatis. Data lokal Anda tetap ada, silakan hubungkan sheet baru untuk melanjutkan sinkronisasi.",
    sheetDeletedOk: "Oke",
    needsReauthTitle: "Perlu masuk ulang",
    needsReauthBody:
      "Sinkronisasi butuh koneksi Google yang baru. Data lokal tetap ada, klik untuk lanjutkan.",
    connectBody:
      "Hubungkan Google Sheet Anda untuk memulai. Di situlah pengeluaran Anda tersimpan.",
    connectWithGoogle: "Hubungkan dengan Google",
    connectErrorNoCode: "Google tidak mengembalikan kode otorisasi. Coba masuk lagi.",
    connectErrorStateMismatch: "Tautan masuk ini sudah digunakan atau kedaluwarsa. Coba lagi.",
    sheetSecretInvalid: "Sheet secret tidak valid.",
    sheetSecretBanned: "Sheet secret diblokir sementara setelah ketidakcocokan spreadsheet.",
    sheetSecretAlreadyBound: "Sheet secret ini sudah terhubung ke spreadsheet lain.",
    googleSignInDidntLoad: "Google sign-in tidak dapat dimuat. Periksa koneksi Anda dan coba lagi.",
    googlePopupNoResponse:
      "Popup Google sign-in tidak merespons. Izinkan popup untuk situs ini dan coba lagi.",
    googleAccessDenied: "Tidak bisa mendapatkan akses Google Drive/Sheets.",
    googleNoEmail: "Google tidak mengembalikan email untuk akun ini.",
    googleSignInFailed: "Google sign-in gagal. Coba lagi.",
    googleLoginButton: "Lanjutkan dengan Google",
    googleSigningIn: "Masuk dengan Google…",
    googleVerifying: "Memverifikasi dengan server kami…",
    googleSearching: "Memeriksa spreadsheet yang sudah ada…",
    googleCreatingSheet: "Membuat spreadsheet Anda…",
    googleBuildingStructure: "Menyiapkan halaman Statistik…",
    homeConnectWarningPrefix: "Masuk dengan Google untuk menambah pengeluaran.",
    connectStepVerifying: "Mengonfirmasi kunci sinkronisasi ini dengan server kami…",
    connectStepMerging: "Menggabungkan dengan data yang sudah ada di perangkat ini…",
    connectStepSaving: "Menyimpan ke Google Sheet Anda…",

    // Reminder banner
    dueToday: "Jatuh tempo hari ini",
    dueTomorrow: "Jatuh tempo besok",
    dueInDays: "Jatuh tempo dlm {days} hari",
    manage: "Kelola",

    // Analytics
    analyticsTitle: "Analitik & Wawasan",
    thisYear: "Tahun ini",
    rangeLast3Months: "3 Bulan Terakhir",
    rangeLast6Months: "6 Bulan Terakhir",
    totalSpending: "Total Pengeluaran",
    dailyAverage: "Rata-rata Harian",
    topSpendingCategory: "Kategori Terbesar",
    peakSpending: "Puncak Pengeluaran",
    spendingTrend: "Tren Pengeluaran Waktu ke Waktu",
    categoryBreakdown: "Distribusi Kategori",
    noDataYet: "Belum ada data untuk periode ini.",

    // Categories (mirrors categories.ts's cat* keys, mapped onto our slugs)
    catFoodSnack: "Makanan & Minuman",
    catGrocery: "Belanja",
    catTransportation: "Transportasi",
    catBills: "Tagihan",
    catSubscription: "Langganan",
    catInvestment: "Investasi",
    catEntertainment: "Hiburan",
    catOther: "Lainnya",
  },
  en: {
    installApp: "Install",
    installInstructionsTitle: "Install MonthExpense",
    installWelcomeTitle: "Install MonthExpense on your home screen",
    installWelcomeBody: "Faster access and works offline. Here's how:",
    installBenefitOffline:
      "Works fully offline. Scan and voice entry keep running without a connection.",
    installBenefitPersistent:
      "Scan/voice models stay cached reliably. A browser tab can get cleared automatically after a week of inactivity, an installed app won't.",
    installBenefitFast: "Opens straight to the app, no browser address bar or tabs.",
    installAndroidTapButton: "Tap the Install button above to install this app.",
    installAndroidStep1: "Tap the ⋮ menu, top-right of Chrome",
    installAndroidStep2: 'Tap "Install app" (or "Add to Home screen")',
    installAndroidStep3: 'Confirm "Install"',
    installAndroidOtherStep1: "Tap the ⋮ menu, top-right of your browser",
    installAndroidOtherStep2: 'Tap "Install app" (or "Add to Home screen")',
    installAndroidOtherStep3: 'Confirm "Install"',
    installIosSafariStep1: "Tap Share in Safari's bottom toolbar",
    installIosSafariStep2: 'Scroll down, tap "Add to Home Screen"',
    installIosSafariStep3: 'Tap "Add", top-right',
    installIosOtherStep1: "Tap Share, next to your browser's address bar",
    installIosOtherStep2: 'Tap "Add to Home Screen"',
    installIosOtherStep3: 'Tap "Add"',
    login: "Login",
    navHome: "Home",
    navTransactions: "Transactions",
    navAnalytics: "Analytics",
    navRecurring: "Recurring",
    addExpense: "Add Expense",
    manualUnlimited: "Unlimited",
    quickActionsTitle: "Add an expense",
    scanReceiptCard: "Receipt OCR",
    scanReceiptCardSub: "Auto Extract",
    voiceCard: "Voice AI",
    voiceCardSub: "EN / ID",
    manualCard: "Manual",
    manualCardSub: "Custom Form",

    homeTagline: "Scan a receipt. Done.",
    aboutThisProject: "About this project",
    thisMonth: "This month",
    scanReceipt: "Scan Receipt",
    voiceInput: "Voice Input",
    spendingSummary: "Spending Summary",
    noSpendingYet: "No spending yet this month.",
    manageWallets: "Manage Wallets",
    reminders: "Reminders",

    transactionsTitle: "Transactions",
    filter: "Filter",
    resetFilters: "Reset",
    applyFilters: "Apply",
    allWallets: "All Wallets",
    allCategories: "All Categories",
    allMonths: "All Months",
    searchPlaceholder: "Search transactions…",
    noTransactionsFound: "No transactions found.",

    recurringExpensesTitle: "Expense Schedule",
    scheduleAll: "All",
    scheduleScheduled: "Scheduled Bills",
    scheduleDebt: "Debt",
    scheduleDaily: "Daily",
    emptyScheduleDay: "Nothing for this date.",
    markPaid: "Mark Paid",
    markUnpaid: "Undo",
    markSettled: "Mark Returned",
    markUnsettled: "Undo",
    overdueByDays: "Overdue by {days} days",

    typeNormal: "Normal (Daily)",
    typeScheduled: "Scheduled Bill",
    typeDebt: "Debt",
    addDate: "Add Date",
    textReceiptCardTitle: "Text Receipt",
    textReceiptCardSub: "Paste & Process",

    whatWasItFor: "What was it for?",
    titlePlaceholder: "Coffee, groceries, taxi…",
    amountLabel: "Amount",
    dateLabel: "Date",
    noteLabel: "Note (optional)",
    notePlaceholder: "Anything worth remembering about this one.",
    submitExpense: "Add expense",
    saveChanges: "Save changes",
    reviewExpenseTitle: "Review expense",
    pickAtLeastOneDate: "Pick at least one date",
    manualErrorTitleRequired: "Enter a title",
    manualErrorAmountRequired: "Amount is required",
    manualErrorDateRequired: "Pick a date",
    walletFieldLabel: "Wallet",
    categoryFieldLabel: "Category",

    merchantLabel: "Merchant",
    merchantPlaceholder: "Where was this?",
    itemsLabel: "Items (optional)",
    discountLabel: "Discount",
    taxLabel: "Tax",
    serviceChargeLabel: "Service charge",
    paymentMethodLabel: "Payment method",
    paymentMethodPlaceholder: "Cash, QRIS, bank transfer…",
    subtotalLabel: "Subtotal",
    totalLabel: "Total",
    cashLabel: "Cash",
    changeLabel: "Change",
    discardButton: "Discard",
    saveButton: "Save",

    // Expense detail sheet (ExpenseDetailModal)
    expenseDetailTitle: "Expense detail",
    sourceScanned: "Scanned",
    sourceManual: "Manual",
    sourceVoice: "Voice",
    unnamedItem: "Unnamed item",
    noLineItemsDetected: "No line items detected.",
    addedOn: "Added {date}",
    deleteButton: "Delete",
    editButton: "Edit",
    deleteExpenseConfirmTitle: "Delete this expense?",
    deleteExpenseConfirmDescription: "This can't be undone.",
    photoUnavailable: "Photo no longer available",
    viewFullscreenLabel: "View full-screen",
    expenseTitleFieldLabel: "Expense title",

    voiceUnsupported: "Voice input not supported on this device",
    voiceTranscribing: "Transcribing…",
    voiceParsing: "Making sense of that…",
    voiceListening: "Recording… tap again to process",
    voiceTapToSpeak: "Tap to speak",
    voiceErrorUnsupported:
      'Voice input isn\'t supported in this browser. Use "Add manually" instead.',
    voiceErrorMicBlocked: "Microphone access is blocked. Allow it in your browser settings.",
    voiceErrorParseFailed: "Unable to understand that expense.",
    voiceErrorTranscribeFailed: "Unable to transcribe that recording.",
    voiceErrorGeneric: "Didn't catch that.",
    voiceErrorUnclear: "Unable to understand your speech. Try speaking more clearly.",
    voiceErrorQuotaExceeded: "Daily voice entry limit reached. Try again tomorrow.",
    voiceErrorNoSpeech: "Didn't catch that. Try again, speak closer to the mic.",

    scannerTryAgain: "Try again",
    scannerChoosePhoto: "Choose photo",
    scannerTapToOpenCamera: "Tap to open camera",
    scannerEnableCamera: "Tap to enable camera",
    scannerReadingReceipt: "Reading receipt…",
    scannerParsingReceipt: "Parsing receipt…",
    scannerLoadingEngine: "Loading OCR engine…",
    scannerErrorUnclear: "Unable to read the receipt. Make sure the image is clear.",
    scannerErrorParseFailed: "Unable to process this receipt.",
    scannerErrorQuotaExceeded: "Daily receipt scan limit reached. Try again tomorrow.",

    // Paste receipt text (Manual entry's second mode)
    textReceiptCard: "Process Text",
    textReceiptPlaceholder:
      "Paste receipt/chat text here, e.g. from laundry, e-commerce, or ride-hailing…",
    textReceiptParsing: "Processing text…",
    textReceiptFallbackTitle: "Receipt",
    textReceiptErrorUnclear: "Unable to understand this text as a receipt.",
    textReceiptErrorParseFailed: "Unable to process this text.",
    textReceiptErrorQuotaExceeded: "Daily paste-receipt limit reached. Try again tomorrow.",
    quotaRemaining: "{remaining}/{limit} left today",
    cameraRequesting: "Requesting camera access…",
    cameraUnavailable: "Camera isn't available on this device/browser.",
    cameraSwitchLabel: "Switch front/back camera",
    pwaUpdatingTitle: "Updating app…",
    pwaUpdatingBody: "Please wait, a new version is being installed.",
    pwaUpdatedTitle: "App updated!",
    pwaUpdatedBody:
      "The application has been successfully updated, you are now using the latest version of the application.",
    pwaUpdatedOk: "OK",
    offlineFeatureUnavailable: "No internet connection. This feature needs it to work.",
    syncOfflineWarning: "No internet connection. Can't sync right now.",
    cameraBlockedTitle: "Camera access blocked",
    cameraBlockedChrome:
      "Click the camera/lock icon in the address bar → Allow, then reload the page.",
    cameraBlockedFirefox:
      "Click the lock icon in the address bar → clear the blocked permission, reload, then Allow when prompted.",
    cameraBlockedSafariMac: "Safari menu → Settings for This Website → Camera → Allow.",
    cameraBlockedIos: "Open the iOS Settings app → Safari → Camera → Allow, then reload the page.",
    cameraBlockedOther: "Check your browser's site settings and allow camera access, then reload.",

    syncTitle: "Google Sheets Sync",
    connectSheets: "Connect Google Sheets",
    syncing: "Syncing…",
    syncFailed: "Sync failed",
    retry: "Retry",
    syncedAt: "Synced {time}",
    notSyncedYet: "Not synced yet",
    copyLink: "Copy spreadsheet link",
    restoreSheets: "Restore from Sheets",
    disconnect: "Disconnect",
    cancel: "Cancel",
    confirmDisconnectTitle: "Disconnect?",
    confirmDisconnectBody:
      "Disconnect this device from Google Sheets? Your local data stays put. Reconnect anytime.",
    confirmRestoreTitle: "Restore from Sheets?",
    confirmRestoreBody:
      "Reconcile the last 7 days with Google Sheets? Older local data stays untouched.",
    connectedAs: "Connected as {email}",

    // Connect / login flow
    connectTitle: "Connect Google Sheets",
    sheetDeletedTitle: "You've been logged out",
    sheetDeletedBody:
      "The connected Google Sheet appears to have been deleted, so this device was disconnected automatically. Your local data is still here. Connect a new sheet to resume syncing.",
    sheetDeletedOk: "OK",
    needsReauthTitle: "Reconnect needed",
    needsReauthBody:
      "Syncing needs a fresh connection to Google. Local data is still here. Click to continue.",
    connectBody: "Connect your Google Sheet to get started. It's where your expenses live.",
    connectWithGoogle: "Connect with Google",
    connectErrorNoCode: "Google didn't return an authorization code. Try signing in again.",
    connectErrorStateMismatch: "This sign-in link was already used or expired. Try again.",
    sheetSecretInvalid: "Invalid sync secret.",
    sheetSecretBanned: "This sync secret was temporarily banned after a spreadsheet mismatch.",
    sheetSecretAlreadyBound: "This sync secret is already bound to a different spreadsheet.",
    googleSignInDidntLoad: "Google sign-in didn't load. Check your connection and try again.",
    googlePopupNoResponse:
      "Google sign-in popup didn't respond. Allow popups for this site and try again.",
    googleAccessDenied: "Could not get Google Drive/Sheets access.",
    googleNoEmail: "Google didn't return an email for this account.",
    googleSignInFailed: "Google sign-in failed. Please try again.",
    googleLoginButton: "Continue with Google",
    googleSigningIn: "Signing in with Google…",
    googleVerifying: "Verifying with our server…",
    googleSearching: "Checking for an existing spreadsheet…",
    googleCreatingSheet: "Creating your spreadsheet…",
    googleBuildingStructure: "Setting up the Stats page…",
    homeConnectWarningPrefix: "Sign in with Google to add expenses.",
    connectStepVerifying: "Confirming this sync secret with our server…",
    connectStepMerging: "Merging with data already on this device…",
    connectStepSaving: "Saving to your Google Sheet…",

    dueToday: "Due today",
    dueTomorrow: "Due tomorrow",
    dueInDays: "Due in {days} days",
    manage: "Manage",

    analyticsTitle: "Analytics & Insights",
    thisYear: "This Year",
    rangeLast3Months: "Last 3 Months",
    rangeLast6Months: "Last 6 Months",
    totalSpending: "Total Spending",
    dailyAverage: "Daily Average",
    topSpendingCategory: "Top Category",
    peakSpending: "Peak Spending",
    spendingTrend: "Spending Trend Over Time",
    categoryBreakdown: "Category Breakdown",
    noDataYet: "No data yet for this period.",

    catFoodSnack: "Food & Snack",
    catGrocery: "Grocery",
    catTransportation: "Transportation",
    catBills: "Bills",
    catSubscription: "Subscription",
    catInvestment: "Investment",
    catEntertainment: "Entertainment",
    catOther: "Other",
  },
} as const;

export type TKey = keyof typeof translations.id;

/** `translations.id` is authoritative for the key set — `en` falls back to
 * the `id` string if a key is ever missing there rather than showing a
 * raw key, since `id` is the primary/default language here. */
export const t = (lang: Lang, key: TKey, params?: Record<string, string | number>): string => {
  let str: string = translations[lang][key] ?? translations.id[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) str = str.replace(`{${k}}`, String(v));
  }
  return str;
};

// BE (text-processing-slm's checkIdentity) throws these exact English
// strings in its {error:{message}} response — sheets-sync.api.ts's
// validateSheetSecret propagates them verbatim, so without this they'd
// show in English regardless of app language. Anything not in this map
// (unexpected/future BE message) passes through unchanged rather than
// disappearing.
const BACKEND_MESSAGE_KEYS: Record<string, TKey> = {
  "Invalid sheet secret": "sheetSecretInvalid",
  "Sheet secret temporarily banned after a spreadsheet mismatch": "sheetSecretBanned",
  "Sheet secret is already bound to a different spreadsheet": "sheetSecretAlreadyBound",
  // google-auth.ts throws these client-side (no BE involved) — same
  // untranslated-English problem as the BE strings above, same fix.
  "Google sign-in didn't load. Check your connection and try again.": "googleSignInDidntLoad",
  "Google sign-in popup didn't respond. Allow popups for this site and try again.":
    "googlePopupNoResponse",
  "Could not get Google Drive/Sheets access.": "googleAccessDenied",
  "Google didn't return an email for this account.": "googleNoEmail",
  "Google sign-in failed. Please try again.": "googleSignInFailed",
};

export const translateBackendMessage = (message: string, lang: Lang): string => {
  const key = BACKEND_MESSAGE_KEYS[message];
  return key ? t(lang, key) : message;
};
