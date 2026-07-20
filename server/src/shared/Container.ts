import { IVisitorRepository } from '../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../domain/repositories/IVisitRepository';
import { SequelizeVisitorRepository } from '../infrastructure/database/repositories/SequelizeVisitorRepository';
import { SequelizeVisitRepository } from '../infrastructure/database/repositories/SequelizeVisitRepository';
import { PostgresBackupService } from '../infrastructure/services/PostgresBackupService';
import { IBackupService } from '../domain/services/IBackupService';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { IAuthService } from '../domain/services/IAuthService';
import { IEmailService } from '../domain/services/IEmailService';
import { SequelizeUserRepository } from '../infrastructure/database/repositories/SequelizeUserRepository';
import { JwtAuthService } from '../infrastructure/services/JwtAuthService';
import { PasswordPolicy } from '../domain/services/PasswordPolicy';
import { EmailService } from '../infrastructure/services/EmailService';
import { IIntermittentLogRepository } from '../domain/repositories/IIntermittentLogRepository';
import { SequelizeIntermittentLogRepository } from '../infrastructure/database/repositories/SequelizeIntermittentLogRepository';
import { IAuditLogRepository } from '../domain/repositories/IAuditLogRepository';
import { SequelizeAuditLogRepository } from '../infrastructure/database/repositories/SequelizeAuditLogRepository';
import { ITokenBlacklist } from '../domain/services/ITokenBlacklist';
import { tokenBlacklist } from '../infrastructure/services/TokenBlacklist';
import { IEventEmitter } from '../domain/services/IEventEmitter';
import { eventEmitterService } from '../infrastructure/services/EventEmitterService';
import { IArcoRequestRepository } from '../domain/repositories/IArcoRequestRepository';
import { SequelizeArcoRequestRepository } from '../infrastructure/database/repositories/SequelizeArcoRequestRepository';
import { IVisitorEditHistoryRepository } from '../domain/repositories/IVisitorEditHistoryRepository';
import { SequelizeVisitorEditHistoryRepository } from '../infrastructure/database/repositories/SequelizeVisitorEditHistoryRepository';
import { ITenantRepository } from '../domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../domain/repositories/ITenantUserRepository';
import { SequelizeTenantRepository } from '../infrastructure/database/repositories/SequelizeTenantRepository';
import { SequelizeTenantUserRepository } from '../infrastructure/database/repositories/SequelizeTenantUserRepository';
import { CheckInVisitorUseCase } from '../application/usecases/CheckInVisitor.usecase';
import { GoIntermittentUseCase } from '../application/usecases/GoIntermittent.usecase';
import { ReactivateVisitUseCase } from '../application/usecases/ReactivateVisit.usecase';
import { GetIntermittentVisitsUseCase } from '../application/usecases/GetIntermittentVisits.usecase';
import { UpdateVisitorUseCase } from '../application/usecases/UpdateVisitor.usecase';
import { GetAllVisitorsUseCase } from '../application/usecases/GetAllVisitors.usecase';
import { CheckOutVisitorUseCase } from '../application/usecases/CheckOutVisitor.usecase';
import { AdmitVisitorUseCase } from '../application/usecases/AdmitVisitor.usecase';
import { GetActiveVisitsUseCase } from '../application/usecases/GetActiveVisits.usecase';
import { GetWaitingVisitsUseCase } from '../application/usecases/GetWaitingVisits.usecase';
import { GetVisitStatsUseCase } from '../application/usecases/GetVisitStats.usecase';
import { GetVisitorByCedulaUseCase } from '../application/usecases/GetVisitorByCedula.usecase';
import { GetCompaniesUseCase } from '../application/usecases/GetCompanies.usecase';
import { GetVisitsUseCase } from '../application/usecases/GetVisits.usecase';
import { GetMonthlyReportUseCase } from '../application/usecases/GetMonthlyReport.usecase';
import { GetMissedCheckoutsUseCase } from '../application/usecases/GetMissedCheckouts.usecase';
import { GetComparisonStatsUseCase } from '../application/usecases/GetComparisonStats.usecase';
import { CreateBackupUseCase } from '../application/usecases/CreateBackup.usecase';
import { ListBackupsUseCase } from '../application/usecases/ListBackups.usecase';
import { LoginUseCase } from '../application/usecases/auth/Login.usecase';
import { ForgotPasswordUseCase } from '../application/usecases/auth/ForgotPassword.usecase';
import { ResetPasswordUseCase } from '../application/usecases/auth/ResetPassword.usecase';
import { RefreshTokenUseCase } from '../application/usecases/auth/RefreshToken.usecase';
import { ChangePasswordUseCase } from '../application/usecases/auth/ChangePassword.usecase';
import { CreateDemoTenantUseCase } from '../application/usecases/auth/CreateDemoTenant.usecase';
import { IntermittentExitUseCase } from '../application/usecases/IntermittentExit.usecase';
import { IntermittentReEntryUseCase } from '../application/usecases/IntermittentReEntry.usecase';
import { GetAuditLogsUseCase } from '../application/usecases/superadmin/GetAuditLogs.usecase';
import { CreateUserUseCase } from '../application/usecases/superadmin/CreateUser.usecase';
import { UpdateUserUseCase } from '../application/usecases/superadmin/UpdateUser.usecase';
import { DeleteUserUseCase } from '../application/usecases/superadmin/DeleteUser.usecase';
import { ListUsersUseCase } from '../application/usecases/superadmin/ListUsers.usecase';
import { ResetUserPasswordUseCase } from '../application/usecases/superadmin/ResetUserPassword.usecase';
import { CreateArcoRequestUseCase } from '../application/usecases/privacy/CreateArcoRequest.usecase';
import { ListArcoRequestsUseCase } from '../application/usecases/privacy/ListArcoRequests.usecase';
import { UpdateArcoRequestStatusUseCase } from '../application/usecases/privacy/UpdateArcoRequestStatus.usecase';
import { AccessSubjectDataUseCase } from '../application/usecases/privacy/AccessSubjectData.usecase';
import { RectifySubjectDataUseCase } from '../application/usecases/privacy/RectifySubjectData.usecase';
import { CancelSubjectDataUseCase } from '../application/usecases/privacy/CancelSubjectData.usecase';
import { CreateOppositionRequestUseCase } from '../application/usecases/privacy/CreateOppositionRequest.usecase';
import { UsageCounterService } from '../application/services/UsageCounterService';
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
