// Features - Repositories
import { ChatInstanceRepository } from '../features/chatInstances/repositories/ChatInstanceRepository';
import { ChatMessageRepository } from '../features/chatMessages/repositories/ChatMessageRepository';
import { ChunkRepository } from '../features/documents/repositories/ChunkRepository';
import { DashboardLayoutRepository } from '../features/dashboardLayout/repositories/DashboardLayoutRepository';
import { DocumentRepository } from '../features/documents/repositories/DocumentRepository';
import { StructuredDataRepository } from '../features/structuredData/repositories/StructuredDataRepository';
import { UserRepository } from '../features/users/repositories/UserRepository';
import { VectorRepository } from '../features/documents/repositories/VectorRepository';
import { DynamicTableRepository } from '../features/dynamicTables/repositories/DynamicTableRepository';
import { ActionProposalRepository } from '../features/chat/repositories/ActionProposalRepository';
import { KnowledgeGraphRepository } from '../features/chat/repositories/KnowledgeGraphRepository';
import { AttachmentRepository } from '../features/attachments/repositories/AttachmentRepository';
import { SavedTableViewRepository } from '../features/savedViews/repositories/SavedTableViewRepository';
import { AccountRepository } from '../features/accounting/repositories/AccountRepository';
import { JournalEntryRepository } from '../features/accounting/repositories/JournalEntryRepository';
import { PostingRepository } from '../features/accounting/repositories/PostingRepository';
import { AccountingPeriodRepository } from '../features/accounting/repositories/AccountingPeriodRepository';
import { AuditRepository } from '../features/accounting/repositories/AuditRepository';
import { DocumentAttachmentRepository } from '../features/accounting/repositories/DocumentAttachmentRepository';
import { ReconciliationRepository } from '../features/accounting/repositories/ReconciliationRepository';
import { DataExchangeRepository } from '../features/accounting/repositories/DataExchangeRepository';
import { SourceProvenanceRepository } from '../features/accounting/repositories/SourceProvenanceRepository';
import { ReferentialMappingRepository } from '../features/accounting/repositories/ReferentialMappingRepository';
import { ReferentialAccountRepository } from '../features/accounting/repositories/ReferentialAccountRepository';
import { PayableRepository } from '../features/accounting/repositories/PayableRepository';
import { ReceivableRepository } from '../features/accounting/repositories/ReceivableRepository';
import { DimensionRepository } from '../features/accounting/repositories/DimensionRepository';
import { CounterpartyRepository } from '../features/accounting/repositories/CounterpartyRepository';
import { PackageBalanceRepository } from '../features/packages/repositories/PackageBalanceRepository';

// Features - Policies
import { ChatInstancePolicy } from '../features/chatInstances/policies/ChatInstancePolicy';
import { ChatMessagePolicy } from '../features/chatMessages/policies/ChatMessagePolicy';
import { DashboardLayoutPolicy } from '../features/dashboardLayout/policies/DashboardLayoutPolicy';
import { DocumentPolicy } from '../features/documents/policies/DocumentPolicy';
import { StructuredDataPolicy } from '../features/structuredData/policies/StructuredDataPolicy';
import { UserPolicy } from '../features/users/policies/UserPolicy';
import { DynamicTablePolicy } from '../features/dynamicTables/policies/DynamicTablePolicy';
import { AttachmentPolicy } from '../features/attachments/policies/AttachmentPolicy';
import { SavedTableViewPolicy } from '../features/savedViews/policies/SavedTableViewPolicy';
import { AccountingPolicy } from '../features/accounting/policies/AccountingPolicy';
import { PackageBalancePolicy } from '../features/packages/policies/PackageBalancePolicy';

