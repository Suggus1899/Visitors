import { IVisitorRepository } from '../visits/domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../visits/domain/repositories/IVisitRepository';
import { SequelizeVisitorRepository } from '../visits/infrastructure/database/repositories/SequelizeVisitorRepository';
import { SequelizeVisitRepository } from '../visits/infrastructure/database/repositories/SequelizeVisitRepository';
import { PostgresBackupService } from '../billing/infrastructure/services/PostgresBackupService';
import { IBackupService } from '../billing/domain/services/IBackupService';
import { IUserRepository } from '../identity/domain/repositories/IUserRepository';
import { IAuthService } from '../identity/domain/services/IAuthService';
import { IEmailService } from '../identity/domain/services/IEmailService';
import { SequelizeUserRepository } from '../identity/infrastructure/database/repositories/SequelizeUserRepository';
import { JwtAuthService } from '../identity/infrastructure/services/JwtAuthService';
import { PasswordPolicy } from '../identity/domain/services/PasswordPolicy';
import { EmailService } from '../identity/infrastructure/services/EmailService';
import { IIntermittentLogRepository } from '../visits/domain/repositories/IIntermittentLogRepository';
import { SequelizeIntermittentLogRepository } from '../visits/infrastructure/database/repositories/SequelizeIntermittentLogRepository';
import { IAuditLogRepository } from '../audit/domain/repositories/IAuditLogRepository';
import { SequelizeAuditLogRepository } from '../audit/infrastructure/database/repositories/SequelizeAuditLogRepository';
import { ITokenBlacklist } from '../identity/domain/services/ITokenBlacklist';
import { tokenBlacklist } from '../identity/infrastructure/services/TokenBlacklist';
import { IEventEmitter } from './domain/services/IEventEmitter';
import { eventEmitterService } from './infrastructure/services/EventEmitterService';
import { IArcoRequestRepository } from '../audit/domain/repositories/IArcoRequestRepository';
import { SequelizeArcoRequestRepository } from '../audit/infrastructure/database/repositories/SequelizeArcoRequestRepository';
import { IVisitorEditHistoryRepository } from '../visits/domain/repositories/IVisitorEditHistoryRepository';
import { SequelizeVisitorEditHistoryRepository } from '../visits/infrastructure/database/repositories/SequelizeVisitorEditHistoryRepository';
import { ITenantRepository } from '../identity/domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../identity/domain/repositories/ITenantUserRepository';
import { SequelizeTenantRepository } from '../identity/infrastructure/database/repositories/SequelizeTenantRepository';
import { SequelizeTenantUserRepository } from '../identity/infrastructure/database/repositories/SequelizeTenantUserRepository';
import { CheckInVisitorUseCase } from '../visits/application/usecases/CheckInVisitor.usecase';
import { GoIntermittentUseCase } from '../visits/application/usecases/GoIntermittent.usecase';
import { ReactivateVisitUseCase } from '../visits/application/usecases/ReactivateVisit.usecase';
import { GetIntermittentVisitsUseCase } from '../visits/application/usecases/GetIntermittentVisits.usecase';
import { UpdateVisitorUseCase } from '../visits/application/usecases/UpdateVisitor.usecase';
import { GetAllVisitorsUseCase } from '../visits/application/usecases/GetAllVisitors.usecase';
import { CheckOutVisitorUseCase } from '../visits/application/usecases/CheckOutVisitor.usecase';
import { AdmitVisitorUseCase } from '../visits/application/usecases/AdmitVisitor.usecase';
import { GetActiveVisitsUseCase } from '../visits/application/usecases/GetActiveVisits.usecase';
import { GetWaitingVisitsUseCase } from '../visits/application/usecases/GetWaitingVisits.usecase';
import { GetVisitStatsUseCase } from '../visits/application/usecases/GetVisitStats.usecase';
import { GetVisitorByCedulaUseCase } from '../visits/application/usecases/GetVisitorByCedula.usecase';
import { GetCompaniesUseCase } from '../visits/application/usecases/GetCompanies.usecase';
import { GetVisitsUseCase } from '../visits/application/usecases/GetVisits.usecase';
import { GetMonthlyReportUseCase } from '../visits/application/usecases/GetMonthlyReport.usecase';
import { GetMissedCheckoutsUseCase } from '../visits/application/usecases/GetMissedCheckouts.usecase';
import { GetComparisonStatsUseCase } from '../visits/application/usecases/GetComparisonStats.usecase';
import { CreateBackupUseCase } from '../billing/application/usecases/CreateBackup.usecase';
import { ListBackupsUseCase } from '../billing/application/usecases/ListBackups.usecase';
import { LoginUseCase } from '../identity/application/usecases/auth/Login.usecase';
import { ForgotPasswordUseCase } from '../identity/application/usecases/auth/ForgotPassword.usecase';
import { ResetPasswordUseCase } from '../identity/application/usecases/auth/ResetPassword.usecase';
import { RefreshTokenUseCase } from '../identity/application/usecases/auth/RefreshToken.usecase';
import { ChangePasswordUseCase } from '../identity/application/usecases/auth/ChangePassword.usecase';
import { CreateDemoTenantUseCase } from '../identity/application/usecases/auth/CreateDemoTenant.usecase';
import { IntermittentExitUseCase } from '../visits/application/usecases/IntermittentExit.usecase';
import { IntermittentReEntryUseCase } from '../visits/application/usecases/IntermittentReEntry.usecase';
import { GetAuditLogsUseCase } from '../identity/application/usecases/superadmin/GetAuditLogs.usecase';
import { CreateUserUseCase } from '../identity/application/usecases/superadmin/CreateUser.usecase';
import { UpdateUserUseCase } from '../identity/application/usecases/superadmin/UpdateUser.usecase';
import { DeleteUserUseCase } from '../identity/application/usecases/superadmin/DeleteUser.usecase';
import { ListUsersUseCase } from '../identity/application/usecases/superadmin/ListUsers.usecase';
import { ResetUserPasswordUseCase } from '../identity/application/usecases/superadmin/ResetUserPassword.usecase';
import { CreateArcoRequestUseCase } from '../audit/application/usecases/privacy/CreateArcoRequest.usecase';
import { ListArcoRequestsUseCase } from '../audit/application/usecases/privacy/ListArcoRequests.usecase';
import { UpdateArcoRequestStatusUseCase } from '../audit/application/usecases/privacy/UpdateArcoRequestStatus.usecase';
import { AccessSubjectDataUseCase } from '../audit/application/usecases/privacy/AccessSubjectData.usecase';
import { RectifySubjectDataUseCase } from '../audit/application/usecases/privacy/RectifySubjectData.usecase';
import { CancelSubjectDataUseCase } from '../audit/application/usecases/privacy/CancelSubjectData.usecase';
import { CreateOppositionRequestUseCase } from '../audit/application/usecases/privacy/CreateOppositionRequest.usecase';
import { UsageCounterService } from '../identity/application/services/UsageCounterService';
import { diContainer } from './diRegistration';

