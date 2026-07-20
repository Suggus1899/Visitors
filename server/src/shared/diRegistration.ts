import 'reflect-metadata';
import { container as diContainer, DependencyContainer } from 'tsyringe';
import { IVisitorRepository } from '../visits/domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../visits/domain/repositories/IVisitRepository';
import { IUserRepository } from '../identity/domain/repositories/IUserRepository';
import { IAuditLogRepository } from '../audit/domain/repositories/IAuditLogRepository';
import { IArcoRequestRepository } from '../audit/domain/repositories/IArcoRequestRepository';
import { IIntermittentLogRepository } from '../visits/domain/repositories/IIntermittentLogRepository';
import { IVisitorEditHistoryRepository } from '../visits/domain/repositories/IVisitorEditHistoryRepository';
import { ITenantRepository } from '../identity/domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../identity/domain/repositories/ITenantUserRepository';
import { IBackupService } from '../billing/domain/services/IBackupService';
import { IAuthService } from '../identity/domain/services/IAuthService';
import { IEmailService } from '../identity/domain/services/IEmailService';
import { ITokenBlacklist } from '../identity/domain/services/ITokenBlacklist';
import { IEventEmitter } from './domain/services/IEventEmitter';
import { SequelizeVisitorRepository } from '../visits/infrastructure/database/repositories/SequelizeVisitorRepository';
import { SequelizeVisitRepository } from '../visits/infrastructure/database/repositories/SequelizeVisitRepository';
import { SequelizeUserRepository } from '../identity/infrastructure/database/repositories/SequelizeUserRepository';
import { SequelizeAuditLogRepository } from '../audit/infrastructure/database/repositories/SequelizeAuditLogRepository';
import { SequelizeArcoRequestRepository } from '../audit/infrastructure/database/repositories/SequelizeArcoRequestRepository';
import { SequelizeIntermittentLogRepository } from '../visits/infrastructure/database/repositories/SequelizeIntermittentLogRepository';
import { SequelizeVisitorEditHistoryRepository } from '../visits/infrastructure/database/repositories/SequelizeVisitorEditHistoryRepository';
import { SequelizeTenantRepository } from '../identity/infrastructure/database/repositories/SequelizeTenantRepository';
import { SequelizeTenantUserRepository } from '../identity/infrastructure/database/repositories/SequelizeTenantUserRepository';
import { PostgresBackupService } from '../billing/infrastructure/services/PostgresBackupService';
import { JwtAuthService } from '../identity/infrastructure/services/JwtAuthService';
import { EmailService } from '../identity/infrastructure/services/EmailService';
import { tokenBlacklist } from '../identity/infrastructure/services/TokenBlacklist';
import { eventEmitterService } from './infrastructure/services/EventEmitterService';
import { PasswordPolicy } from '../identity/domain/services/PasswordPolicy';
import { UsageCounterService } from '../identity/application/services/UsageCounterService';

/**
 * DI registration module.
 *
 * Registers all repository interfaces and services in the tsyringe
 * container with their Sequelize/infrastructure implementations.
 *
 * Repositories and stateless services are singletons; use cases are
 * transient (resolved fresh each time via container.resolve).
 *
 * Import this module once at startup (server.ts) before resolving any
 * dependency. The legacy Container facade delegates to this registration
 * so existing consumers don't need to change.
 */
export function registerDependencies(): DependencyContainer {
  // Repositories (singletons)
  diContainer.registerSingleton<IVisitorRepository>('IVisitorRepository', SequelizeVisitorRepository);
  diContainer.registerSingleton<IVisitRepository>('IVisitRepository', SequelizeVisitRepository);
  diContainer.registerSingleton<IUserRepository>('IUserRepository', SequelizeUserRepository);
  diContainer.registerSingleton<IAuditLogRepository>('IAuditLogRepository', SequelizeAuditLogRepository);
  diContainer.registerSingleton<IArcoRequestRepository>('IArcoRequestRepository', SequelizeArcoRequestRepository);
  diContainer.registerSingleton<IIntermittentLogRepository>('IIntermittentLogRepository', SequelizeIntermittentLogRepository);
  diContainer.registerSingleton<IVisitorEditHistoryRepository>('IVisitorEditHistoryRepository', SequelizeVisitorEditHistoryRepository);
  diContainer.registerSingleton<ITenantRepository>('ITenantRepository', SequelizeTenantRepository);
  diContainer.registerSingleton<ITenantUserRepository>('ITenantUserRepository', SequelizeTenantUserRepository);

  // Services (singletons)
  diContainer.registerSingleton<IBackupService>('IBackupService', PostgresBackupService);
  diContainer.registerSingleton<IAuthService>('IAuthService', JwtAuthService);
  diContainer.registerSingleton<IEmailService>('IEmailService', EmailService);
  diContainer.registerSingleton<PasswordPolicy>('PasswordPolicy', PasswordPolicy);

  // Services with pre-built instances (module-level singletons)
  diContainer.registerInstance<ITokenBlacklist>('ITokenBlacklist', tokenBlacklist);
  diContainer.registerInstance<IEventEmitter>('IEventEmitter', eventEmitterService);

  // UsageCounterService depends on four repositories resolved by interface token
  diContainer.register<UsageCounterService>('UsageCounterService', {
    useFactory: (c) => new UsageCounterService(
      c.resolve<ITenantRepository>('ITenantRepository'),
      c.resolve<ITenantUserRepository>('ITenantUserRepository'),
      c.resolve<IVisitRepository>('IVisitRepository'),
      c.resolve<IVisitorRepository>('IVisitorRepository'),
    ),
  });

  return diContainer;
}

export { diContainer };
