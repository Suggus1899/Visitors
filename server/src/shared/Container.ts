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
import { IntermittentExitUseCase } from '../application/usecases/IntermittentExit.usecase';
import { IntermittentReEntryUseCase } from '../application/usecases/IntermittentReEntry.usecase';
import { GetAuditLogsUseCase } from '../application/usecases/superadmin/GetAuditLogs.usecase';

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
  // Services
  private _backupService?: IBackupService;
  private _authService?: IAuthService;
  private _passwordPolicy?: PasswordPolicy;
  private _emailService?: IEmailService;

  private constructor() { }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  // Repository instances
  get visitorRepository(): IVisitorRepository {
    if (!this._visitorRepository) {
      this._visitorRepository = new SequelizeVisitorRepository();
    }
    return this._visitorRepository;
  }

  get visitRepository(): IVisitRepository {
    if (!this._visitRepository) {
      this._visitRepository = new SequelizeVisitRepository();
    }
    return this._visitRepository;
  }

  get intermittentLogRepository(): IIntermittentLogRepository {
    if (!this._intermittentLogRepository) {
      this._intermittentLogRepository = new SequelizeIntermittentLogRepository();
    }
    return this._intermittentLogRepository;
  }

  get userRepository(): IUserRepository {
    if (!this._userRepository) {
      this._userRepository = new SequelizeUserRepository();
    }
    return this._userRepository;
  }

  get auditLogRepository(): IAuditLogRepository {
    if (!this._auditLogRepository) {
      this._auditLogRepository = new SequelizeAuditLogRepository();
    }
    return this._auditLogRepository;
  }

  get backupService(): IBackupService {
    if (!this._backupService) {
      this._backupService = new PostgresBackupService();
    }
    return this._backupService;
  }

  // New use cases
  get updateVisitorUseCase(): UpdateVisitorUseCase {
    return new UpdateVisitorUseCase(this.visitorRepository);
  }

  get getAllVisitorsUseCase(): GetAllVisitorsUseCase {
    return new GetAllVisitorsUseCase(this.visitorRepository);
  }

  get authService(): IAuthService {
    if (!this._authService) {
      this._authService = new JwtAuthService();
    }
    return this._authService;
  }

  get passwordPolicy(): PasswordPolicy {
    if (!this._passwordPolicy) {
      this._passwordPolicy = new PasswordPolicy();
    }
    return this._passwordPolicy;
  }

  get emailService(): IEmailService {
    if (!this._emailService) {
      this._emailService = new EmailService();
    }
    return this._emailService;
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
      this.authService
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
      this.userRepository
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
}

export const container = Container.getInstance();
