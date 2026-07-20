/**
 * Unit tests for UpdateVisitorUseCase.
 * Verifies update with edit context (field-level change tracking) and
 * tenantId isolation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpdateVisitorUseCase, EditContext } from '../../visits/application/usecases/UpdateVisitor.usecase';
import { Visitor } from '../../visits/domain/entities/Visitor.entity';
import type { IVisitorRepository } from '../../visits/domain/repositories/IVisitorRepository';
import type { IVisitorEditHistoryRepository } from '../../visits/domain/repositories/IVisitorEditHistoryRepository';

describe('UpdateVisitorUseCase', () => {
  let useCase: UpdateVisitorUseCase;
  let visitorRepo: IVisitorRepository;
  let editHistoryRepo: IVisitorEditHistoryRepository;
  let editHistoryCalls: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    editHistoryCalls = [];

    const existing = new Visitor(1, 'V-12345678', 'Carlos', 'Gomez', 'ACME', undefined, undefined, undefined, 'carlos@old.com', '555-0000');

    visitorRepo = {
      findByCedula: vi.fn().mockResolvedValue(existing),
      findById: vi.fn(),
      findByCedulaWithHistory: vi.fn(),
      findAll: vi.fn(),
      search: vi.fn(),
      findDistinctCompanies: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockImplementation((_tid, _ced, data) => {
        // Return a visitor reflecting the updated data
        return Promise.resolve(
          new Visitor(1, 'V-12345678', data.firstName ?? 'Carlos', data.lastName ?? 'Gomez', data.company ?? 'ACME', undefined, undefined, undefined, data.email ?? 'carlos@old.com', data.phone ?? '555-0000', undefined, undefined, data.isBlocked ?? false, data.observations),
        );
      }),
      updateById: vi.fn(),
      delete: vi.fn(),
      deleteById: vi.fn(),
      exists: vi.fn(),
      count: vi.fn(),
      getPhotoBlob: vi.fn(),
      getIdPhotoBlob: vi.fn(),
    } as unknown as IVisitorRepository;

    editHistoryRepo = {
      create: vi.fn().mockImplementation((_tid, entry) => {
        editHistoryCalls.push(entry);
        return Promise.resolve({ ...entry, id: editHistoryCalls.length, editedAt: new Date() });
      }),
      findByVisitId: vi.fn(),
      findByVisitorId: vi.fn(),
    } as unknown as IVisitorEditHistoryRepository;

    useCase = new UpdateVisitorUseCase(visitorRepo, editHistoryRepo);
  });

  const TENANT_A = 1;
  const TENANT_B = 2;

  it('passes tenantId to findByCedula (isolation)', async () => {
    await useCase.execute(TENANT_B, 'V-12345678', { firstName: 'Carlos2' });

    expect(visitorRepo.findByCedula).toHaveBeenCalledWith(TENANT_B, 'V-12345678');
  });

  it('passes tenantId to visitorRepository.update', async () => {
    await useCase.execute(TENANT_A, 'V-12345678', { firstName: 'Carlos2' });

    expect(visitorRepo.update).toHaveBeenCalledWith(TENANT_A, 'V-12345678', expect.objectContaining({ firstName: 'Carlos2' }));
  });

  it('throws when visitor not found', async () => {
    (visitorRepo.findByCedula as any).mockResolvedValue(null);

    await expect(useCase.execute(TENANT_A, 'V-99999999', { firstName: 'X' })).rejects.toThrow('Visitor not found');
  });

  it('records field-level changes in edit history when editContext is provided', async () => {
    const ctx: EditContext = { visitId: 42, editedBy: 7, editedByUsername: 'guardia1' };

    await useCase.execute(TENANT_A, 'V-12345678', {
      firstName: 'Carlos NEW',
      email: 'carlos@new.com',
    }, ctx);

    expect(editHistoryCalls.length).toBeGreaterThanOrEqual(2);
    const fields = editHistoryCalls.map((e) => e.field);
    expect(fields).toContain('first_name');
    expect(fields).toContain('email');
  });

  it('passes tenantId to editHistoryRepository.create', async () => {
    const ctx: EditContext = { visitId: 42, editedBy: 7, editedByUsername: 'guardia1' };

    await useCase.execute(TENANT_A, 'V-12345678', { firstName: 'Carlos NEW' }, ctx);

    expect(editHistoryRepo.create).toHaveBeenCalledWith(TENANT_A, expect.objectContaining({ visitId: 42 }));
  });

  it('does not record edit history when editContext is not provided', async () => {
    await useCase.execute(TENANT_A, 'V-12345678', { firstName: 'Carlos NEW' });

    expect(editHistoryRepo.create).not.toHaveBeenCalled();
  });

  it('does not record edit history when no fields changed', async () => {
    const ctx: EditContext = { visitId: 42, editedBy: 7, editedByUsername: 'guardia1' };

    // Same values as the existing visitor
    await useCase.execute(TENANT_A, 'V-12345678', {
      firstName: 'Carlos',
      lastName: 'Gomez',
    }, ctx);

    expect(editHistoryRepo.create).not.toHaveBeenCalled();
  });

  it('tracks isBlocked changes as a boolean field', async () => {
    const ctx: EditContext = { visitId: 42, editedBy: 7, editedByUsername: 'guardia1' };

    await useCase.execute(TENANT_A, 'V-12345678', { isBlocked: true }, ctx);

    const blockedChange = editHistoryCalls.find((e) => e.field === 'isBlocked');
    expect(blockedChange).toBeDefined();
    expect(blockedChange.oldValue).toBe('false');
    expect(blockedChange.newValue).toBe('true');
  });

  it('records oldValue and newValue for changed fields', async () => {
    const ctx: EditContext = { visitId: 42, editedBy: 7, editedByUsername: 'guardia1' };

    await useCase.execute(TENANT_A, 'V-12345678', { firstName: 'Carlos NEW' }, ctx);

    const change = editHistoryCalls.find((e) => e.field === 'first_name');
    expect(change.oldValue).toBe('Carlos');
    expect(change.newValue).toBe('Carlos NEW');
  });

  it('includes editedBy and editedByUsername in edit history entries', async () => {
    const ctx: EditContext = { visitId: 42, editedBy: 7, editedByUsername: 'guardia1' };

    await useCase.execute(TENANT_A, 'V-12345678', { firstName: 'Carlos NEW' }, ctx);

    expect(editHistoryCalls[0].editedBy).toBe(7);
    expect(editHistoryCalls[0].editedByUsername).toBe('guardia1');
  });
});
