/**
 * Cross-tenant isolation tests at the controller layer.
 *
 * Verifies that every tenant-scoped controller passes the tenantId from
 * req.tenantId (set by the auth middleware) to the repository/use case,
 * and NEVER uses a tenantId from the request body, query, or params.
 *
 * This complements cross-tenant-access.test.ts which tests the auth
 * middleware. Here we test that controllers respect the tenant context
 * established by that middleware.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { mockRequest, mockResponse } from '../helpers/mockRequest';
import { TENANT_A, TENANT_B } from '../helpers/mockToken';

// ── Mock the Container with spies on every repository ──
const spies = vi.hoisted(() => {
  const makeRepoSpy = (methods: string[]) => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {};
    methods.forEach(m => { obj[m] = vi.fn(); });
    return obj;
  };

  return {
    visitorRepo: makeRepoSpy(['findAll', 'findByCedula', 'findById', 'exists', 'count', 'findDistinctCompanies', 'create', 'update', 'updateById', 'delete', 'deleteById', 'getPhotoBlob', 'getIdPhotoBlob', 'findByCedulaWithHistory']),
    visitRepo: makeRepoSpy(['findAll', 'findActive', 'findIntermittent', 'findById', 'findByDateRange', 'create', 'update', 'delete', 'count', 'countByStatus', 'countByDateRange', 'findForReport', 'findMissedCheckouts']),
    auditLogRepo: makeRepoSpy(['findAll', 'getStats', 'getDistinctActions', 'getDistinctUsers', 'count', 'log']),
    arcoRepo: makeRepoSpy(['create', 'findAll', 'findById', 'updateStatus']),
    visitorEditHistoryRepo: makeRepoSpy(['create', 'findByVisitId', 'findByVisitorId']),
    tenantRepo: makeRepoSpy(['findById', 'findBySlug', 'findAccessibleByUserId', 'create']),
    tenantUserRepo: makeRepoSpy(['findMembership', 'findMembershipBySlug', 'findByUserIdWithTenant', 'create']),
    userRepo: makeRepoSpy(['findAll', 'findByUsername', 'findByEmail', 'findById', 'findByResetToken', 'getMustChangePassword', 'save', 'delete', 'updatePassword', 'updatePasswordChange', 'updateLoginAttempts', 'updateResetToken']),
    intermittentLogRepo: makeRepoSpy(['create', 'findByVisitId', 'findAll']),
    backupService: makeRepoSpy(['createBackup', 'listBackups', 'restoreBackup', 'applyRetention']),
    eventEmitter: makeRepoSpy(['emitVisitEvent']),
    usageCounterService: makeRepoSpy(['getUsage', 'assertCanCreateVisit', 'assertCanCreateVisitor', 'assertCanCreateUser']),
    tokenBlacklist: { isBlacklisted: vi.fn().mockReturnValue(false), isTokenInvalidatedForUser: vi.fn().mockReturnValue(false), invalidateUserTokens: vi.fn() },
    authService: makeRepoSpy(['hashPassword', 'verifyPassword', 'generateToken', 'generateRefreshToken', 'verifyToken', 'verifyRefreshToken']),
    // Use case factories return objects with execute spies
    useCaseSpies: {
      getVisitorByCedula: { execute: vi.fn() },
      getAllVisitors: { execute: vi.fn() },
      checkInVisitor: { execute: vi.fn() },
      checkOutVisitor: { execute: vi.fn() },
      admitVisitor: { execute: vi.fn() },
      getActiveVisits: { execute: vi.fn() },
      getWaitingVisits: { execute: vi.fn() },
      getVisitStats: { execute: vi.fn() },
      getCompanies: { execute: vi.fn() },
      getVisits: { execute: vi.fn() },
      getMonthlyReport: { execute: vi.fn() },
      getMissedCheckouts: { execute: vi.fn() },
      getComparisonStats: { execute: vi.fn() },
      createBackup: { execute: vi.fn() },
      listBackups: { execute: vi.fn() },
      goIntermittent: { execute: vi.fn() },
      reactivateVisit: { execute: vi.fn() },
      intermittentExit: { execute: vi.fn() },
      intermittentReEntry: { execute: vi.fn() },
      getIntermittentVisits: { execute: vi.fn() },
      updateVisitor: { execute: vi.fn() },
      createArcoRequest: { execute: vi.fn() },
      listArcoRequests: { execute: vi.fn() },
      updateArcoRequestStatus: { execute: vi.fn() },
      accessSubjectData: { execute: vi.fn() },
      rectifySubjectData: { execute: vi.fn() },
      cancelSubjectData: { execute: vi.fn() },
      createOppositionRequest: { execute: vi.fn() },
    },
  };
});

vi.mock('../../services/UsageCounterService', () => ({
  usageCounterService: spies.usageCounterService,
}));

vi.mock('../../shared/Container', () => ({
  container: {
    visitorRepository: spies.visitorRepo,
    visitRepository: spies.visitRepo,
    auditLogRepository: spies.auditLogRepo,
    arcoRequestRepository: spies.arcoRepo,
    visitorEditHistoryRepository: spies.visitorEditHistoryRepo,
    tenantRepository: spies.tenantRepo,
    tenantUserRepository: spies.tenantUserRepo,
    userRepository: spies.userRepo,
    intermittentLogRepository: spies.intermittentLogRepo,
    backupService: spies.backupService,
    eventEmitter: spies.eventEmitter,
    tokenBlacklist: spies.tokenBlacklist,
    authService: spies.authService,
    usageCounterService: spies.usageCounterService,
    // Use case getters
    getAllVisitorsUseCase: spies.useCaseSpies.getAllVisitors,
    createGetVisitorByCedulaUseCase: () => spies.useCaseSpies.getVisitorByCedula,
    createCheckInVisitorUseCase: () => spies.useCaseSpies.checkInVisitor,
    createCheckOutVisitorUseCase: () => spies.useCaseSpies.checkOutVisitor,
    createAdmitVisitorUseCase: () => spies.useCaseSpies.admitVisitor,
    createGetActiveVisitsUseCase: () => spies.useCaseSpies.getActiveVisits,
    createGetWaitingVisitsUseCase: () => spies.useCaseSpies.getWaitingVisits,
    createGetVisitStatsUseCase: () => spies.useCaseSpies.getVisitStats,
    createGetCompaniesUseCase: () => spies.useCaseSpies.getCompanies,
    createGetVisitsUseCase: () => spies.useCaseSpies.getVisits,
    createGetMonthlyReportUseCase: () => spies.useCaseSpies.getMonthlyReport,
    createGetMissedCheckoutsUseCase: () => spies.useCaseSpies.getMissedCheckouts,
    createGetComparisonStatsUseCase: () => spies.useCaseSpies.getComparisonStats,
    createCreateBackupUseCase: () => spies.useCaseSpies.createBackup,
    createListBackupsUseCase: () => spies.useCaseSpies.listBackups,
    createGoIntermittentUseCase: () => spies.useCaseSpies.goIntermittent,
    createReactivateVisitUseCase: () => spies.useCaseSpies.reactivateVisit,
    createIntermittentExitUseCase: () => spies.useCaseSpies.intermittentExit,
    createIntermittentReEntryUseCase: () => spies.useCaseSpies.intermittentReEntry,
    createGetIntermittentVisitsUseCase: () => spies.useCaseSpies.getIntermittentVisits,
    updateVisitorUseCase: spies.useCaseSpies.updateVisitor,
    createCreateArcoRequestUseCase: () => spies.useCaseSpies.createArcoRequest,
    createListArcoRequestsUseCase: () => spies.useCaseSpies.listArcoRequests,
    createUpdateArcoRequestStatusUseCase: () => spies.useCaseSpies.updateArcoRequestStatus,
    createAccessSubjectDataUseCase: () => spies.useCaseSpies.accessSubjectData,
    createRectifySubjectDataUseCase: () => spies.useCaseSpies.rectifySubjectData,
    createCancelSubjectDataUseCase: () => spies.useCaseSpies.cancelSubjectData,
    createCreateOppositionRequestUseCase: () => spies.useCaseSpies.createOppositionRequest,
  },
}));

// Import controllers after mock is set up
import * as VisitorController from '../../controllers/VisitorController';
import * as VisitController from '../../controllers/VisitController';
import * as AuditController from '../../controllers/AuditController';
import * as PrivacyController from '../../controllers/PrivacyController';
import * as BackupController from '../../controllers/BackupController';
import * as TenantFeaturesController from '../../controllers/TenantFeaturesController';

const tenantAUser = { id: 1, username: 'admin-a', tid: TENANT_A.id, tslug: TENANT_A.slug, role: 'admin' };

beforeAll(() => {
  // Default mock returns so controllers don't throw
  spies.useCaseSpies.getVisitorByCedula.execute.mockResolvedValue(null);
  spies.useCaseSpies.getAllVisitors.execute.mockResolvedValue({ visitors: [], total: 0 });
  spies.useCaseSpies.getCompanies.execute.mockResolvedValue([]);
  spies.useCaseSpies.checkInVisitor.execute.mockResolvedValue({ id: 1 });
  spies.useCaseSpies.checkOutVisitor.execute.mockResolvedValue({});
  spies.useCaseSpies.admitVisitor.execute.mockResolvedValue({});
  spies.useCaseSpies.getActiveVisits.execute.mockResolvedValue([]);
  spies.useCaseSpies.getWaitingVisits.execute.mockResolvedValue([]);
  spies.useCaseSpies.getVisitStats.execute.mockResolvedValue({});
  spies.useCaseSpies.getVisits.execute.mockResolvedValue({ visits: [], total: 0 });
  spies.useCaseSpies.getMonthlyReport.execute.mockResolvedValue({});
  spies.useCaseSpies.getMissedCheckouts.execute.mockResolvedValue([]);
  spies.useCaseSpies.getComparisonStats.execute.mockResolvedValue({});
  spies.useCaseSpies.createBackup.execute.mockResolvedValue({ filePath: '/tmp/x', restorePassword: 'abc' });
  spies.useCaseSpies.listBackups.execute.mockResolvedValue([]);
  spies.useCaseSpies.goIntermittent.execute.mockResolvedValue({});
  spies.useCaseSpies.reactivateVisit.execute.mockResolvedValue({});
  spies.useCaseSpies.intermittentExit.execute.mockResolvedValue({});
  spies.useCaseSpies.intermittentReEntry.execute.mockResolvedValue({});
  spies.useCaseSpies.getIntermittentVisits.execute.mockResolvedValue([]);
  spies.useCaseSpies.updateVisitor.execute.mockResolvedValue({});
  spies.useCaseSpies.createArcoRequest.execute.mockResolvedValue({});
  spies.useCaseSpies.listArcoRequests.execute.mockResolvedValue({ requests: [], total: 0 });
  spies.useCaseSpies.updateArcoRequestStatus.execute.mockResolvedValue({});
  spies.useCaseSpies.accessSubjectData.execute.mockResolvedValue({});
  spies.useCaseSpies.rectifySubjectData.execute.mockResolvedValue({});
  spies.useCaseSpies.cancelSubjectData.execute.mockResolvedValue({});
  spies.useCaseSpies.createOppositionRequest.execute.mockResolvedValue({});
  spies.auditLogRepo.findAll.mockResolvedValue({ logs: [], total: 0 });
  spies.auditLogRepo.getStats.mockResolvedValue({ today: { logins: 0, actions: 0, uniqueUsers: 0, uniqueIPs: 0 }, lastWeek: { actionsByType: [], topUsers: [], dailyActivity: [] } });
  spies.auditLogRepo.getDistinctActions.mockResolvedValue([]);
  spies.auditLogRepo.getDistinctUsers.mockResolvedValue([]);
  spies.visitorRepo.findAll.mockResolvedValue([]);
  spies.visitorRepo.findByCedula.mockResolvedValue(null);
  spies.visitorRepo.findDistinctCompanies.mockResolvedValue([]);
  spies.visitorRepo.count.mockResolvedValue(0);
  spies.visitorEditHistoryRepo.findByVisitId.mockResolvedValue([]);
  spies.visitorEditHistoryRepo.findByVisitorId.mockResolvedValue([]);
  spies.tenantRepo.findById.mockResolvedValue({ id: TENANT_A.id, slug: TENANT_A.slug, name: 'Tenant A', status: 'active', subscriptionPlan: 'free' });
  spies.backupService.createBackup.mockResolvedValue({ filePath: '/tmp/x', restorePassword: 'abc' });
  spies.backupService.listBackups.mockResolvedValue([]);
  spies.backupService.applyRetention.mockResolvedValue(0);
  spies.usageCounterService.getUsage.mockResolvedValue({ visitsThisMonth: 0, visitors: 0, users: 0, roleBreakdown: [] });
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set defaults after clearAllMocks
  spies.tokenBlacklist.isBlacklisted.mockReturnValue(false);
  spies.tokenBlacklist.isTokenInvalidatedForUser.mockReturnValue(false);
});

describe('Cross-tenant isolation: controllers always use req.tenantId', () => {
  describe('VisitorController', () => {
    it('getAllVisitors passes tenantId from req.tenantId', async () => {
      const req = mockRequest({ tenantId: TENANT_A.id, user: tenantAUser, query: { page: '1', limit: '50' } });
      const res = mockResponse();
      spies.useCaseSpies.getAllVisitors.execute.mockResolvedValue({ visitors: [], total: 0 });

      await VisitorController.getAllVisitors(req, res);

      expect(spies.useCaseSpies.getAllVisitors.execute).toHaveBeenCalledWith(TENANT_A.id, expect.anything());
      const callArg = spies.useCaseSpies.getAllVisitors.execute.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
      expect(callArg).not.toBe(TENANT_B.id);
    });

    it('getVisitor passes tenantId from req.tenantId, not from params', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        params: { cedula: 'V-12345678', tenantSlug: TENANT_A.slug },
      });
      const res = mockResponse();
      spies.useCaseSpies.getVisitorByCedula.execute.mockResolvedValue(null);

      await VisitorController.getVisitor(req, res);

      expect(spies.useCaseSpies.getVisitorByCedula.execute).toHaveBeenCalledWith(TENANT_A.id, 'V-12345678', false);
    });

    it('getCompanies passes tenantId from req.tenantId', async () => {
      const req = mockRequest({ tenantId: TENANT_A.id, user: tenantAUser });
      const res = mockResponse();

      await VisitorController.getCompanies(req, res);

      expect(spies.useCaseSpies.getCompanies.execute).toHaveBeenCalledWith(TENANT_A.id, expect.anything());
      const callArg = spies.useCaseSpies.getCompanies.execute.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
    });

    it('updateVisitor passes tenantId from req.tenantId, not from body', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        params: { cedula: 'V-12345678' },
        body: { tenantId: TENANT_B.id, first_name: 'Hacker', visitId: 1 }, // body tries to override
      });
      const res = mockResponse();
      spies.useCaseSpies.updateVisitor.execute.mockResolvedValue({});

      await VisitorController.updateVisitor(req, res);

      const callArgs = spies.useCaseSpies.updateVisitor.execute.mock.calls[0];
      expect(callArgs[0]).toBe(TENANT_A.id);
      expect(callArgs[0]).not.toBe(TENANT_B.id);
    });
  });

  describe('VisitController', () => {
    it('checkIn passes tenantId from req.tenantId, not from body', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        body: { tenantId: TENANT_B.id, visitorCedula: 'V-12345678', personToVisit: 'John' },
      });
      const res = mockResponse();

      await VisitController.checkIn(req, res);

      expect(spies.useCaseSpies.checkInVisitor.execute).toHaveBeenCalledWith(TENANT_A.id, expect.anything());
      const callArg = spies.useCaseSpies.checkInVisitor.execute.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
    });

    it('checkOut passes tenantId from req.tenantId', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        params: { id: '123' },
      });
      const res = mockResponse();

      await VisitController.checkOut(req, res);

      const callArgs = spies.useCaseSpies.checkOutVisitor.execute.mock.calls[0];
      expect(callArgs[0]).toBe(TENANT_A.id);
      expect(callArgs[1]).toMatchObject({ visitId: 123 });
    });
  });

  describe('AuditController', () => {
    it('getLogs passes tenantId from req.tenantId to auditLogRepository.findAll', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        query: { page: '1', limit: '50' },
      });
      const res = mockResponse();

      await AuditController.getLogs(req, res);

      expect(spies.auditLogRepo.findAll).toHaveBeenCalledWith(TENANT_A.id, expect.anything());
      const callArg = spies.auditLogRepo.findAll.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
    });

    it('getStats passes tenantId from req.tenantId', async () => {
      const req = mockRequest({ tenantId: TENANT_A.id, user: tenantAUser });
      const res = mockResponse();

      await AuditController.getStats(req, res);

      expect(spies.auditLogRepo.getStats).toHaveBeenCalledWith(TENANT_A.id);
    });

    it('getActions passes tenantId from req.tenantId', async () => {
      const req = mockRequest({ tenantId: TENANT_A.id, user: tenantAUser });
      const res = mockResponse();

      await AuditController.getActions(req, res);

      expect(spies.auditLogRepo.getDistinctActions).toHaveBeenCalledWith(TENANT_A.id);
    });

    it('getUsers passes tenantId from req.tenantId', async () => {
      const req = mockRequest({ tenantId: TENANT_A.id, user: tenantAUser });
      const res = mockResponse();

      await AuditController.getUsers(req, res);

      expect(spies.auditLogRepo.getDistinctUsers).toHaveBeenCalledWith(TENANT_A.id);
    });
  });

  describe('PrivacyController', () => {
    it('createArcoRequest passes tenantId from req.tenantId, not from body', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        body: { tenantId: TENANT_B.id, requestType: 'access', cedula: 'V-12345678', requestedByName: 'Test' },
      });
      const res = mockResponse();

      await PrivacyController.createArcoRequest(req, res);

      expect(spies.useCaseSpies.createArcoRequest.execute).toHaveBeenCalledWith(TENANT_A.id, expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());
      const callArg = spies.useCaseSpies.createArcoRequest.execute.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
    });
  });

  describe('BackupController', () => {
    it('createTenantBackup passes tenantId from req.tenantId, not from body', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        body: { tenantId: TENANT_B.id },
      });
      const res = mockResponse();

      await BackupController.createTenantBackup(req, res);

      expect(spies.tenantRepo.findById).toHaveBeenCalledWith(TENANT_A.id);
      expect(spies.backupService.createBackup).toHaveBeenCalledWith(TENANT_A.id);
      expect(spies.backupService.applyRetention).toHaveBeenCalledWith(TENANT_A.id, expect.anything());
    });

    it('listTenantBackups passes tenantId from req.tenantId', async () => {
      const req = mockRequest({ tenantId: TENANT_A.id, user: tenantAUser });
      const res = mockResponse();

      await BackupController.listTenantBackups(req, res);

      expect(spies.backupService.listBackups).toHaveBeenCalledWith(TENANT_A.id);
    });
  });

  describe('TenantFeaturesController', () => {
    it('getSubscription passes tenantId from req.tenantId, not from body', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        body: { tenantId: TENANT_B.id },
      });
      const res = mockResponse();

      await TenantFeaturesController.getSubscription(req, res);

      expect(spies.tenantRepo.findById).toHaveBeenCalledWith(TENANT_A.id);
    });
  });

  describe('Critical invariant: tenantId never comes from body/query/params', () => {
    it('getAllVisitors ignores tenantId in query', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        query: { page: '1', limit: '50', tenantId: String(TENANT_B.id) },
      });
      const res = mockResponse();

      await VisitorController.getAllVisitors(req, res);

      const callArg = spies.useCaseSpies.getAllVisitors.execute.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
      expect(callArg).not.toBe(TENANT_B.id);
    });

    it('checkIn ignores tenantId in body', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        body: { tenantId: TENANT_B.id, visitorCedula: 'V-123', personToVisit: 'John' },
      });
      const res = mockResponse();

      await VisitController.checkIn(req, res);

      const callArg = spies.useCaseSpies.checkInVisitor.execute.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
      expect(callArg).not.toBe(TENANT_B.id);
    });

    it('getLogs ignores tenantId in query', async () => {
      const req = mockRequest({
        tenantId: TENANT_A.id,
        user: tenantAUser,
        query: { tenantId: String(TENANT_B.id), page: '1', limit: '50' },
      });
      const res = mockResponse();

      await AuditController.getLogs(req, res);

      const callArg = spies.auditLogRepo.findAll.mock.calls[0][0];
      expect(callArg).toBe(TENANT_A.id);
      expect(callArg).not.toBe(TENANT_B.id);
    });
  });
});
