import crypto from 'crypto';
import { ITenantRepository } from '../../../domain/repositories/ITenantRepository';
import { ITenantUserRepository } from '../../../domain/repositories/ITenantUserRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IVisitorRepository } from '../../../domain/repositories/IVisitorRepository';
import { IVisitRepository } from '../../../domain/repositories/IVisitRepository';
import { IAuthService, TokenUser } from '../../../domain/services/IAuthService';
import { TenantEntity } from '../../../domain/entities/Tenant.entity';
import { TenantRole } from '../../../domain/entities/TenantUser.entity';
import { User } from '../../../domain/entities/User.entity';
import { Visitor } from '../../../domain/entities/Visitor.entity';
import { Visit, VisitStatus } from '../../../domain/entities/Visit.entity';
import { CreateDemoDto, CreateDemoResult, DemoCredentialDto } from '../../dto/AuthDto';
import logger from '../../../config/logger';

const DEMO_PASSWORD = 'Demo123*';
const DEMO_DURATION_DAYS = 7;

interface DemoUserSpec {
  localPart: string;
  role: TenantRole;
}

const DEMO_USERS: DemoUserSpec[] = [
  { localPart: 'guardia', role: 'operador' },
  { localPart: 'admin', role: 'admin' },
  { localPart: 'auditor', role: 'auditor' }
];

/**
 * Creates a self-contained demo tenant with three pre-provisioned users
 * (operador, admin, auditor) and a small set of seed visitors/visits so the
 * tenant is immediately explorable. Returns an admin access token scoped to
 * the new tenant.
 */
export class CreateDemoTenantUseCase {
  constructor(
    private tenantRepository: ITenantRepository,
    private tenantUserRepository: ITenantUserRepository,
    private userRepository: IUserRepository,
    private visitorRepository: IVisitorRepository,
    private visitRepository: IVisitRepository,
    private authService: IAuthService
  ) { }

  async execute(dto: CreateDemoDto): Promise<CreateDemoResult> {
    const demoSlug = `demo-${crypto.randomUUID().slice(0, 8)}`;
    const tenantName = `Demo - ${dto.company || dto.name}`;
    const expiresAt = new Date(Date.now() + DEMO_DURATION_DAYS * 24 * 60 * 60 * 1000);

    // Use the 'starter' plan so the auditor role is permitted (the free plan
    // caps auditor users at zero).
    const tenantEntity: TenantEntity = {
      slug: demoSlug,
      name: tenantName,
      status: 'active',
      subscriptionPlan: 'starter',
      isDemo: true,
      demoExpiresAt: expiresAt,
      settings: {}
    };
    const tenant = await this.tenantRepository.create(tenantEntity);

    const credentials: DemoCredentialDto[] = [];
    let adminUserId: number | undefined;

    for (const spec of DEMO_USERS) {
      const email = `${spec.localPart}@${demoSlug}.com`;
      const username = `${spec.localPart}@${demoSlug}.com`;

      let user = await this.userRepository.findByEmail(email);
      if (!user) {
        const hashedPassword = await this.authService.hashPassword(DEMO_PASSWORD);
        const created = await this.userRepository.save(
          new User(username, spec.role, hashedPassword, undefined, undefined, undefined, false, new Date(), 0, null, email, false)
        );
        user = created;
      }

      await this.tenantUserRepository.create({
        userId: user.id!,
        tenantId: tenant.id!,
        role: spec.role,
        isActive: true
      });

      if (spec.role === 'admin') {
        adminUserId = user.id;
      }

      credentials.push({ email, password: DEMO_PASSWORD, role: spec.role });
    }

    await this.seedDemoData(tenant.id!);

    // Issue an admin access token scoped to the demo tenant.
    const adminTokenUser: TokenUser = {
      id: adminUserId,
      username: `admin@${demoSlug}.com`,
      email: `admin@${demoSlug}.com`,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role: 'admin'
    };
    const accessToken = this.authService.generateAccessToken(adminTokenUser);

    logger.info(`Demo tenant created: slug=${demoSlug}, expiresAt=${expiresAt.toISOString()}`);

    return {
      demoTenant: {
        slug: demoSlug,
        name: tenantName,
        expiresAt
      },
      credentials,
      accessToken
    };
  }

  /**
   * Seeds 5 visitors and 10 visits so the demo tenant has visible data.
   */
  private async seedDemoData(tenantId: number): Promise<void> {
    const visitorSpecs = [
      { cedula: 'V-10000001', firstName: 'Juan', lastName: 'Perez', company: 'ACME Corp' },
      { cedula: 'V-10000002', firstName: 'Maria', lastName: 'Gomez', company: 'TechSoft' },
      { cedula: 'V-10000003', firstName: 'Carlos', lastName: 'Ruiz', company: 'Global Logistics' },
      { cedula: 'V-10000004', firstName: 'Ana', lastName: 'Torres', company: 'Innova Labs' },
      { cedula: 'V-10000005', firstName: 'Luis', lastName: 'Mora', company: 'ACME Corp' }
    ];

    const createdVisitors: Visitor[] = [];
    for (const spec of visitorSpecs) {
      const visitor = new Visitor(
        undefined,
        spec.cedula,
        spec.firstName,
        spec.lastName,
        spec.company
      );
      createdVisitors.push(await this.visitorRepository.create(tenantId, visitor));
    }

    const purposes = ['Reunion', 'Entrega de documentos', 'Mantenimiento', 'Capacitacion', 'Visita comercial'];
    const hosts = ['Pedro Jimenez', 'Laura Diaz', 'Miguel Soto', 'Sofia Vargas'];

    for (let i = 0; i < 10; i++) {
      const visitor = createdVisitors[i % createdVisitors.length];
      const checkInTime = new Date(Date.now() - (10 - i) * 60 * 60 * 1000);
      const isCompleted = i % 3 === 0;
      const checkOutTime = isCompleted ? new Date(checkInTime.getTime() + 45 * 60 * 1000) : undefined;

      const visit = new Visit(
        visitor.cedula,
        checkInTime,
        purposes[i % purposes.length],
        hosts[i % hosts.length],
        isCompleted ? VisitStatus.COMPLETED : VisitStatus.ACTIVE,
        undefined,
        checkOutTime
      );
      await this.visitRepository.create(tenantId, visit);
    }
  }
}