// Features - Services
import { ChatInstanceService } from '../features/chatInstances/services/ChatInstanceService';
import { ChatMessageService } from '../features/chatMessages/services/ChatMessageService';
import { ChatService } from '../features/chat/services/ChatService';
import { DashboardLayoutService } from '../features/dashboardLayout/services/DashboardLayoutService';
import { DocumentProcessingService } from '../features/documents/services/DocumentProcessingService';
import { DocumentService } from '../features/documents/services/DocumentService';
import { ReportService } from '../features/reports/services/ReportService';
import { StructuredDataService } from '../features/structuredData/services/StructuredDataService';
import { UserService } from '../features/users/services/UserService';
import { DynamicTableService } from '../features/dynamicTables/services/DynamicTableService';
import { LuminarisAgentService } from '../features/chat/services/LuminarisAgentService';
import { KnowledgeGraphService } from '../features/chat/services/KnowledgeGraphService';
import { CrmPipelineService } from '../features/crm/services/CrmPipelineService';
import { CrmAnalyticsService } from '../features/crm/services/CrmAnalyticsService';
import { PostingService } from '../features/accounting/services/PostingService';
import { EntryApprovalService } from '../features/accounting/services/EntryApprovalService';
import { PeriodService } from '../features/accounting/services/PeriodService';
import { AuditService } from '../features/accounting/services/AuditService';
import { AccountingReportService } from '../features/accounting/services/AccountingReportService';
import { CashFlowReportService } from '../features/accounting/services/CashFlowReportService';
import { PeriodComparisonReportService } from '../features/accounting/services/PeriodComparisonReportService';
import { DailyJournalReportService } from '../features/accounting/services/DailyJournalReportService';
import { AgingReportService } from '../features/accounting/services/AgingReportService';
import { ReconciliationService } from '../features/accounting/services/ReconciliationService';
import { ReferentialMappingService } from '../features/accounting/services/ReferentialMappingService';
import { ReferentialCatalogService } from '../features/accounting/services/ReferentialCatalogService';
import { DocumentAttachmentService } from '../features/accounting/services/DocumentAttachmentService';
import { DataExchangeExportService } from '../features/accounting/services/DataExchangeExportService';
import { ReceiptService } from '../features/accounting/services/ReceiptService';
import { DataExchangeImportService } from '../features/accounting/services/DataExchangeImportService';
import { SpedGenerationService } from '../features/accounting/services/SpedGenerationService';
import { SpedEcfGenerationService } from '../features/accounting/services/SpedEcfGenerationService';
import { ExerciseClosingService } from '../features/accounting/services/ExerciseClosingService';
import { PayableService } from '../features/accounting/services/PayableService';
import { ReceivableService } from '../features/accounting/services/ReceivableService';
import { DimensionService } from '../features/accounting/services/DimensionService';
import { DimensionReportService } from '../features/accounting/services/DimensionReportService';
import { TieOutDiagnosticService } from '../features/accounting/services/TieOutDiagnosticService';
import { CounterpartyService } from '../features/accounting/services/CounterpartyService';
import { PackageBalanceService } from '../features/packages/services/PackageBalanceService';
import { AccountingSyncService } from '../features/accounting/sync/AccountingSyncService';
import { CrmReceivableBridge } from '../features/accounting/sync/bridges/CrmReceivableBridge';
import { SalonSaleFinalizedMapper } from '../features/accounting/sync/mappers/SalonSaleFinalizedMapper';
import { SalonSaleReturnedMapper } from '../features/accounting/sync/mappers/SalonSaleReturnedMapper';
import { SalonSaleSettledMapper } from '../features/accounting/sync/mappers/SalonSaleSettledMapper';
import { SalonPackageSoldMapper } from '../features/accounting/sync/mappers/SalonPackageSoldMapper';
import { SalesCancellationService } from '../features/sales/services/SalesCancellationService';
import { RegisterPaymentService } from '../features/sales/services/RegisterPaymentService';
import { PresetSyncService } from '../features/dynamicTables/services/PresetSyncService';
import { AttachmentService } from '../features/attachments/services/AttachmentService';
import { SavedTableViewService } from '../features/savedViews/services/SavedTableViewService';

// Lib - External Services
import { OpenAIService as ChatOpenAIService } from './openai/OpenAIService';
import { OpenAIService as EmbeddingOpenAIService } from './vector/embedding';