/**
 * Simple Dependency Injection Container
 * Manages creation and lifecycle of dependencies
 */
class Container {
  private static instance: Container;

  // Repositories (singletons)
  private _visitorRepository?: IVisitorRepository;
  private _visitRepository?: IVisitRepository;
  private _intermittentLogRepository?: IIntermittentLogRepository;
  private _userRepository?: IUserRepository;
  private _auditLogRepository?: IAuditLogRepository;
  private _arcoRequestRepository?: IArcoRequestRepository;
  private _visitorEditHistoryRepository?: IVisitorEditHistoryRepository;
  private _tenantRepository?: ITenantRepository;
  private _tenantUserRepository?: ITenantUserRepository;
  // Services
  private _backupService?: IBackupService;
  private _authService?: IAuthService;
  private _passwordPolicy?: PasswordPolicy;
  private _emailService?: IEmailService;
  private _tokenBlacklist?: ITokenBlacklist;
  private _eventEmitter?: IEventEmitter;
  private _usageCounterService?: UsageCounterService;

  private constructor() { }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  /**
   * Resolve a dependency by tsyringe token. Falls back to the provided
   * factory if the token is not registered (e.g. in tests that don't
   * call registerDependencies).
   */
  private resolve<T>(token: string, fallback: () => T): T {
    try {
      if (diContainer.isRegistered(token)) return diContainer.resolve<T>(token);
    } catch {
      // tsyringe not yet registered — use fallback
    }
    return fallback();
  }

