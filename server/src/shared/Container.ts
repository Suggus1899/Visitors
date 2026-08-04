import { IVisitorRepository } from '../visits/domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../visits/domain/repositories/IVisitRepository';
import { IBackupService } from '../billing/domain/services/IBackupService';
import { IUserRepository } from '../identity/domain/repositories/IUserRepository';
import { IAuthService } from '../identity/domain/services/IAuthService';
import { IEmailService } from '../identity/domain/services/IEmailService';
import { PasswordPolicy } from '../identity/domain/services/PasswordPolicy';
import { IIntermittentLogRepository } from '../visits/domain/repositories/IIntermittentLogRepository';
import { IAuditLogRepository } from '../audit/domain/repositories/IAuditLogRepository';
import { ITokenBlacklist } from '../identity/domain/services/ITokenBlacklist';
import { IEventEmitter } from './domain/services/IEventEmitter';
import { IArcoRequestRepository } from '../audit/domain/repositories/IArcoRequestRepository';
import { IVisitorEditHistoryRepository } from '../visits/domain/repositories/IVisitorEditHistoryRepository';
import { ITenantRepository } from '../identity/domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../identity/domain/repositories/ITenantUserRepository';
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
 * Thin facade over tsyringe.
 *
 * Getters resolve singletons from tsyringe (already cached by tsyringe's
 * `registerSingleton` — no local caching needed). `create*UseCase` factories
 * build transient instances with explicit dep wiring.
 *
 * Callers can also use `diContainer.resolve<T>('Token')` directly.
 */