// Interfaces
import type { IChatInstanceRepository } from '../features/chatInstances/repositories/IChatInstanceRepository';
import type { IChatMessageRepository } from '../features/chatMessages/repositories/IChatMessageRepository';
import type { IDashboardLayoutRepository } from '../features/dashboardLayout/repositories/IDashboardLayoutRepository';
import type { IDocumentRepository } from '../features/documents/repositories/IDocumentRepository';
import type { IUserRepository } from '../features/users/repositories/IUserRepository';
import type { IVectorRepository } from '../features/documents/repositories/IVectorRepository';
import type { IDynamicTableRepository } from '../features/dynamicTables/repositories/IDynamicTableRepository';
import type { IChatInstancePolicy } from '../features/chatInstances/policies/IChatInstancePolicy';
import type { IChatMessagePolicy } from '../features/chatMessages/policies/IChatMessagePolicy';
import type { IDashboardLayoutPolicy } from '../features/dashboardLayout/policies/IDashboardLayoutPolicy';
import type { IDocumentPolicy } from '../features/documents/policies/IDocumentPolicy';
import type { IUserPolicy } from '../features/users/policies/IUserPolicy';
import type { IDynamicTablePolicy } from '../features/dynamicTables/policies/IDynamicTablePolicy';
import type { IChatService } from '../features/chat/services/IChatService';
import type { IReportService } from '../features/reports/services/IReportService';
import type { IActionProposalRepository } from '../features/chat/repositories/IActionProposalRepository';
import type { IKnowledgeGraphRepository } from '../features/chat/repositories/IKnowledgeGraphRepository';
import type { IAttachmentRepository } from '../features/attachments/repositories/IAttachmentRepository';
import type { IAttachmentPolicy } from '../features/attachments/policies/IAttachmentPolicy';
import type { ISavedTableViewRepository } from '../features/savedViews/repositories/ISavedTableViewRepository';
import type { ISavedTableViewPolicy } from '../features/savedViews/policies/ISavedTableViewPolicy';
import type { IAccountRepository } from '../features/accounting/repositories/IAccountRepository';
import type { IJournalEntryRepository } from '../features/accounting/repositories/IJournalEntryRepository';
import type { IPostingRepository } from '../features/accounting/repositories/IPostingRepository';
import type { IAccountingPeriodRepository } from '../features/accounting/repositories/IAccountingPeriodRepository';
import type { IAuditRepository } from '../features/accounting/repositories/IAuditRepository';
import type { IDocumentAttachmentRepository } from '../features/accounting/repositories/IDocumentAttachmentRepository';
import type { IReconciliationRepository } from '../features/accounting/repositories/IReconciliationRepository';
import type { IDataExchangeRepository } from '../features/accounting/repositories/IDataExchangeRepository';
import type { ISourceProvenanceRepository } from '../features/accounting/repositories/ISourceProvenanceRepository';
import type { IReferentialMappingRepository } from '../features/accounting/repositories/IReferentialMappingRepository';
import type { IReferentialAccountRepository } from '../features/accounting/repositories/IReferentialAccountRepository';
import type { IPayableRepository } from '../features/accounting/repositories/IPayableRepository';
import type { IReceivableRepository } from '../features/accounting/repositories/IReceivableRepository';
import type { IDimensionRepository } from '../features/accounting/repositories/IDimensionRepository';
import type { ICounterpartyRepository } from '../features/accounting/repositories/ICounterpartyRepository';
import type { IAccountingPolicy } from '../features/accounting/policies/IAccountingPolicy';
import type { IPackageBalanceRepository } from '../features/packages/repositories/IPackageBalanceRepository';
import type { IPackageBalancePolicy } from '../features/packages/policies/IPackageBalancePolicy';

export class ApplicationFactory {
  private static instance: ApplicationFactory;