  // Repository instances — resolved via tsyringe with lazy fallback
  get visitorRepository(): IVisitorRepository {
    if (!this._visitorRepository) {
      this._visitorRepository = this.resolve<IVisitorRepository>('IVisitorRepository', () => new SequelizeVisitorRepository());
    }
    return this._visitorRepository;
  }

  get visitRepository(): IVisitRepository {
    if (!this._visitRepository) {
      this._visitRepository = this.resolve<IVisitRepository>('IVisitRepository', () => new SequelizeVisitRepository());
    }
    return this._visitRepository;
  }

  get intermittentLogRepository(): IIntermittentLogRepository {
    if (!this._intermittentLogRepository) {
      this._intermittentLogRepository = this.resolve<IIntermittentLogRepository>('IIntermittentLogRepository', () => new SequelizeIntermittentLogRepository());
    }
    return this._intermittentLogRepository;
  }

  get userRepository(): IUserRepository {
    if (!this._userRepository) {
      this._userRepository = this.resolve<IUserRepository>('IUserRepository', () => new SequelizeUserRepository());
    }
    return this._userRepository;
  }

  get auditLogRepository(): IAuditLogRepository {
    if (!this._auditLogRepository) {
      this._auditLogRepository = this.resolve<IAuditLogRepository>('IAuditLogRepository', () => new SequelizeAuditLogRepository());
    }
    return this._auditLogRepository;
  }

  get arcoRequestRepository(): IArcoRequestRepository {
    if (!this._arcoRequestRepository) {
      this._arcoRequestRepository = this.resolve<IArcoRequestRepository>('IArcoRequestRepository', () => new SequelizeArcoRequestRepository());
    }
    return this._arcoRequestRepository;
  }

  get visitorEditHistoryRepository(): IVisitorEditHistoryRepository {
    if (!this._visitorEditHistoryRepository) {
      this._visitorEditHistoryRepository = this.resolve<IVisitorEditHistoryRepository>('IVisitorEditHistoryRepository', () => new SequelizeVisitorEditHistoryRepository());
    }
    return this._visitorEditHistoryRepository;
  }

  get tenantRepository(): ITenantRepository {
    if (!this._tenantRepository) this._tenantRepository = this.resolve<ITenantRepository>('ITenantRepository', () => new SequelizeTenantRepository());
    return this._tenantRepository;
  }

  get tenantUserRepository(): ITenantUserRepository {
    if (!this._tenantUserRepository) this._tenantUserRepository = this.resolve<ITenantUserRepository>('ITenantUserRepository', () => new SequelizeTenantUserRepository());
    return this._tenantUserRepository;
  }

  get backupService(): IBackupService {
    if (!this._backupService) {
      this._backupService = this.resolve<IBackupService>('IBackupService', () => new PostgresBackupService());
    }
    return this._backupService;
  }

  // New use cases
  get updateVisitorUseCase(): UpdateVisitorUseCase {
    return new UpdateVisitorUseCase(this.visitorRepository, this.visitorEditHistoryRepository);
  }

  get getAllVisitorsUseCase(): GetAllVisitorsUseCase {
    return new GetAllVisitorsUseCase(this.visitorRepository);
  }

  get authService(): IAuthService {
    if (!this._authService) {
      this._authService = this.resolve<IAuthService>('IAuthService', () => new JwtAuthService());
    }
    return this._authService;
  }

  get passwordPolicy(): PasswordPolicy {
    if (!this._passwordPolicy) {
      this._passwordPolicy = this.resolve<PasswordPolicy>('PasswordPolicy', () => new PasswordPolicy());
    }
    return this._passwordPolicy;
  }

