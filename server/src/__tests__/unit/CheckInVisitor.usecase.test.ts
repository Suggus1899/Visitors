/**
 * Unit tests for CheckInVisitorUseCase.
 * Verifies check-in flow with tenantId isolation, consent enforcement, and
 * blocked visitor rejection.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckInVisitorUseCase } from '../../visits/application/usecases/CheckInVisitor.usecase';
import { Visitor } from '../../visits/domain/entities/Visitor.entity';
import { Visit, VisitStatus } from '../../visits/domain/entities/Visit.entity';
import type { IVisitorRepository } from '../../visits/domain/repositories/IVisitorRepository';
import type { IVisitRepository } from '../../visits/domain/repositories/IVisitRepository';

describe('CheckInVisitorUseCase', () => {
  let useCase: CheckInVisitorUseCase;
  let visitorRepo: IVisitorRepository;
  let visitRepo: IVisitRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    visitorRepo = {
      findByCedula: vi.fn(),
      findById: vi.fn(),
      findByCedulaWithHistory: vi.fn(),
      findAll: vi.fn(),
      search: vi.fn(),
      findDistinctCompanies: vi.fn(),
      create: vi.fn().mockImplementation((_tid, v) => {
        // Return a proper Visitor instance so isBlacklisted() works
        return Promise.resolve(new Visitor(1, v.cedula, v.firstName, v.lastName, v.company, v.jobTitle, v.photoUrl, v.idPhotoUrl, v.email, v.phone, v.photoBlob, v.idPhotoBlob, v.isBlocked ?? false, v.observations, v.createdAt));
      }),
      update: vi.fn(),
      updateById: vi.fn(),
      delete: vi.fn(),
      deleteById: vi.fn(),
      exists: vi.fn(),
      count: vi.fn(),
      getPhotoBlob: vi.fn(),
      getIdPhotoBlob: vi.fn(),
    } as unknown as IVisitorRepository;

    visitRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findActive: vi.fn(),
      findIntermittent: vi.fn(),
      findByVisitor: vi.fn().mockResolvedValue([]), // no existing visits by default
      findByDateRange: vi.fn(),
      create: vi.fn().mockImplementation((_tid, v) => {
        // Return a proper Visit instance so mapper methods work
        return Promise.resolve(new Visit(v.visitorCedula, v.checkInTime, v.purpose, v.personToVisit, v.status, 100, v.checkOutTime, v.notes, v.visitorName, v.visitorCompany, v.companionName, v.companionCedula, v.vehicleBrand, v.vehicleModel, v.vehiclePlate, v.area, v.action, v.department, v.arrivalTime, v.entryTime));
      }),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      deleteOlderThan: vi.fn(),
      countByStatus: vi.fn(),
      countByDateRange: vi.fn(),
      findMissedCheckouts: vi.fn(),
      findForReport: vi.fn(),
    } as unknown as IVisitRepository;

    useCase = new CheckInVisitorUseCase(visitorRepo, visitRepo);
  });

  const TENANT_A = 1;
  const TENANT_B = 2;

  const validDto = {
    visitorCedula: 'V-12345678',
    consent: { accepted: true, policyVersion: '1.0', acceptedAt: '2026-01-01T00:00:00.000Z' },
    purpose: 'Reunion',
    personToVisit: 'Juan Perez',
    visitorData: {
      firstName: 'Carlos',
      lastName: 'Gomez',
      company: 'ACME',
    },
  };

  it('rejects check-in without consent', async () => {
    await expect(
      useCase.execute(TENANT_A, { ...validDto, consent: { accepted: false, policyVersion: '1.0', acceptedAt: '2026-01-01T00:00:00.000Z' } }),
    ).rejects.toThrow('Consent is required');
  });

  it('creates a new visitor when none exists and visitorData is provided', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await useCase.execute(TENANT_A, validDto);

    expect(visitorRepo.create).toHaveBeenCalledWith(TENANT_A, expect.any(Visitor), undefined, undefined);
  });

  it('passes the correct tenantId to findByCedula (isolation)', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await useCase.execute(TENANT_B, validDto);

    expect(visitorRepo.findByCedula).toHaveBeenCalledWith(TENANT_B, 'V-12345678');
  });

  it('passes the correct tenantId to visitRepository.create', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await useCase.execute(TENANT_B, validDto);

    expect(visitRepo.create).toHaveBeenCalledWith(TENANT_B, expect.any(Visit));
  });

  it('passes the correct tenantId to findByVisitor when checking for open visits', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await useCase.execute(TENANT_A, validDto);

    expect(visitRepo.findByVisitor).toHaveBeenCalledWith(TENANT_A, 'V-12345678');
  });

  it('rejects check-in when visitor is blocked', async () => {
    const blockedVisitor = new Visitor(1, 'V-12345678', 'Carlos', 'Gomez', 'ACME', undefined, undefined, undefined, undefined, undefined, undefined, undefined, true, 'Banned');
    (visitorRepo.findByCedula as any).mockResolvedValue(blockedVisitor);

    await expect(useCase.execute(TENANT_A, validDto)).rejects.toThrow(/blocked/i);
  });

  it('rejects check-in when visitor already has an active visit', async () => {
    const visitor = new Visitor(1, 'V-12345678', 'Carlos', 'Gomez', 'ACME');
    (visitorRepo.findByCedula as any).mockResolvedValue(visitor);
    const existingVisit = new Visit('V-12345678', new Date(), 'Reunion', 'Juan', VisitStatus.ACTIVE, 50);
    (visitRepo.findByVisitor as any).mockResolvedValue([existingVisit]);

    await expect(useCase.execute(TENANT_A, validDto)).rejects.toThrow(/visita en estado ACTIVA/i);
  });

  it('rejects check-in when visitor has a waiting visit', async () => {
    const visitor = new Visitor(1, 'V-12345678', 'Carlos', 'Gomez', 'ACME');
    (visitorRepo.findByCedula as any).mockResolvedValue(visitor);
    const waitingVisit = new Visit('V-12345678', new Date(), 'Reunion', 'Juan', VisitStatus.WAITING, 51);
    (visitRepo.findByVisitor as any).mockResolvedValue([waitingVisit]);

    await expect(useCase.execute(TENANT_A, validDto)).rejects.toThrow(/EN ESPERA/i);
  });

  it('creates visit with active status by default', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    const result = await useCase.execute(TENANT_A, validDto);

    expect(visitRepo.create).toHaveBeenCalledOnce();
    const createdVisit = (visitRepo.create as any).mock.calls[0][1];
    expect(createdVisit.status).toBe(VisitStatus.ACTIVE);
  });

  it('creates visit with waiting status when dto.status is waiting', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await useCase.execute(TENANT_A, { ...validDto, status: VisitStatus.WAITING as any });

    const createdVisit = (visitRepo.create as any).mock.calls[0][1];
    expect(createdVisit.status).toBe(VisitStatus.WAITING);
  });

  it('appends consent audit note to notes', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await useCase.execute(TENANT_A, { ...validDto, notes: 'VIP visitor' });

    const createdVisit = (visitRepo.create as any).mock.calls[0][1];
    expect(createdVisit.notes).toContain('consent:1.0');
    expect(createdVisit.notes).toContain('VIP visitor');
  });

  it('throws when visitor not found and no visitorData provided', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await expect(
      useCase.execute(TENANT_A, {
        visitorCedula: 'V-99999999',
        consent: { accepted: true, policyVersion: '1.0', acceptedAt: '2026-01-01T00:00:00.000Z' },
        purpose: 'Reunion',
        personToVisit: 'Juan',
      }),
    ).rejects.toThrow('Visitor not found and no visitor data provided');
  });
});