  private readonly repositories: {
    user: IUserRepository;
    chatMessage: IChatMessageRepository;
    chatInstance: IChatInstanceRepository;
    dashboardLayout: IDashboardLayoutRepository;
    document: IDocumentRepository;
    vector: IVectorRepository;
    chunk: ChunkRepository;
    structuredData: StructuredDataRepository;
    dynamicTable: IDynamicTableRepository;
    actionProposal: IActionProposalRepository;
    knowledgeGraph: IKnowledgeGraphRepository;
    attachment: IAttachmentRepository;
    savedTableView: ISavedTableViewRepository;
    account: IAccountRepository;
    journalEntry: IJournalEntryRepository;
    posting: IPostingRepository;
    accountingPeriod: IAccountingPeriodRepository;
    audit: IAuditRepository;
    documentAttachment: IDocumentAttachmentRepository;
    reconciliation: IReconciliationRepository;
    dataExchange: IDataExchangeRepository;
    packageBalance: IPackageBalanceRepository;
    sourceProvenance: ISourceProvenanceRepository;
    referentialMapping: IReferentialMappingRepository;
    referentialAccount: IReferentialAccountRepository;
    payable: IPayableRepository;
    receivable: IReceivableRepository;
    dimension: IDimensionRepository;
    counterparty: ICounterpartyRepository;
  };

  private readonly policies: {
    user: IUserPolicy;
    chatMessage: IChatMessagePolicy;
    chatInstance: IChatInstancePolicy;
    dashboardLayout: IDashboardLayoutPolicy;
    document: IDocumentPolicy;
    structuredData: StructuredDataPolicy;
    dynamicTable: IDynamicTablePolicy;
    attachment: IAttachmentPolicy;
    savedTableView: ISavedTableViewPolicy;
    accounting: IAccountingPolicy;
    packageBalance: IPackageBalancePolicy;
  };

  public readonly services: {
    user: UserService;
    chatMessage: ChatMessageService;
    chatInstance: ChatInstanceService;
    dashboardLayout: DashboardLayoutService;
    document: DocumentService;
    chat: IChatService;
    report: IReportService;
    structuredData: StructuredDataService;
    dynamicTable: DynamicTableService;
    luminarisAgent: LuminarisAgentService;
    knowledgeGraph: KnowledgeGraphService;
    crmPipeline: CrmPipelineService;
    crmAnalytics: CrmAnalyticsService;
    salesCancellation: SalesCancellationService;
    registerPayment: RegisterPaymentService;
    posting: PostingService;
    entryApproval: EntryApprovalService;
    period: PeriodService;
    accountingSync: AccountingSyncService;
    crmReceivableBridge: CrmReceivableBridge;
    accountingReport: AccountingReportService;
    cashFlowReport: CashFlowReportService;
    periodComparisonReport: PeriodComparisonReportService;
    dailyJournalReport: DailyJournalReportService;
    agingReport: AgingReportService;
    reconciliation: ReconciliationService;
    referentialMapping: ReferentialMappingService;
    referentialCatalog: ReferentialCatalogService;
    documentAttachment: DocumentAttachmentService;
    dataExchangeExport: DataExchangeExportService;
    dataExchangeImport: DataExchangeImportService;
    receipt: ReceiptService;
    sped: SpedGenerationService;
    spedEcf: SpedEcfGenerationService;
    exerciseClosing: ExerciseClosingService;
    payable: PayableService;
    receivable: ReceivableService;
    dimension: DimensionService;
    dimensionReport: DimensionReportService;
    tieOutDiagnostic: TieOutDiagnosticService;
    counterparty: CounterpartyService;
    packageBalance: PackageBalanceService;
    presetSync: PresetSyncService;
    attachment: AttachmentService;
    savedTableView: SavedTableViewService;
  };

