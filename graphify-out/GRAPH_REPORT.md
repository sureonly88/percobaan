# Graph Report - percobaan  (2026-11-11)

## Corpus Check
- 339 files · ~303,274 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 3, .log 2, .bat 2)

## Summary
- 2421 nodes · 5806 edges · 141 communities (132 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 85 edges (avg confidence: 0.85)
- Token cost: 612,375 input · 0 output

## Community Hubs (Navigation)
- Payment Link Self-Service
- Mobile Auth & Finance APIs
- Multipay & Cashier Closing APIs
- Auth & Receipt Builders
- Lunasin Inquiry & Circuit Breaker
- Cron Jobs
- PDAM Inquiry & Advice API
- Dashboard & Report APIs
- Amount Validation & Notifications
- Cashier Closing Printing
- Lunasin Advice UI & Primitives
- Mobile History & Reports
- Bill Check & Payment UI
- Mobile Payment Cart
- Print Bridge Server
- Payment Page
- Paid Invoice Processing
- Reconciliation Import
- PDAM Provider Client
- Crypto & Public Features
- Mobile Account & RBAC
- ESC/P Receipt Formatter
- Report Page & Browser Receipts
- DB Manage API
- Finance Pages (Margin, Trial Balance)
- Transaction Void & GL Journal
- Transaction Review (Maker-Checker)
- DB Manage UI
- Lunasin Provider Client
- Balance Hold & Lunasin Advice
- Reliability Hardening Proposals
- Settings & Provider Keys
- Monitoring Detail Pages
- Multipay Provider Adapters
- Dev Dependencies
- Known Gaps & Platform Concepts
- GL Posting Design
- OpenTelemetry Instrumentation
- Commission Calculation
- Multipay Orchestrator
- Root Layout & Settings Page
- Customer Page
- Multipay Detail & Topup UI
- Mobile Receipt Sharing
- Dashboard Analytics Charts
- Transaction History Page
- Ledger, GL & Receipt Principles
- Inquiry Monitoring Tab
- Cashier Verification UI
- Browser Receipt Printer
- TypeScript Config
- PDAM Recon Email Cron
- Commission Rules API
- Runtime Dependencies
- Provider API Docs Page
- Setup & Transaction Import API
- In-App User Guide
- Print Bridge HTTPS Setup
- Monitoring Charts
- Payment Link Disputes API
- Payment Links & Stale Pending API
- Reconciliation Page
- Mock Data & Shared Types
- Self-Service Payment Rules
- OpenTelemetry Packages
- Settlement Batch API
- Transaction Import UI
- Mobile Shell & Layout
- Pending Transactions UI
- Reconciliation Detail Builders
- Advice Policy & Audit Chain
- Commission Report Page
- Loket Members Page
- Mobile Home Dashboard
- Notifications Page
- Disputes Page
- Notification Center UI
- Main Dashboard Page
- Payment Links Page
- DB Migration Script
- RBAC Check Script
- Mobile JWT Tokens
- Risk Monitoring Page
- Review Transactions Page
- Balance Page
- Finance & Settlement Concepts
- Customer API
- Monitoring Logs Page
- Provider Page
- Users Page
- Mock Customers
- Payment Link Codes & Masking
- Print Bridge Package
- Dashboard Design Screenshot
- PLN Non-Bill Simulator
- Telkom Simulator
- Favorite Groups API
- Favorites API
- Multipay Detail API & Kasir Scope
- Provider Health Page
- Void Request Page
- Reconciliation Excel Export
- BPJS Simulator
- Pulsa Simulator
- PDAM Advice Page
- Inquiry Monitoring API
- Risk Monitoring API
- Invoice Detail API
- Commission Rules Page
- Finance Overview Page
- Registrations Page
- Reconciliation Matching
- Middleware & RBAC Policy
- NPM Scripts
- Reprint Page
- Journal Page
- Loket Page
- PWA Offline Support
- README & Design System
- Reconciliation Batch Detail API
- Admin Fee Page
- Chart of Accounts Page
- General Ledger Page
- Settlement Detail Page
- Button Component
- Payment Illustration
- Pedami Detail Report API
- Reconciliation Batches API
- Settlement List Page
- Tailwind Config
- Health Check API
- Pedami Report API
- Reprint API
- Reconciliation Preview
- Next.js Config
- Copilot Instructions
- Cert Generation Script
- Apple Touch Icon
- PWA SVG Icon
- PWA 512 Icon

## God Nodes (most connected - your core abstractions)
1. `next` - 149 edges
2. `denyIfUnauthorized()` - 120 edges
3. `getAuthToken()` - 101 edges
4. `mysql2` - 97 edges
5. `react` - 82 edges
6. `next-auth` - 72 edges
7. `unauthorized()` - 65 edges
8. `auditLog()` - 52 edges
9. `normalizeRole()` - 49 edges
10. `Fitur Self-Service, Payment Link, dan Struk Digital` - 43 edges

## Surprising Connections (you probably didn't know these)
- `Unknown Provider Outcome Is Not Failure` --references--> `isPdamOutcomeUnknown()`  [AMBIGUOUS]
  CLAUDE.md → src/lib/pdam-api.ts
- `Append-Only GL Journal with REVERSAL` --semantically_similar_to--> `Append-Only General Ledger`  [INFERRED] [semantically similar]
  CLAUDE.md → docs/fitur-keuangan-akuntansi.md
- `Portal Utilitas PLN Payment App` --semantically_similar_to--> `Portal Utilitas PPOB Platform`  [INFERRED] [semantically similar]
  README.md → docs/dokumentasi-portal-utilitas.md
- `HTTPS Print Bridge via Self-Signed Certificate` --conceptually_related_to--> `CORS Whitelist localhost / 127.0.0.1`  [AMBIGUOUS]
  docs/setup-print-bridge.md → print-bridge/README.md
- `Dual-Mode API Auth (cookie + mobile Bearer JWT)` --references--> `getAuthToken()`  [EXTRACTED]
  docs/dokumentasi-portal-utilitas.md → src/lib/api-auth.ts

## Import Cycles
- 2-file cycle: `src/lib/lunasin-api.ts -> src/lib/lunasin-mock.ts -> src/lib/lunasin-api.ts`
- 2-file cycle: `src/lib/pdam-api.ts -> src/lib/pdam-mock.ts -> src/lib/pdam-api.ts`

## Hyperedges (group relationships)
- **Money Safety Rules (hold, ledger, unknown-outcome, maker-checker)** — claude_balance_hold_model, claude_balance_ledger, claude_unknown_outcome_rule, claude_maker_checker, claude_server_side_amount_validation [EXTRACTED 1.00]
- **Cron Endpoints Protected by Secret and system_jobs Lock** — docs_cron_rekon_pdam_email_job_lock, docs_fitur_operasional_keandalan_system_jobs_lock, docs_fitur_keuangan_akuntansi_settlement_cron, docs_analisa_mendalam_aplikasi_pembayaran_cron_job_lock, docs_fitur_operasional_keandalan_cron_secret [INFERRED 0.85]
- **Append-Only GL with Reversal Corrections** — claude_append_only_gl, docs_fitur_keuangan_akuntansi_general_ledger, docs_fitur_keuangan_akuntansi_reversal_entry, docs_dokumentasi_portal_utilitas_general_ledger [INFERRED 0.85]
- **Alur invoice → Midtrans → webhook → worker → multipay → struk digital** — docs_rencana_payment_link_struk_digital_payment_invoices, docs_rencana_payment_link_struk_digital_midtrans_snap, docs_rencana_payment_link_struk_digital_payment_links_webhook, docs_rencana_payment_link_struk_digital_process_paid_invoices_worker, docs_rencana_payment_link_struk_digital_orchestratemultipayment, docs_rencana_payment_link_struk_digital_digital_receipt [EXTRACTED 1.00]
- **Pengaman idempotensi payment link** — docs_rencana_payment_link_struk_digital_idempotency_layers, docs_rencana_payment_link_struk_digital_payment_invoices, docs_rencana_payment_link_struk_digital_multi_payment_requests, docs_rencana_payment_link_struk_digital_payment_links_webhook [EXTRACTED 1.00]
- **Formatter struk ganda mendukung digitalReceiptUrl** — src_lib_print_receipt, print_bridge_formatter, docs_fitur_self_service_payment_link_struk_digital_digital_receipt_url [EXTRACTED 1.00]
- **Print Bridge HTTPS Setup Flow** — docs_setup_print_bridge_gen_cert, print_bridge_server, docs_setup_print_bridge_trust_certificate, docs_setup_print_bridge_url_bridge_setting [EXTRACTED 1.00]
- **Receipt Print Pipeline (config + template + formatter + server)** — print_bridge_server, print_bridge_formatter, print_bridge_config, print_bridge_template, print_bridge_readme_epson_lx_310 [INFERRED 0.85]
- **One Bill Per Page Fitting** — print_bridge_readme_one_bill_one_page, print_bridge_readme_line_drop_priority, print_bridge_config, print_bridge_formatter [EXTRACTED 1.00]

## Communities (141 total, 9 thin omitted)

### Community 0 - "Payment Link Self-Service"
Cohesion: 0.05
Nodes (67): Fitur Self-Service, Payment Link, dan Struk Digital, digitalReceiptUrl (field formatter struk), Payment Link dari hasil inquiry kasir (/pembayaran), Refund/Dispute FAILED_PROVIDER (/payment-links/disputes), Checklist production payment link, PUBLIC_PAYMENT_LOKET_CODE (legacy), Self-Service Cek Tagihan (/cek-tagihan), POST /api/public/self-service/inquiry (+59 more)

### Community 1 - "Mobile Auth & Finance APIs"
Cohesion: 0.05
Nodes (60): GET(), PATCH(), PATCH(), GET(), PATCH(), POST(), GET(), GET() (+52 more)

### Community 2 - "Multipay & Cashier Closing APIs"
Cohesion: 0.07
Nodes (74): authorize(), GET(), MultiPaymentListRow, POST(), GET(), getSessionUser(), handleError(), PATCH() (+66 more)

### Community 3 - "Auth & Receipt Builders"
Cohesion: 0.07
Nodes (25): buildReceiptDataFromMultiPaymentCode / buildReceiptDataFromTransactionCode / sanitizePublicReceiptData, bcryptjs, mysql2, next, next-auth, adminOnly(), GET(), getPendingCount() (+17 more)

### Community 4 - "Lunasin Inquiry & Circuit Breaker"
Cohesion: 0.08
Nodes (39): POST(), checkCircuit(), CircuitBreakerConfig, CircuitBreakerState, CircuitOpenError, circuits, CircuitState, configs (+31 more)

### Community 5 - "Cron Jobs"
Cohesion: 0.09
Nodes (34): dynamic, GET, handle(), num(), POST, runtime, POST(), dynamic (+26 more)

### Community 6 - "PDAM Inquiry & Advice API"
Cohesion: 0.11
Nodes (32): Trusted-Proxy-Aware IP Allowlist, POST(), ItemRow, processAdviceTransaction(), POST(), POST(), recordInternalTransaction(), sendWebhookIfConfigured() (+24 more)

### Community 7 - "Dashboard & Report APIs"
Cohesion: 0.10
Nodes (32): GET(), GET(), GET(), GET(), POST(), PUT(), categorizeError(), enumerateDates() (+24 more)

### Community 8 - "Amount Validation & Notifications"
Cohesion: 0.12
Nodes (32): createNotificationSafe, POST(), POST(), POST(), applyLunasinInquirySnapshots(), buildRequestHash(), LunasinBill, PaymentRequestRow (+24 more)

### Community 9 - "Cashier Closing Printing"
Cohesion: 0.08
Nodes (33): CashierOption, ClosingDenomination, ClosingDetail, ClosingHistoryItem, ClosingStatus, ClosingSummary, DiscrepancyReasonOption, formatDateTime() (+25 more)

### Community 10 - "Lunasin Advice UI & Primitives"
Cohesion: 0.10
Nodes (29): AdviceLunasinPage(), AdviceResultItem, AdviceResultStatus, AttemptFilter, BatchProgress, formatNumber(), formatRupiah(), formatTanggal() (+21 more)

### Community 11 - "Mobile History & Reports"
Cohesion: 0.11
Nodes (33): Bucket, CLOSING_LABEL, fmtTgl(), MobileLaporanPage(), shareWhatsApp(), PeriodKey, periodRange(), PERIODS (+25 more)

### Community 12 - "Bill Check & Payment UI"
Cohesion: 0.08
Nodes (31): CekTagihanPage(), buildProductPayload(), handleCreatePaymentLink(), handleInquiry(), formatRp(), InquiryItem, InquiryResult, PLN_TOKEN_NOMINALS (+23 more)

### Community 13 - "Mobile Payment Cart"
Cohesion: 0.11
Nodes (30): BottomAction(), CartItem, cashChips(), Chip(), ErrorBox(), LoketInfo, MobileBayarProdukPage(), handleInquiry() (+22 more)

### Community 14 - "Print Bridge Server"
Cohesion: 0.08
Nodes (28): CORS Whitelist localhost / 127.0.0.1, Node.js >= 18 Requirement (print-bridge), buildEscp(), CERT_PATH, config, CONFIG_PATH, DEFAULT_TEMPLATE, detectPrinters() (+20 more)

### Community 15 - "Payment Page"
Cohesion: 0.11
Nodes (21): PembayaranPage(), focusField(), generateIdempotencyKey(), getLunasinServiceType(), getServiceTypeLabel(), handleBayar(), handleBayarPln(), handleBayarSemua() (+13 more)

### Community 16 - "Paid Invoice Processing"
Cohesion: 0.16
Nodes (27): POST(), MultiPaymentProvider, generateGatewayOrderId(), generateInvoiceCode(), randomToken(), addInvoiceEvent(), claimInvoiceForProviderProcessing(), createPaymentInvoice() (+19 more)

### Community 17 - "Reconciliation Import"
Cohesion: 0.08
Nodes (29): getProvider(), POST(), BaseTransactionRow, CellValue, cleanText(), importProviderReconciliationFile(), JsonRecord, LUNASIN_DETAIL_KEY_MAP (+21 more)

### Community 18 - "PDAM Provider Client"
Cohesion: 0.16
Nodes (27): isAdviceConfirmingPeriods(), isPdamOutcomeUnknown(), PDAM_ERROR_CODES, PDAM_PAYMENT_ERROR_CODES, pdamAdvice(), PdamAdviceExecutionResult, PdamAdviceResponse, PdamAdviceResultObj (+19 more)

### Community 19 - "Crypto & Public Features"
Cohesion: 0.18
Nodes (18): PATCH(), dynamic, GET(), POST(), GET(), GET(), POST(), POST() (+10 more)

### Community 20 - "Mobile Account & RBAC"
Cohesion: 0.14
Nodes (20): InstallPrompt, MenuRow(), MobileAkunPage(), canAccessApi(), getAccessiblePages(), normalizeRole(), ROLE_LABELS, useStuckTransactionDetector() (+12 more)

### Community 21 - "ESC/P Receipt Formatter"
Cohesion: 0.15
Nodes (21): clampInt(), detailCell(), detailLine(), fmtPeriode(), fmtPeriodeList(), fmtRp(), fmtTanggal(), fmtTglReg() (+13 more)

### Community 22 - "Report Page & Browser Receipts"
Cohesion: 0.12
Nodes (24): DetailItem, exportCSV(), exportDetailCSV(), fmtToken(), formatNumber(), formatRupiah(), formatTanggal(), getDetailFields() (+16 more)

### Community 23 - "DB Manage API"
Cohesion: 0.20
Nodes (20): POST(), POST(), serialize(), GET(), DELETE(), GET(), getColumns(), getValidTable() (+12 more)

### Community 24 - "Finance Pages (Margin, Trial Balance)"
Cohesion: 0.10
Nodes (17): react, fmtRp(), GroupBy, Kpi(), MarginPage(), MarginRow, fmtRp(), NeracaSaldoPage() (+9 more)

### Community 25 - "Transaction Void & GL Journal"
Cohesion: 0.17
Nodes (22): authorize(), errorResponse(), GET(), PATCH(), POST(), JournalLineInput, getTrustedClientIp(), getTransactionVoid() (+14 more)

### Community 26 - "Transaction Review (Maker-Checker)"
Cohesion: 0.18
Nodes (22): authorize(), errorResponse(), GET(), PATCH(), POST(), approveFailedReview(), getReview(), iso() (+14 more)

### Community 27 - "DB Manage UI"
Cohesion: 0.13
Nodes (19): authHeader(), CellValue(), ColumnInfo, DbManagePage(), handleDeleteConfirm(), handleRunSql(), formatCellValue(), formatSize() (+11 more)

### Community 28 - "Lunasin Provider Client"
Cohesion: 0.18
Nodes (24): LunasinAdviceResult, LunasinInquiryResult, LunasinPaymentResult, LunasinResponse, LunasinResponseData, buildInquiryData(), detectScenario(), fakeRefnum() (+16 more)

### Community 29 - "Balance Hold & Lunasin Advice"
Cohesion: 0.17
Nodes (20): findIdempotencyKeyByTransactionCode(), POST(), safeJsonParse(), syncMultiPaymentParent(), syncPaymentRequestFromLunasinAdvice(), sendToReviewIfAdviceExhausted(), BalanceLedgerInfo, BalanceMutationOptions (+12 more)

### Community 30 - "Reliability Hardening Proposals"
Cohesion: 0.12
Nodes (20): DB Amount CHECK Constraints, Audit Log Operationalization, Cron Job Lock (system_jobs), Analisa Mendalam Aplikasi Pembayaran, External Alert Dispatcher, Manual Midtrans Gateway Status Sync, Liveness/Readiness Health Split, Migration Safety (+12 more)

### Community 31 - "Settings & Provider Keys"
Cohesion: 0.12
Nodes (17): GET(), GET(), maskSensitiveSettings(), PUT(), POST(), DELETE(), GET(), POST() (+9 more)

### Community 32 - "Monitoring Detail Pages"
Cohesion: 0.12
Nodes (20): DetailData, ERROR_STYLE, formatDateTime(), formatDuration(), MonitoringDetailPage(), handleReprint(), Props, STATUS_STYLE (+12 more)

### Community 33 - "Multipay Provider Adapters"
Cohesion: 0.18
Nodes (17): adapters, buildHeaders(), LegacyLunasinBill, LunasinProviderAdapter, mapLegacyResponseToResults(), mapLunasinStatus(), toLegacyLunasinBill(), buildHeaders() (+9 more)

### Community 34 - "Dev Dependencies"
Cohesion: 0.12
Nodes (22): devDependencies, autoprefixer@^10.4.0, dotenv@^17.4.2, postcss@^8.4.0, @types/bcryptjs@^2.4.6, @types/node@^20.0.0, @types/react@^18.3.0, @types/react-dom@^18.3.0 (+14 more)

### Community 35 - "Known Gaps & Platform Concepts"
Cohesion: 0.12
Nodes (22): Known Gaps (manual SUCCESS tx, advice GL/commission, Node guard), Mobile PWA for Field Agents (/m), Print Bridge Pairing Token, NEXT_PHASE Build-Time Env Guard, Circuit Breaker, Commission / Profit Sharing, Cron Jobs (settlement-daily, auto-advice), Database Schema (pedami_payment) (+14 more)

### Community 36 - "GL Posting Design"
Cohesion: 0.15
Nodes (20): Unique GL Posting Key, Best-Effort GL Posting, Akuntansi online: Piutang Payment Gateway (1202) & Beban MDR (5102), postPaymentSuccess, ACCOUNT, formatDate(), generateEntryNo(), hasJournalForSource() (+12 more)

### Community 37 - "OpenTelemetry Instrumentation"
Cohesion: 0.13
Nodes (22): register(), @opentelemetry/api-logs@^0.214.0, @opentelemetry/auto-instrumentations-node@^0.72.0, @opentelemetry/exporter-logs-otlp-http@^0.214.0, @opentelemetry/exporter-metrics-otlp-http@^0.214.0, @opentelemetry/exporter-trace-otlp-http@^0.214.0, @opentelemetry/resources@^2.6.1, @opentelemetry/sdk-logs@^0.214.0 (+14 more)

### Community 38 - "Commission Calculation"
Cohesion: 0.14
Nodes (20): POST(), CommissionBasis, CommissionContext, CommissionRule, CommissionScope, CommissionTarget, CommissionType, computeCommission() (+12 more)

### Community 39 - "Multipay Orchestrator"
Cohesion: 0.18
Nodes (20): buildFinalStatus(), emit(), estimateMaxMsForProvider(), generateItemCode(), generateMultiPaymentCode(), MultiPaymentRuntimeContext, normalizeItems(), orchestrateMultiPayment() (+12 more)

### Community 40 - "Root Layout & Settings Page"
Cohesion: 0.14
Nodes (15): metadata, RootLayout(), BridgeConfig, BridgePrinter, BridgeTemplate, PengaturanPage(), ProfileData, settingEnabled() (+7 more)

### Community 41 - "Customer Page"
Cohesion: 0.15
Nodes (19): ActiveTab, emptyForm, emptyPlnForm, fmtToken(), formatNumber(), formatPeriode(), formatRupiah(), getLunasinDetailFields() (+11 more)

### Community 42 - "Multipay Detail & Topup UI"
Cohesion: 0.13
Nodes (14): formatRupiah(), formatTanggal(), MultiPaymentDetail, MultiPaymentDetailItem, MultiPaymentDetailPage(), Props, ActiveTopup, formatRupiah() (+6 more)

### Community 43 - "Mobile Receipt Sharing"
Cohesion: 0.17
Nodes (18): buildLines(), buildReceiptImage(), buildReceiptText(), extrasFromProviderData(), fmtTanggal(), formatPeriodeList(), Line, ReceiptItemStatus (+10 more)

### Community 44 - "Dashboard Analytics Charts"
Cohesion: 0.16
Nodes (17): AnalyticsData, BAR_COLORS, ChartTooltip(), DashboardAnalytics(), DAY_LABELS, formatFull(), formatRupiah(), HeatmapCell (+9 more)

### Community 45 - "Transaction History Page"
Cohesion: 0.16
Nodes (16): formatRupiah(), formatTanggal(), formatTanggalShort(), getStatusClass(), getStatusLabel(), groupByDate(), MultiPaymentDetail, MultiPaymentDetailItem (+8 more)

### Community 46 - "Ledger, GL & Receipt Principles"
Cohesion: 0.16
Nodes (11): Append-Only GL Journal with REVERSAL, Loket Balance Ledger, CLAUDE.md Project Notes (Pedami Payment), Manual Saldo Update (MANUAL_ADJUST, admin only), Single-Source Navigation Config, Pedami Payment Multi-Product Counter App, PDAM / Lunasin Mock Scenarios, Stale Pending Transactions (/pending-transaksi) (+3 more)

### Community 47 - "Inquiry Monitoring Tab"
Cohesion: 0.14
Nodes (14): ERROR_CATEGORY_CONFIG, ERROR_FILTER_TABS, formatTime(), getDefaultMonthRange(), InquiryErrorCategoryFilter, InquiryItem, InquiryMonitoringData, InquiryMonitoringTab() (+6 more)

### Community 48 - "Cashier Verification UI"
Cohesion: 0.16
Nodes (15): ClosingItem, ClosingStatus, formatDateTime(), formatNumber(), formatRupiah(), getStatusLabel(), getStatusStyle(), getToday() (+7 more)

### Community 49 - "Browser Receipt Printer"
Cohesion: 0.20
Nodes (15): detailCell(), escapeHtml(), fmtPeriode(), fmtPeriodeList(), fmtRp(), fmtTanggal(), fmtTglReg(), formatReceiptPlainText() (+7 more)

### Community 50 - "TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+9 more)

### Community 51 - "PDAM Recon Email Cron"
Cohesion: 0.18
Nodes (15): X-Cron-Secret Header Auth, Cron Rekonsiliasi PDAM Email, system_jobs Job Lock, Daily PDAM Reconciliation Excel Email Job, SMTP Configuration (.env), systemd Timer Scheduling, getYesterday(), RekonPdamEmailOptions (+7 more)

### Community 52 - "Commission Rules API"
Cohesion: 0.14
Nodes (16): BASES, Basis, DELETE(), dynamic, GET(), mapRule(), PATCH(), POST() (+8 more)

### Community 53 - "Runtime Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, bcryptjs@^3.0.3, mysql2@^3.20.0, next@^14.2.0, next-auth@^4.24.13, nodemailer@^7.0.13, @opentelemetry/sdk-trace-base@^2.6.1, react@^18.3.0 (+8 more)

### Community 54 - "Provider API Docs Page"
Cohesion: 0.38
Nodes (15): ApiDocsPage(), AuthSection(), Badge(), CodeBlock(), Endpoint(), ErrorsSection(), ExamplesSection(), InquirySection() (+7 more)

### Community 55 - "Setup & Transaction Import API"
Cohesion: 0.18
Nodes (11): ExportItem, ExportPayment, ExportRecord, fetchExportPage(), GET(), ImportStats, maxDuration, normalizeRecord() (+3 more)

### Community 56 - "In-App User Guide"
Cohesion: 0.19
Nodes (13): In-App User Guide (/panduan), ADMIN_SPV, ALL, GUIDE_SECTIONS, GuideFeature, GuideRole, GuideSection, ROLE_NAMES (+5 more)

### Community 57 - "Print Bridge HTTPS Setup"
Cohesion: 0.17
Nodes (14): Setup Print Bridge (doc), gen-cert.bat / gen-cert.sh (TLS cert generation), Browser Mixed-Content Compatibility Matrix, Print Bridge Troubleshooting (setup doc), Trust Certificate in Browser (once per browser), URL Bridge Setting (Pengaturan > Printer), print-bridge/config.json, Pedami Print Bridge README (+6 more)

### Community 58 - "Monitoring Charts"
Cohesion: 0.14
Nodes (14): recharts@^3.8.1, recharts, ERROR_CATEGORY_CONFIG, ErrorCategoryFilter, getDefaultMonthRange(), LogEntry, MonitoringData, MonitoringTransaction (+6 more)

### Community 59 - "Payment Link Disputes API"
Cohesion: 0.28
Nodes (13): canManage(), disabledResponse(), GET(), PATCH(), ensureDisputeForInvoice(), isPaymentDisputeStatus(), listDisputes(), mapRow() (+5 more)

### Community 60 - "Payment Links & Stale Pending API"
Cohesion: 0.25
Nodes (13): disabledResponse(), GET(), POST(), ACTIONS, GET(), PATCH(), requireAdmin(), StaleAction (+5 more)

### Community 61 - "Reconciliation Page"
Cohesion: 0.16
Nodes (13): formatNumber(), formatRupiah(), getToday(), LoketOption, LunasinPreviewRow, PdamPreviewRow, PreviewResponse, ProviderImportItem (+5 more)

### Community 62 - "Mock Data & Shared Types"
Cohesion: 0.15
Nodes (11): BIAYA_ADMIN_PER_TAGIHAN, pelangganList, tagihanDatabase, WILAYAH_OPTIONS, CustomerFavorite, FavoriteGroup, FavoriteGroupItem, NavLink (+3 more)

### Community 63 - "Self-Service Payment Rules"
Cohesion: 0.21
Nodes (14): assertService(), getLunasinServiceType(), getPeriodLabel(), getSelfServiceLoket(), getServiceLabel(), inquirySelfService(), resolveLunasinProduct(), resolveTokenNominal() (+6 more)

### Community 65 - "Settlement Batch API"
Cohesion: 0.30
Nodes (12): GET(), PATCH(), approveBatch(), dateOnly(), findEligibleTransactions(), generateBatchCode(), generateDailyBatches(), getBatch() (+4 more)

### Community 66 - "Transaction Import UI"
Cohesion: 0.18
Nodes (11): ImportLog, ImportStats, ImportTransaksiPage(), handleImport(), handlePreview(), isFormValid(), JENIS_OPTIONS, JenisType (+3 more)

### Community 67 - "Mobile Shell & Layout"
Cohesion: 0.23
Nodes (10): MobileBayarPage(), metadata, MobileLayout(), viewport, isNavActive(), MOBILE_NAV, MobileNavItem, MobileHeader() (+2 more)

### Community 68 - "Pending Transactions UI"
Cohesion: 0.21
Nodes (13): ActionResult, CONTACT_LABEL, formatRupiah(), formatTanggal(), groupByTransaction(), PendingTransaksiPage(), handleAction(), providerBadge() (+5 more)

### Community 69 - "Reconciliation Detail Builders"
Cohesion: 0.25
Nodes (14): buildLunasinDetail(), buildLunasinExportRows(), buildPdamDetail(), buildPdamExportRows(), formatDateTime(), getLunasinSheetName(), getNumeric(), getProductLabel() (+6 more)

### Community 70 - "Advice Policy & Audit Chain"
Cohesion: 0.23
Nodes (11): Advice Attempt Limit (ADVICE_MAX_ATTEMPTS), Hash-Chained Audit Log, Audit Chain Verification (verifyAuditChain), Auto-Resolve Pending Worker, Circuit States CLOSED/OPEN/HALF_OPEN, CRON_SECRET Cron Auth, Fitur Operasional & Keandalan, Immutable Hash-Chained Audit Log (+3 more)

### Community 71 - "Commission Report Page"
Cohesion: 0.21
Nodes (12): Beneficiary, defaultStart(), DetailItem, fmtDate(), fmtRp(), LaporanKomisiPage(), PerLoket, PerProvider (+4 more)

### Community 72 - "Loket Members Page"
Cohesion: 0.17
Nodes (5): formatDate(), INITIAL_FORM, LoketInfo, LoketMembersPage(), Member

### Community 73 - "Mobile Home Dashboard"
Cohesion: 0.18
Nodes (10): DashboardData, MobileBerandaPage(), SaldoInfo, Stat(), BULAN, MOBILE_PRODUCTS, MobileProduct, MobileProductKind (+2 more)

### Community 74 - "Notifications Page"
Cohesion: 0.19
Nodes (12): CATEGORIES, CATEGORY_ICONS, formatDate(), NotificationPagination, NotificationSummary, NotifikasiPage(), SEVERITIES, SEVERITY_STYLES (+4 more)

### Community 75 - "Disputes Page"
Cohesion: 0.21
Nodes (9): DisputeRow, DisputeStatus, formatRp(), Info(), MetricCard(), Pagination, PaymentDisputesPage(), STATUS_OPTIONS (+1 more)

### Community 76 - "Notification Center UI"
Cohesion: 0.19
Nodes (10): AppNotification, CATEGORY_ICONS, NotificationCenter(), SEVERITY_COLORS, timeAgo(), SEVERITY_STYLES, Toast, ToastContext (+2 more)

### Community 77 - "Main Dashboard Page"
Cohesion: 0.24
Nodes (11): DashboardAnalytics, DashboardData, DashboardPage(), formatRupiah(), formatTanggal(), KATEGORI_CONFIG, KategoriHariIni, KategoriSummary (+3 more)

### Community 78 - "Payment Links Page"
Cohesion: 0.20
Nodes (8): formatDate(), formatRp(), InvoiceDetail, InvoiceEvent, InvoiceItem, InvoiceRow, PaymentLinksPage(), STATUS_OPTIONS

### Community 79 - "DB Migration Script"
Cohesion: 0.22
Nodes (8): bcrypt, fs, main(), mysql, path, runStatements(), seedAdmin(), SKIP_ERRNO

### Community 80 - "RBAC Check Script"
Cohesion: 0.25
Nodes (10): apiCalls(), APP, fs, inlineDenies(), loadRbac(), main(), pageFile(), path (+2 more)

### Community 81 - "Mobile JWT Tokens"
Cohesion: 0.36
Nodes (9): POST(), b64url(), createTokenPair(), getSecret(), MobileUserPayload, signJwt(), verifyAccessToken(), verifyJwt() (+1 more)

### Community 82 - "Risk Monitoring Page"
Cohesion: 0.25
Nodes (10): formatDate(), QUICK_ACTIONS, RiskDashboardPage(), RiskItem, RiskResponse, RiskSeverity, RiskSummary, riskTone() (+2 more)

### Community 83 - "Review Transactions Page"
Cohesion: 0.27
Nodes (10): EmptyState(), formatDateTime(), formatRupiah(), ModalActions(), ModalShell(), QueueItem, ReviewTransaksiPage(), Tab (+2 more)

### Community 84 - "Balance Page"
Cohesion: 0.22
Nodes (5): formatRupiah(), LoketOption, SaldoHistory, SaldoPage(), handleSubmit()

### Community 85 - "Finance & Settlement Concepts"
Cohesion: 0.36
Nodes (10): Settlement Based on Successful Items, Best-Effort GL Posting, No Backfill, Chart of Accounts (13 seeded accounts), Fitur Keuangan & Akuntansi, Financial Reports (Jurnal, Buku Besar, Neraca Saldo, Margin), Append-Only General Ledger, net_payable = gross - admin fee, Automatic Posting Rules (+2 more)

### Community 86 - "Customer API"
Cohesion: 0.33
Nodes (9): DELETE(), GET(), getPlnTransaksi(), KATEGORI_PREFIX, parseJson(), parseMetaNum(), POST(), PUT() (+1 more)

### Community 87 - "Monitoring Logs Page"
Cohesion: 0.22
Nodes (3): MonitoringPage(), fetchLogs(), handleExpand()

### Community 88 - "Provider Page"
Cohesion: 0.24
Nodes (8): formatRupiah(), formatTanggal(), ProviderData, ProviderPage(), ProviderTransaction, STATUS_BADGE, Summary, TX_STATUS_BADGE

### Community 89 - "Users Page"
Cohesion: 0.24
Nodes (9): formatTanggal(), LoketOption, UserData, UsersPage(), getAllRoles(), ROLE_COLORS, ROLE_DESCRIPTIONS, ROLE_ICONS (+1 more)

### Community 90 - "Mock Customers"
Cohesion: 0.20
Nodes (9): MOCK_BPJS, MOCK_LUNASIN_ERROR, MOCK_PDAM, MOCK_PDAM_LUNASIN, MOCK_PLN_NONREK, MOCK_PLN_POSTPAID, MOCK_PLN_PREPAID, MOCK_PULSA (+1 more)

### Community 91 - "Payment Link Codes & Masking"
Cohesion: 0.44
Nodes (7): getAppBaseUrl(), maskIdentifier(), maskPhone(), toPublicInvoice(), findInvoiceByReceiptToken(), buildDigitalReceipt(), parseJson()

### Community 92 - "Print Bridge Package"
Cohesion: 0.22
Nodes (8): description, engines, node, main, name, scripts, start, version

### Community 93 - "Dashboard Design Screenshot"
Cohesion: 0.28
Nodes (9): Stitch Screenshot (UtilPay Dashboard), Daftar Tagihan Aktif table, Info Penting card, Quick Action panel (Cek Tagihan), Ringkasan Dashboard summary cards, Ringkasan Transaksi Terakhir table, Sidebar navigation (Dashboard, Tagihan, Riwayat, Laporan, Pengaturan), Status badges (SUKSES, GAGAL) (+1 more)

### Community 94 - "PLN Non-Bill Simulator"
Cohesion: 0.31
Nodes (8): buildRequestHash(), crypto, generateIdempotencyKey(), generateTransactionCode(), INQUIRY, main(), mysql, PAYMENT_RESPONSE

### Community 95 - "Telkom Simulator"
Cohesion: 0.31
Nodes (8): buildRequestHash(), crypto, fmtPeriodeList(), generateTransactionCode(), INQUIRY, main(), mysql, PAYMENT_RESPONSE

### Community 96 - "Favorite Groups API"
Cohesion: 0.39
Nodes (8): DELETE(), GET(), getCurrentUserId(), GroupItemRow, GroupRow, mapGroup(), PATCH(), POST()

### Community 97 - "Favorites API"
Cohesion: 0.42
Nodes (8): DELETE(), FavoriteRow, GET(), getCurrentUserId(), mapFavorite(), normalizeServiceType(), POST(), ServiceType

### Community 98 - "Multipay Detail API & Kasir Scope"
Cohesion: 0.36
Nodes (8): GET(), GET(), isOutsideKasirLoket(), MultiPaymentItemRow, MultiPaymentRequestRow, PATCH(), safeJson(), canProcessPayment()

### Community 99 - "Provider Health Page"
Cohesion: 0.31
Nodes (8): ApiResp, fmtDate(), JobStatus, Metric(), ProviderHealth, ProviderHealthPage(), stateBadge(), TrendPoint

### Community 100 - "Void Request Page"
Cohesion: 0.28
Nodes (8): formatDateTime(), formatRupiah(), PembatalanPage(), REFUND_BASIS_LABEL, STATUS_STYLE, STATUS_TABS, TransactionVoid, VoidStatus

### Community 101 - "Reconciliation Excel Export"
Cohesion: 0.28
Nodes (9): buildExcelWorkbookXml(), buildLunasinWorkbook(), buildPdamWorkbook(), detailColumns(), escapeXml(), renderCell(), sanitizeSheetName(), sortDetailKeys() (+1 more)

### Community 102 - "BPJS Simulator"
Cohesion: 0.32
Nodes (7): buildRequestHash(), crypto, generateTransactionCode(), INQUIRY, main(), mysql, PAYMENT_RESPONSE

### Community 103 - "Pulsa Simulator"
Cohesion: 0.32
Nodes (7): buildRequestHash(), crypto, generateTransactionCode(), INQUIRY, main(), mysql, PAYMENT_RESPONSE

### Community 104 - "PDAM Advice Page"
Cohesion: 0.32
Nodes (6): AdvicePdamPage(), formatRupiah(), formatTanggal(), GroupResult, PendingItem, PendingTransaction

### Community 105 - "Inquiry Monitoring API"
Cohesion: 0.39
Nodes (7): buildWhereClause(), categorizeInquiryError(), GET(), InquiryErrorCategoryFilter, InquiryStatusFilter, normalizeDateRange(), toDateParam()

### Community 106 - "Risk Monitoring API"
Cohesion: 0.36
Nodes (7): dynamic, GET(), iso(), RiskItem, RiskSeverity, safeQuery(), scoreForSeverity()

### Community 107 - "Invoice Detail API"
Cohesion: 0.50
Nodes (7): disabledResponse(), GET(), PATCH(), findInvoiceByCode(), getInvoiceEvents(), updateInvoiceStatus(), syncInvoiceGatewayStatus()

### Community 108 - "Commission Rules Page"
Cohesion: 0.32
Nodes (7): describeRule(), emptyForm, formatRupiah(), LoketLite, PengaturanKomisiPage(), PROVIDERS, Rule

### Community 109 - "Finance Overview Page"
Cohesion: 0.36
Nodes (7): fmtPct(), fmtRp(), JournalEntry, KeuanganOverviewPage(), KpiCard(), MarginRow, SettlementBatch

### Community 110 - "Registrations Page"
Cohesion: 0.32
Nodes (6): formatDate(), Pagination, Registration, RegistrationsPage(), STATUS_OPTS, statusBadge()

### Community 111 - "Reconciliation Matching"
Cohesion: 0.36
Nodes (8): buildProviderMatchKeys(), buildTransactionMatchKeys(), fetchProviderImportRows(), findProviderRowForTransaction(), generateReconciliationBatch(), normalizeMatchValue(), normalizePeriodValue(), pushMapValue()

### Community 112 - "Middleware & RBAC Policy"
Cohesion: 0.33
Nodes (5): Centralized RBAC (rbac.ts + middleware), authorized(), config, isPublicPath(), PUBLIC_PATHS

### Community 113 - "NPM Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, check:rbac, dev, lint, migrate, start

### Community 114 - "Reprint Page"
Cohesion: 0.43
Nodes (6): CetakUlangPage(), fmtDateTime(), fmtRp(), LoketOption, ReprintItem, todayLocalStr()

### Community 115 - "Journal Page"
Cohesion: 0.38
Nodes (6): Field(), fmtRp(), JournalEntry, JournalLine, JurnalPage(), SOURCE_TYPES

### Community 116 - "Loket Page"
Cohesion: 0.43
Nodes (6): formatNumber(), formatRupiah(), LoketData, LoketPage(), LoketPerf, canWrite()

### Community 117 - "PWA Offline Support"
Cohesion: 0.33
Nodes (4): /icons/icon-192.png, Document with checkmark app icon, Offline Fallback Page (offline.html), copy()

### Community 118 - "README & Design System"
Cohesion: 0.47
Nodes (6): UI Design System (src/ui), Design Tokens (primary, pln-yellow, pln-blue), README Portal Utilitas, Mock Customer Data (src/data/mock.ts), Portal Utilitas PLN Payment App, Stitch 'Pembayaran PLN' Template

### Community 119 - "Reconciliation Batch Detail API"
Cohesion: 0.53
Nodes (5): GET(), PATCH(), VALID_STATUSES, getReconciliationBatch(), updateReconciliationItem()

### Community 120 - "Admin Fee Page"
Cohesion: 0.40
Nodes (5): BiayaAdminPage(), formatRupiah(), LoketBiaya, PLN_ADMIN_PRESETS, PRESET_VALUES

### Community 121 - "Chart of Accounts Page"
Cohesion: 0.40
Nodes (5): Account, ChartOfAccountsPage(), Field(), TYPE_LABEL, TYPES

### Community 122 - "General Ledger Page"
Cohesion: 0.47
Nodes (5): Account, BukuBesarPage(), fmtRp(), KpiCard(), LedgerRow

### Community 123 - "Settlement Detail Page"
Cohesion: 0.40
Nodes (5): Batch, BatchItem, fmtRp(), SettlementDetailPage(), STATUS_COLOR

### Community 124 - "Button Component"
Cohesion: 0.33
Nodes (5): ButtonProps, ButtonSize, ButtonVariant, sizeClasses, variantClasses

### Community 125 - "Payment Illustration"
Cohesion: 0.60
Nodes (4): PDAM and PLN bill status cards (LUNAS), Loket balance wallet card, Payment success confirmation card, Phone app mockup (Pedami Payment)

### Community 126 - "Pedami Detail Report API"
Cohesion: 0.60
Nodes (4): fetchAllDetailPages(), GET(), mapJenis(), PEDAMI_URL

### Community 127 - "Reconciliation Batches API"
Cohesion: 0.60
Nodes (4): GET(), getProvider(), POST(), listReconciliationBatches()

### Community 128 - "Settlement List Page"
Cohesion: 0.50
Nodes (4): Batch, fmtRp(), SettlementListPage(), STATUS_COLOR

### Community 129 - "Tailwind Config"
Cohesion: 0.50
Nodes (3): tailwindcss@^3.4.0, tailwindcss, config

### Community 131 - "Pedami Report API"
Cohesion: 0.67
Nodes (3): fetchAllPages(), GET(), PEDAMI_URL

### Community 132 - "Reprint API"
Cohesion: 0.67
Nodes (4): GET(), parseJson(), reprintLunasin(), reprintPdam()

### Community 133 - "Reconciliation Preview"
Cohesion: 0.67
Nodes (4): buildScopedFilter(), fetchLoketList(), fetchTransactionRows(), getReconciliationPreview()

## Ambiguous Edges - Review These
- `isPdamOutcomeUnknown()` → `Unknown Provider Outcome Is Not Failure`  [AMBIGUOUS]
  CLAUDE.md · relation: references
- `Refund/Dispute FAILED_PROVIDER (/payment-links/disputes)` → `MVP Payment Link`  [AMBIGUOUS]
  docs/fitur-self-service-payment-link-struk-digital.md · relation: conceptually_related_to
- `HTTPS Print Bridge via Self-Signed Certificate` → `CORS Whitelist localhost / 127.0.0.1`  [AMBIGUOUS]
  docs/setup-print-bridge.md · relation: conceptually_related_to

## Knowledge Gaps
- **34 isolated node(s):** `Copilot Instructions`, `Mock Customer Data (src/data/mock.ts)`, `Remove/Lock Setup Endpoint`, `DB Amount CHECK Constraints`, `Migration Safety` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 781 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Auth & Receipt Builders` to `Payment Link Self-Service`, `Mobile Auth & Finance APIs`, `Health Check API`, `Pedami Report API`, `Lunasin Inquiry & Circuit Breaker`, `Cron Jobs`, `PDAM Inquiry & Advice API`, `Dashboard & Report APIs`, `Amount Validation & Notifications`, `Multipay & Cashier Closing APIs`, `Settlement List Page`, `Mobile History & Reports`, `Bill Check & Payment UI`, `Mobile Payment Cart`, `Lunasin Advice UI & Primitives`, `Paid Invoice Processing`, `Crypto & Public Features`, `Mobile Account & RBAC`, `DB Manage API`, `Finance Pages (Margin, Trial Balance)`, `Transaction Void & GL Journal`, `Transaction Review (Maker-Checker)`, `Balance Hold & Lunasin Advice`, `Settings & Provider Keys`, `Monitoring Detail Pages`, `Dev Dependencies`, `Root Layout & Settings Page`, `Customer Page`, `Multipay Detail & Topup UI`, `Transaction History Page`, `Commission Rules API`, `Runtime Dependencies`, `Setup & Transaction Import API`, `In-App User Guide`, `Monitoring Charts`, `Payment Link Disputes API`, `Payment Links & Stale Pending API`, `Settlement Batch API`, `Mobile Shell & Layout`, `Mobile Home Dashboard`, `Notifications Page`, `Disputes Page`, `Notification Center UI`, `Main Dashboard Page`, `Payment Links Page`, `Mobile JWT Tokens`, `Risk Monitoring Page`, `Customer API`, `Favorite Groups API`, `Favorites API`, `Multipay Detail API & Kasir Scope`, `Inquiry Monitoring API`, `Risk Monitoring API`, `Invoice Detail API`, `Finance Overview Page`, `Middleware & RBAC Policy`, `Reconciliation Batch Detail API`, `Settlement Detail Page`, `Pedami Detail Report API`, `Reconciliation Batches API`?**
  _High betweenness centrality (0.277) - this node is a cross-community bridge._
- **What connects `Copilot Instructions`, `Mock Customer Data (src/data/mock.ts)`, `Remove/Lock Setup Endpoint` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Payment Link Self-Service` be split into smaller, more focused modules?**
  _Cohesion score 0.05480277024992472 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Finance Pages (Margin, Trial Balance)` to `Payment Link Self-Service`, `Settlement List Page`, `Auth & Receipt Builders`, `Cashier Closing Printing`, `Lunasin Advice UI & Primitives`, `Mobile History & Reports`, `Bill Check & Payment UI`, `Mobile Payment Cart`, `Mobile Account & RBAC`, `Report Page & Browser Receipts`, `DB Manage UI`, `Settings & Provider Keys`, `Monitoring Detail Pages`, `Dev Dependencies`, `Root Layout & Settings Page`, `Customer Page`, `Multipay Detail & Topup UI`, `Mobile Receipt Sharing`, `Dashboard Analytics Charts`, `Transaction History Page`, `Inquiry Monitoring Tab`, `Cashier Verification UI`, `Runtime Dependencies`, `Provider API Docs Page`, `In-App User Guide`, `Monitoring Charts`, `Reconciliation Page`, `Transaction Import UI`, `Mobile Shell & Layout`, `Pending Transactions UI`, `Commission Report Page`, `Loket Members Page`, `Mobile Home Dashboard`, `Notifications Page`, `Disputes Page`, `Notification Center UI`, `Main Dashboard Page`, `Payment Links Page`, `Risk Monitoring Page`, `Review Transactions Page`, `Balance Page`, `Provider Page`, `Users Page`, `Provider Health Page`, `Void Request Page`, `PDAM Advice Page`, `Commission Rules Page`, `Finance Overview Page`, `Registrations Page`, `Reprint Page`, `Journal Page`, `Loket Page`, `Admin Fee Page`, `Chart of Accounts Page`, `General Ledger Page`, `Settlement Detail Page`, `Button Component`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Should `Mobile Auth & Finance APIs` be split into smaller, more focused modules?**
  _Cohesion score 0.05420054200542006 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `isPdamOutcomeUnknown()` and `Unknown Provider Outcome Is Not Failure`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Refund/Dispute FAILED_PROVIDER (/payment-links/disputes)` and `MVP Payment Link`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._