  get emailService(): IEmailService {
    if (!this._emailService) {
      this._emailService = this.resolve<IEmailService>('IEmailService', () => new EmailService());
    }
    return this._emailService;
  }

  get tokenBlacklist(): ITokenBlacklist {
    if (!this._tokenBlacklist) {
      this._tokenBlacklist = this.resolve<ITokenBlacklist>('ITokenBlacklist', () => tokenBlacklist);
    }
    return this._tokenBlacklist;
  }

  get eventEmitter(): IEventEmitter {
    if (!this._eventEmitter) {
      this._eventEmitter = this.resolve<IEventEmitter>('IEventEmitter', () => eventEmitterService);
    }
    return this._eventEmitter;
  }

  get usageCounterService(): UsageCounterService {
    if (!this._usageCounterService) {
      this._usageCounterService = this.resolve<UsageCounterService>('UsageCounterService', () => new UsageCounterService(
        this.tenantRepository,
        this.tenantUserRepository,
        this.visitRepository,
        this.visitorRepository,
      ));
    }
    return this._usageCounterService;
  }

  // Use case factories (new instance each time)
  createCheckInVisitorUseCase(): CheckInVisitorUseCase {
    return new CheckInVisitorUseCase(
      this.visitorRepository,
      this.visitRepository
    );
  }

  createCheckOutVisitorUseCase(): CheckOutVisitorUseCase {
    return new CheckOutVisitorUseCase(
      this.visitRepository
    );
  }

  createAdmitVisitorUseCase(): AdmitVisitorUseCase {
    return new AdmitVisitorUseCase(
      this.visitRepository
    );
  }

  createGetActiveVisitsUseCase(): GetActiveVisitsUseCase {
    return new GetActiveVisitsUseCase(
      this.visitRepository,
      this.visitorRepository
    );
  }

  createGetWaitingVisitsUseCase(): GetWaitingVisitsUseCase {
    return new GetWaitingVisitsUseCase(
      this.visitRepository
    );
  }

  createGetVisitStatsUseCase(): GetVisitStatsUseCase {
    return new GetVisitStatsUseCase(
      this.visitRepository
    );
  }

  createGetVisitorByCedulaUseCase(): GetVisitorByCedulaUseCase {
    return new GetVisitorByCedulaUseCase(
      this.visitorRepository
    );
  }

  createGetCompaniesUseCase(): GetCompaniesUseCase {
    return new GetCompaniesUseCase(
      this.visitorRepository
    );
  }

  createGetVisitsUseCase(): GetVisitsUseCase {
    return new GetVisitsUseCase(
      this.visitRepository
    );
  }

  createGetMonthlyReportUseCase(): GetMonthlyReportUseCase {
    return new GetMonthlyReportUseCase(
      this.visitRepository
    );
  }

  createGetMissedCheckoutsUseCase(): GetMissedCheckoutsUseCase {
    return new GetMissedCheckoutsUseCase(
      this.visitRepository
    );
  }

  createGetComparisonStatsUseCase(): GetComparisonStatsUseCase {
    return new GetComparisonStatsUseCase(
      this.visitRepository
    );
  }

  createCreateBackupUseCase(): CreateBackupUseCase {
    return new CreateBackupUseCase(
      this.backupService
    );
  }

  createGoIntermittentUseCase(): GoIntermittentUseCase {
    return new GoIntermittentUseCase(
      this.visitRepository,
      this.intermittentLogRepository
    );
  }

  createReactivateVisitUseCase(): ReactivateVisitUseCase {
    return new ReactivateVisitUseCase(
      this.visitRepository,
      this.intermittentLogRepository
    );
  }

  createListBackupsUseCase(): ListBackupsUseCase {
    return new ListBackupsUseCase(
      this.backupService
    );
  }

  createLoginUseCase(): LoginUseCase {
    return new LoginUseCase(
      this.userRepository,
      this.authService,
      this.auditLogRepository,
      this.tenantUserRepository
    );
  }