  private constructor() {
    // External services (singletons)
    const chatOpenAIService = new ChatOpenAIService();
    const embeddingOpenAIService = new EmbeddingOpenAIService({ apiKey: process.env.OPENAI_API_KEY || '' });

    // Repositories
    this.repositories = {
      chatInstance: new ChatInstanceRepository(),
      chatMessage: new ChatMessageRepository(),
      chunk: new ChunkRepository(),
      dashboardLayout: new DashboardLayoutRepository(),
      document: new DocumentRepository(),
      structuredData: new StructuredDataRepository(),
      user: new UserRepository(),
      vector: new VectorRepository(),
      dynamicTable: new DynamicTableRepository(),
      actionProposal: new ActionProposalRepository(),
      knowledgeGraph: new KnowledgeGraphRepository(),
      attachment: new AttachmentRepository(),
      savedTableView: new SavedTableViewRepository(),
      account: new AccountRepository(),
      journalEntry: new JournalEntryRepository(),
      posting: new PostingRepository(),
      accountingPeriod: new AccountingPeriodRepository(),
      audit: new AuditRepository(),
      documentAttachment: new DocumentAttachmentRepository(),
      reconciliation: new ReconciliationRepository(),
      dataExchange: new DataExchangeRepository(),
      packageBalance: new PackageBalanceRepository(),
      sourceProvenance: new SourceProvenanceRepository(),
      referentialMapping: new ReferentialMappingRepository(),
      referentialAccount: new ReferentialAccountRepository(),
      payable: new PayableRepository(),
      receivable: new ReceivableRepository(),
      dimension: new DimensionRepository(),
      counterparty: new CounterpartyRepository(),
    };

    // Policies
    this.policies = {
      chatInstance: new ChatInstancePolicy(),
      chatMessage: new ChatMessagePolicy(),
      dashboardLayout: new DashboardLayoutPolicy(),
      document: new DocumentPolicy(),
      structuredData: new StructuredDataPolicy(this.repositories.document),
      user: new UserPolicy(),
      dynamicTable: new DynamicTablePolicy(),
      attachment: new AttachmentPolicy(),
      savedTableView: new SavedTableViewPolicy(),
      accounting: new AccountingPolicy(),
      packageBalance: new PackageBalancePolicy(),
    };

    // Services (handling inter-dependencies)
    const structuredDataService = new StructuredDataService(
      this.repositories.structuredData,
      this.policies.structuredData,
      chatOpenAIService
    );
    const knowledgeGraphService = new KnowledgeGraphService(
      this.repositories.knowledgeGraph,
      this.repositories.dynamicTable
    );

    const dynamicTableService = new DynamicTableService(
      this.repositories.dynamicTable,
      this.policies.dynamicTable,
      knowledgeGraphService
    );

    const luminarisAgentService = new LuminarisAgentService(
      dynamicTableService,
      this.repositories.actionProposal
    );

    const crmPipelineService = new CrmPipelineService(
      dynamicTableService,
      this.repositories.dynamicTable
    );

    const crmAnalyticsService = new CrmAnalyticsService(
      dynamicTableService,
      this.repositories.dynamicTable
    );

    // Salon-sale cancellation/return transitions (Incremento D) — orchestration over
    // DynamicTableService (no own Repository/Policy); the post-commit accounting effect is
    // applied inside the service via SalonSaleReversalBridge.
    const salesCancellationService = new SalesCancellationService(
      dynamicTableService,
      this.repositories.dynamicTable
    );

    // Salon-sale payment transition (Incremento D / D1) — same orchestration shape as
    // salesCancellationService; the post-commit settlement is applied via SalonSaleSettlementBridge.
    const packageBalanceService = new PackageBalanceService(
      this.repositories.packageBalance,
      this.policies.packageBalance
    );

    const registerPaymentService = new RegisterPaymentService(
      dynamicTableService,
      this.repositories.dynamicTable,
      packageBalanceService
    );

    const auditService = new AuditService(
      this.repositories.audit,
      this.repositories.posting,
    );

    const postingService = new PostingService(
      this.repositories.account,
      this.repositories.journalEntry,
      this.repositories.posting,
      this.policies.accounting,
      this.repositories.accountingPeriod,
      auditService,
      this.repositories.sourceProvenance,
      this.repositories.dimension,
    );

    // Maker-checker approval tower (ADR-INCR-APPROVAL) — the controlled Draft→PendingApproval→Posted
    // path for manual entries. Owns its own tx (CAS on version); does NOT wrap postEntry.
    const entryApprovalService = new EntryApprovalService(
      this.repositories.journalEntry,
      this.repositories.posting,
      this.repositories.account,
      this.repositories.accountingPeriod,
      auditService,
      this.policies.accounting,
      this.repositories.dimension,
    );

    const periodService = new PeriodService(
      this.repositories.accountingPeriod,
      this.policies.accounting,
      this.repositories.posting,
      auditService,
    );

    // AccountingSync — application-level integration adapter (NOT the DynamicTable
    // engine). Depends on postingService (above); first non-controller consumer.
    // CRM Won deals no longer post directly (retired CrmOpportunityWonMapper) — they route
    // through the AR subledger via CrmReceivableBridge (ADR-CRM-AR-SEAM).
    const accountingSyncService = new AccountingSyncService(postingService, [
      new SalonSaleFinalizedMapper(),
      new SalonSaleReturnedMapper(),
      new SalonSaleSettledMapper(),
      new SalonPackageSoldMapper(),
    ]);

    const accountingReportService = new AccountingReportService(
      this.repositories.account,
      this.repositories.posting,
      this.repositories.journalEntry,
      this.policies.accounting
    );

    const presetSyncService = new PresetSyncService(
      dynamicTableService,
      this.repositories.dynamicTable
    );

    const referentialMappingService = new ReferentialMappingService(
      this.repositories.referentialMapping,
      this.repositories.account,
      this.policies.accounting,
      auditService,
      this.repositories.referentialAccount,
    );

    const referentialCatalogService = new ReferentialCatalogService(
      this.repositories.referentialAccount,
      this.policies.accounting,
    );

    // Extracted from the literal so CrmReceivableBridge (below) shares the same instance.
    const receivableService = new ReceivableService(
      this.repositories.receivable,
      this.repositories.account,
      postingService,
      auditService,
      this.policies.accounting,
      this.repositories.counterparty,
    );

    this.services = {
      chat: new ChatService(
        embeddingOpenAIService,
        this.repositories.vector,
        chatOpenAIService,
        luminarisAgentService,
        knowledgeGraphService
      ),
      chatInstance: new ChatInstanceService(this.repositories.chatInstance, this.policies.chatInstance),
      chatMessage: new ChatMessageService(
        this.repositories.chatMessage,
        this.repositories.chatInstance,
        this.policies.chatMessage
      ),
      dashboardLayout: new DashboardLayoutService(
        this.repositories.dashboardLayout,
        this.policies.dashboardLayout
      ),
      document: new DocumentService(
        this.repositories.document,
        this.repositories.chunk,
        this.repositories.vector,
        new DocumentProcessingService(),
        this.policies.document,
        chatOpenAIService,
        structuredDataService, // Injected dependency
        this.repositories.user
      ),
      report: new ReportService(embeddingOpenAIService, this.repositories.vector, chatOpenAIService),
      structuredData: structuredDataService, // Assigned service
      user: new UserService(this.repositories.user, this.policies.user, this.repositories.vector),
      dynamicTable: dynamicTableService,
      luminarisAgent: luminarisAgentService,
      knowledgeGraph: knowledgeGraphService,
      crmPipeline: crmPipelineService,
      crmAnalytics: crmAnalyticsService,
      salesCancellation: salesCancellationService,
      registerPayment: registerPaymentService,
      posting: postingService,
      entryApproval: entryApprovalService,
      period: periodService,
      accountingSync: accountingSyncService,
      accountingReport: accountingReportService,
      cashFlowReport: new CashFlowReportService(
        this.repositories.account,
        this.repositories.posting,
        accountingReportService,
        this.policies.accounting,
      ),
      periodComparisonReport: new PeriodComparisonReportService(accountingReportService),
      dailyJournalReport: new DailyJournalReportService(
        this.repositories.journalEntry,
        this.policies.accounting,
      ),
      agingReport: new AgingReportService(
        this.repositories.payable,
        this.repositories.receivable,
        this.policies.accounting,
      ),
      reconciliation: new ReconciliationService(
        this.repositories.reconciliation,
        this.repositories.account,
        this.policies.accounting,
        auditService,
      ),
      referentialMapping: referentialMappingService,
      referentialCatalog: referentialCatalogService,
      documentAttachment: new DocumentAttachmentService(
        this.repositories.documentAttachment,
        this.policies.accounting,
        auditService,
        this.repositories.journalEntry,
      ),
      dataExchangeExport: new DataExchangeExportService(
        accountingReportService,
        this.policies.accounting,
        this.repositories.dataExchange,
        auditService,
      ),
      dataExchangeImport: new DataExchangeImportService(
        this.repositories.dataExchange,
        this.policies.accounting,
        auditService,
        postingService,
        postingService,
      ),
      receipt: new ReceiptService(
        this.repositories.journalEntry,
        this.repositories.account,
        this.policies.accounting,
      ),
      sped: new SpedGenerationService(
        this.repositories.account,
        this.repositories.posting,
        this.repositories.journalEntry,
        referentialMappingService,
        accountingReportService,
        this.policies.accounting,
        this.repositories.dataExchange,
        auditService,
      ),
      spedEcf: new SpedEcfGenerationService(
        this.repositories.account,
        this.repositories.posting,
        this.policies.accounting,
        this.repositories.dataExchange,
        auditService,
      ),
      exerciseClosing: new ExerciseClosingService(
        this.repositories.account,
        this.repositories.posting,
        postingService,
        this.policies.accounting,
      ),
      payable: new PayableService(
        this.repositories.payable,
        this.repositories.account,
        postingService,
        auditService,
        this.policies.accounting,
        this.repositories.counterparty,
      ),
      receivable: receivableService,
      // CRM → AR seam (ADR-CRM-AR-SEAM): post-commit integration bridge, same altitude as
      // AccountingSync — never injected into the DynamicTable engine (§2.1).
      crmReceivableBridge: new CrmReceivableBridge(
        receivableService,
        this.repositories.receivable,
        this.repositories.account,
        postingService,
        this.repositories.accountingPeriod,
      ),
      dimension: new DimensionService(
        this.repositories.dimension,
        auditService,
        this.policies.accounting,
      ),
      dimensionReport: new DimensionReportService(
        this.repositories.posting,
        this.repositories.account,
        this.repositories.dimension,
        this.policies.accounting,
      ),
      tieOutDiagnostic: new TieOutDiagnosticService(
        this.repositories.account,
        this.repositories.posting,
        this.repositories.receivable,
        this.repositories.payable,
        this.policies.accounting,
      ),
      counterparty: new CounterpartyService(
        this.repositories.counterparty,
        auditService,
        this.policies.accounting,
      ),
      packageBalance: packageBalanceService,
      presetSync: presetSyncService,
      attachment: new AttachmentService(this.repositories.attachment, this.policies.attachment),
      savedTableView: new SavedTableViewService(
        this.repositories.savedTableView,
        this.policies.savedTableView
      ),
    };
  }