export const container = {
  // Repositories (tsyringe singletons)
  get visitorRepository() { return diContainer.resolve<IVisitorRepository>('IVisitorRepository'); },
  get visitRepository() { return diContainer.resolve<IVisitRepository>('IVisitRepository'); },
  get intermittentLogRepository() { return diContainer.resolve<IIntermittentLogRepository>('IIntermittentLogRepository'); },
  get userRepository() { return diContainer.resolve<IUserRepository>('IUserRepository'); },
  get auditLogRepository() { return diContainer.resolve<IAuditLogRepository>('IAuditLogRepository'); },
  get arcoRequestRepository() { return diContainer.resolve<IArcoRequestRepository>('IArcoRequestRepository'); },
  get visitorEditHistoryRepository() { return diContainer.resolve<IVisitorEditHistoryRepository>('IVisitorEditHistoryRepository'); },
  get tenantRepository() { return diContainer.resolve<ITenantRepository>('ITenantRepository'); },
  get tenantUserRepository() { return diContainer.resolve<ITenantUserRepository>('ITenantUserRepository'); },

  // Services (tsyringe singletons)
  get backupService() { return diContainer.resolve<IBackupService>('IBackupService'); },
  get authService() { return diContainer.resolve<IAuthService>('IAuthService'); },
  get passwordPolicy() { return diContainer.resolve<PasswordPolicy>('PasswordPolicy'); },
  get emailService() { return diContainer.resolve<IEmailService>('IEmailService'); },
  get tokenBlacklist() { return diContainer.resolve<ITokenBlacklist>('ITokenBlacklist'); },
  get eventEmitter() { return diContainer.resolve<IEventEmitter>('IEventEmitter'); },
  get usageCounterService() { return diContainer.resolve<UsageCounterService>('UsageCounterService'); },

  // Use-case factories (transient — one instance per call)
  get updateVisitorUseCase() { return new UpdateVisitorUseCase(this.visitorRepository, this.visitorEditHistoryRepository); },
  get getAllVisitorsUseCase() { return new GetAllVisitorsUseCase(this.visitorRepository); },

  createCheckInVisitorUseCase() { return new CheckInVisitorUseCase(this.visitorRepository, this.visitRepository); },
  createCheckOutVisitorUseCase() { return new CheckOutVisitorUseCase(this.visitRepository); },
  createAdmitVisitorUseCase() { return new AdmitVisitorUseCase(this.visitRepository); },
  createGetActiveVisitsUseCase() { return new GetActiveVisitsUseCase(this.visitRepository, this.visitorRepository); },
  createGetWaitingVisitsUseCase() { return new GetWaitingVisitsUseCase(this.visitRepository); },
  createGetVisitStatsUseCase() { return new GetVisitStatsUseCase(this.visitRepository); },
  createGetVisitorByCedulaUseCase() { return new GetVisitorByCedulaUseCase(this.visitorRepository); },
  createGetCompaniesUseCase() { return new GetCompaniesUseCase(this.visitorRepository); },
  createGetVisitsUseCase() { return new GetVisitsUseCase(this.visitRepository); },
  createGetMonthlyReportUseCase() { return new GetMonthlyReportUseCase(this.visitRepository); },
  createGetMissedCheckoutsUseCase() { return new GetMissedCheckoutsUseCase(this.visitRepository); },
  createGetComparisonStatsUseCase() { return new GetComparisonStatsUseCase(this.visitRepository); },
  createCreateBackupUseCase() { return new CreateBackupUseCase(this.backupService); },
  createGoIntermittentUseCase() { return new GoIntermittentUseCase(this.visitRepository, this.intermittentLogRepository); },
  createReactivateVisitUseCase() { return new ReactivateVisitUseCase(this.visitRepository, this.intermittentLogRepository); },
  createListBackupsUseCase() { return new ListBackupsUseCase(this.backupService); },
  createLoginUseCase() { return new LoginUseCase(this.userRepository, this.authService, this.auditLogRepository, this.tenantUserRepository); },
  createForgotPasswordUseCase() { return new ForgotPasswordUseCase(this.userRepository, this.authService, this.emailService); },
  createResetPasswordUseCase() { return new ResetPasswordUseCase(this.userRepository, this.authService, this.passwordPolicy, this.emailService); },
  createRefreshTokenUseCase() { return new RefreshTokenUseCase(this.authService, this.userRepository, this.tenantUserRepository); },
  createChangePasswordUseCase() { return new ChangePasswordUseCase(this.userRepository, this.authService, this.passwordPolicy, this.emailService); },
  createCreateDemoTenantUseCase() { return new CreateDemoTenantUseCase(this.tenantRepository, this.tenantUserRepository, this.userRepository, this.visitorRepository, this.visitRepository, this.authService); },
  createIntermittentExitUseCase() { return new IntermittentExitUseCase(this.visitRepository, this.intermittentLogRepository); },
  createIntermittentReEntryUseCase() { return new IntermittentReEntryUseCase(this.visitRepository, this.intermittentLogRepository); },
  createGetIntermittentVisitsUseCase() { return new GetIntermittentVisitsUseCase(this.visitRepository, this.visitorRepository, this.intermittentLogRepository); },
  createGetAuditLogsUseCase() { return new GetAuditLogsUseCase(this.auditLogRepository); },
  createCreateUserUseCase() { return new CreateUserUseCase(this.userRepository, this.authService); },
  createUpdateUserUseCase() { return new UpdateUserUseCase(this.userRepository); },
  createDeleteUserUseCase() { return new DeleteUserUseCase(this.userRepository); },
  createListUsersUseCase() { return new ListUsersUseCase(this.userRepository); },
  createResetUserPasswordUseCase() { return new ResetUserPasswordUseCase(this.userRepository, this.authService); },
  createCreateArcoRequestUseCase() { return new CreateArcoRequestUseCase(this.arcoRequestRepository, this.auditLogRepository); },
  createListArcoRequestsUseCase() { return new ListArcoRequestsUseCase(this.arcoRequestRepository); },
  createUpdateArcoRequestStatusUseCase() { return new UpdateArcoRequestStatusUseCase(this.arcoRequestRepository, this.auditLogRepository); },
  createAccessSubjectDataUseCase() { return new AccessSubjectDataUseCase(this.visitorRepository, this.visitRepository, this.auditLogRepository); },
  createRectifySubjectDataUseCase() { return new RectifySubjectDataUseCase(this.visitorRepository, this.auditLogRepository); },
  createCancelSubjectDataUseCase() { return new CancelSubjectDataUseCase(this.visitorRepository, this.arcoRequestRepository, this.auditLogRepository); },
  createCreateOppositionRequestUseCase() { return new CreateOppositionRequestUseCase(this.arcoRequestRepository, this.auditLogRepository); },
};
