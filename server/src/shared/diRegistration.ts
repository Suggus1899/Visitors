import 'reflect-metadata';
import { container as diContainer, DependencyContainer } from 'tsyringe';
import { IVisitorRepository } from '../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../domain/repositories/IVisitRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { IAuditLogRepository } from '../domain/repositories/IAuditLogRepository';
import { IArcoRequestRepository } from '../domain/repositories/IArcoRequestRepository';
import { IIntermittentLogRepository } from '../domain/repositories/IIntermittentLogRepository';
import { IVisitorEditHistoryRepository } from '../domain/repositories/IVisitorEditHistoryRepository';
import { ITenantRepository } from '../domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../domain/repositories/ITenantUserRepository';
import { IBackupService } from '../domain/services/IBackupService';
import { IAuthService } from '../domain/services/IAuthService';
import { IEmailService } from '../domain/services/IEmailService';
import { ITokenBlacklist } from '../domain/services/ITokenBlacklist';
import { IEventEmitter } from '../domain/services/IEventEmitter';
import { SequelizeVisitorRepository } from '../infrastructure/database/repositories/SequelizeVisitorRepository';
import { SequelizeVisitRepository } from '../infrastructure/database/repositories/SequelizeVisitRepository';
import { SequelizeUserRepository } from '../infrastructure/database/repositories/SequelizeUserRepository';
import { SequelizeAuditLogRepository } from '../infrastructure/database/repositories/SequelizeAuditLogRepository';
import { SequelizeArcoRequestRepository } from '../infrastructure/database/repositories/SequelizeArcoRequestRepository';
import { SequelizeIntermittentLogRepository } from '../infrastructure/database/repositories/SequelizeIntermittentLogRepository';
import { SequelizeVisitorEditHistoryRepository } from '../infrastructure/database/repositories/SequelizeVisitorEditHistoryRepository';
import { SequelizeTenantRepository } from '../infrastructure/database/repositories/SequelizeTenantRepository';
import { SequelizeTenantUserRepository } from '../infrastructure/database/repositories/SequelizeTenantUserRepository';
import { PostgresBackupService } from '../infrastructure/services/PostgresBackupService';
import { JwtAuthService } from '../infrastructure/services/JwtAuthService';
import { EmailService } from '../infrastructure/services/EmailService';
import { tokenBlacklist } from '../infrastructure/services/TokenBlacklist';
import { eventEmitterService } from '../infrastructure/services/EventEmitterService';
import { PasswordPolicy } from '../domain/services/PasswordPolicy';
import { UsageCounterService } from '../application/services/UsageCounterService';

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