  public static getInstance(): ApplicationFactory {
    if (!ApplicationFactory.instance) {
      ApplicationFactory.instance = new ApplicationFactory();
    }
    return ApplicationFactory.instance;
  }

  // Service Getters
  public getChatService = (): IChatService => this.services.chat;
  public getChatInstanceService = (): ChatInstanceService => this.services.chatInstance;
  public getChatMessageService = (): ChatMessageService => this.services.chatMessage;
  public getDashboardLayoutService = (): DashboardLayoutService => this.services.dashboardLayout;
  public getDocumentService = (): DocumentService => this.services.document;
  public getReportService = (): IReportService => this.services.report;
  public getStructuredDataService = (): StructuredDataService => this.services.structuredData;
  public getUserService = (): UserService => this.services.user;
  public getDynamicTableService = (): DynamicTableService => this.services.dynamicTable;
  public getLuminarisAgentService = (): LuminarisAgentService => this.services.luminarisAgent;
  public getKnowledgeGraphService = (): KnowledgeGraphService => this.services.knowledgeGraph;
  public getCrmPipelineService = (): CrmPipelineService => this.services.crmPipeline;
  public getCrmAnalyticsService = (): CrmAnalyticsService => this.services.crmAnalytics;
  public getSalesCancellationService = (): SalesCancellationService => this.services.salesCancellation;
  public getRegisterPaymentService = (): RegisterPaymentService => this.services.registerPayment;
  public getPostingService = (): PostingService => this.services.posting;
  public getEntryApprovalService = (): EntryApprovalService => this.services.entryApproval;
  public getPeriodService = (): PeriodService => this.services.period;
  public getAccountingSyncService = (): AccountingSyncService => this.services.accountingSync;
  public getAccountingReportService = (): AccountingReportService => this.services.accountingReport;
  public getCashFlowReportService = (): CashFlowReportService => this.services.cashFlowReport;
  public getPeriodComparisonReportService = (): PeriodComparisonReportService => this.services.periodComparisonReport;
  public getDailyJournalReportService = (): DailyJournalReportService => this.services.dailyJournalReport;