  createForgotPasswordUseCase(): ForgotPasswordUseCase {
    return new ForgotPasswordUseCase(
      this.userRepository,
      this.authService,
      this.emailService
    );
  }

  createResetPasswordUseCase(): ResetPasswordUseCase {
    return new ResetPasswordUseCase(
      this.userRepository,
      this.authService,
      this.passwordPolicy,
      this.emailService
    );
  }

  createRefreshTokenUseCase(): RefreshTokenUseCase {
    return new RefreshTokenUseCase(
      this.authService,
      this.userRepository,
      this.tenantUserRepository
    );
  }

  createChangePasswordUseCase(): ChangePasswordUseCase {
    return new ChangePasswordUseCase(
      this.userRepository,
      this.authService,
      this.passwordPolicy,
      this.emailService
    );
  }

  createCreateDemoTenantUseCase(): CreateDemoTenantUseCase {
    return new CreateDemoTenantUseCase(
      this.tenantRepository,
      this.tenantUserRepository,
      this.userRepository,
      this.visitorRepository,
      this.visitRepository,
      this.authService
    );
  }

  createIntermittentExitUseCase(): IntermittentExitUseCase {
    return new IntermittentExitUseCase(
      this.visitRepository,
      this.intermittentLogRepository
    );
  }

  createIntermittentReEntryUseCase(): IntermittentReEntryUseCase {
    return new IntermittentReEntryUseCase(
      this.visitRepository,
      this.intermittentLogRepository
    );
  }

  createGetIntermittentVisitsUseCase(): GetIntermittentVisitsUseCase {
    return new GetIntermittentVisitsUseCase(
      this.visitRepository,
      this.visitorRepository,
      this.intermittentLogRepository
    );
  }

  createGetAuditLogsUseCase(): GetAuditLogsUseCase {
    return new GetAuditLogsUseCase(this.auditLogRepository);
  }

  // SuperAdmin use cases
  createCreateUserUseCase(): CreateUserUseCase {
    return new CreateUserUseCase(this.userRepository, this.authService);
  }

  createUpdateUserUseCase(): UpdateUserUseCase {
    return new UpdateUserUseCase(this.userRepository);
  }

  createDeleteUserUseCase(): DeleteUserUseCase {
    return new DeleteUserUseCase(this.userRepository);
  }

  createListUsersUseCase(): ListUsersUseCase {
    return new ListUsersUseCase(this.userRepository);
  }

  createResetUserPasswordUseCase(): ResetUserPasswordUseCase {
    return new ResetUserPasswordUseCase(this.userRepository, this.authService);
  }

  // Privacy use cases
  createCreateArcoRequestUseCase(): CreateArcoRequestUseCase {
    return new CreateArcoRequestUseCase(this.arcoRequestRepository, this.auditLogRepository);
  }

  createListArcoRequestsUseCase(): ListArcoRequestsUseCase {
    return new ListArcoRequestsUseCase(this.arcoRequestRepository);
  }

  createUpdateArcoRequestStatusUseCase(): UpdateArcoRequestStatusUseCase {
    return new UpdateArcoRequestStatusUseCase(this.arcoRequestRepository, this.auditLogRepository);
  }

  createAccessSubjectDataUseCase(): AccessSubjectDataUseCase {
    return new AccessSubjectDataUseCase(this.visitorRepository, this.visitRepository, this.auditLogRepository);
  }

  createRectifySubjectDataUseCase(): RectifySubjectDataUseCase {
    return new RectifySubjectDataUseCase(this.visitorRepository, this.auditLogRepository);
  }

  createCancelSubjectDataUseCase(): CancelSubjectDataUseCase {
    return new CancelSubjectDataUseCase(this.visitorRepository, this.arcoRequestRepository, this.auditLogRepository);
  }

  createCreateOppositionRequestUseCase(): CreateOppositionRequestUseCase {
    return new CreateOppositionRequestUseCase(this.arcoRequestRepository, this.auditLogRepository);
  }
}

export const container = Container.getInstance();