  public getAgingReportService = (): AgingReportService => this.services.agingReport;
  public getReconciliationService = (): ReconciliationService => this.services.reconciliation;
  public getReferentialMappingService = (): ReferentialMappingService => this.services.referentialMapping;
  public getReferentialCatalogService = (): ReferentialCatalogService => this.services.referentialCatalog;
  public getDocumentAttachmentService = (): DocumentAttachmentService => this.services.documentAttachment;
  public getDataExchangeExportService = (): DataExchangeExportService => this.services.dataExchangeExport;
  public getDataExchangeImportService = (): DataExchangeImportService => this.services.dataExchangeImport;
  public getReceiptService = (): ReceiptService => this.services.receipt;
  public getSpedGenerationService = (): SpedGenerationService => this.services.sped;
  public getSpedEcfGenerationService = (): SpedEcfGenerationService => this.services.spedEcf;
  public getExerciseClosingService = (): ExerciseClosingService => this.services.exerciseClosing;
  public getPayableService = (): PayableService => this.services.payable;

  public getReceivableService = (): ReceivableService => this.services.receivable;
  public getCrmReceivableBridge = (): CrmReceivableBridge => this.services.crmReceivableBridge;
  public getDimensionService = (): DimensionService => this.services.dimension;
  public getDimensionReportService = (): DimensionReportService => this.services.dimensionReport;
  public getTieOutDiagnosticService = (): TieOutDiagnosticService => this.services.tieOutDiagnostic;
  public getCounterpartyService = (): CounterpartyService => this.services.counterparty;
  public getPackageBalanceService = (): PackageBalanceService => this.services.packageBalance;
  public getPresetSyncService = (): PresetSyncService => this.services.presetSync;
  public getAttachmentService = (): AttachmentService => this.services.attachment;
  public getSavedTableViewService = (): SavedTableViewService => this.services.savedTableView;

  // Repository Getters
  public getChatInstanceRepository = (): IChatInstanceRepository => this.repositories.chatInstance;
  public getChatMessageRepository = (): IChatMessageRepository => this.repositories.chatMessage;
  public getDashboardLayoutRepository = (): IDashboardLayoutRepository => this.repositories.dashboardLayout;
  public getDocumentRepository = (): IDocumentRepository => this.repositories.document;
  public getUserRepository = (): IUserRepository => this.repositories.user;
  public getVectorRepository = (): IVectorRepository => this.repositories.vector;
  public getDynamicTableRepository = (): IDynamicTableRepository => this.repositories.dynamicTable;
  public getKnowledgeGraphRepository = (): IKnowledgeGraphRepository => this.repositories.knowledgeGraph;
}

export function getFactory(): ApplicationFactory {
  return ApplicationFactory.getInstance();
}

export type {
  IUserRepository,
  IChatMessageRepository,
  IChatInstanceRepository,
  IDashboardLayoutRepository,
  IDocumentRepository,
  IVectorRepository,
  IUserPolicy,
  IChatMessagePolicy,
  IChatInstancePolicy,
  IDashboardLayoutPolicy,
  IDocumentPolicy,
  IDynamicTableRepository,
  IDynamicTablePolicy,
  IActionProposalRepository,
  IKnowledgeGraphRepository,
};