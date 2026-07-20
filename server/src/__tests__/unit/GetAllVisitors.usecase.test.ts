/**
 * Unit tests for GetAllVisitorsUseCase.
 * Verifies that tenantId is forwarded to the repository for filtering.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetAllVisitorsUseCase } from '../../application/usecases/GetAllVisitors.usecase';
import { Visitor } from '../../domain/entities/Visitor.entity';
import type { IVisitorRepository, VisitorFilters } from '../../domain/repositories/IVisitorRepository';

describe('GetAllVisitorsUseCase', () => {
  let useCase: GetAllVisitorsUseCase;
  let visitorRepo: IVisitorRepository;

  beforeEach(() => {
    vi.clearAllMocks();

    const sampleVisitor = new Visitor(1, 'V-12345678', 'Carlos', 'Gomez', 'ACME');

    visitorRepo = {
      findByCedula: vi.fn(),
      findById: vi.fn(),
      findByCedulaWithHistory: vi.fn(),
      findAll: vi.fn().mockResolvedValue([sampleVisitor]),
      search: vi.fn(),
      findDistinctCompanies: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateById: vi.fn(),
      delete: vi.fn(),
      deleteById: vi.fn(),
      exists: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
      getPhotoBlob: vi.fn(),
      getIdPhotoBlob: vi.fn(),
    } as unknown as IVisitorRepository;

    useCase = new GetAllVisitorsUseCase(visitorRepo);
  });

  it('passes tenantId to findAll', async () => {
    await useCase.execute(1);

    expect(visitorRepo.findAll).toHaveBeenCalledWith(1, undefined);
  });

  it('passes tenantId to count', async () => {
    await useCase.execute(1);

    expect(visitorRepo.count).toHaveBeenCalledWith(1, undefined);
  });

  it('forwards filters alongside tenantId', async () => {
    const filters: VisitorFilters = { company: 'ACME', page: 2, limit: 10 };

    await useCase.execute(5, filters);

    expect(visitorRepo.findAll).toHaveBeenCalledWith(5, filters);
    expect(visitorRepo.count).toHaveBeenCalledWith(5, filters);
  });

  it('uses different tenantId for different tenants (isolation)', async () => {
    await useCase.execute(999);

    expect(visitorRepo.findAll).toHaveBeenCalledWith(999, undefined);
    expect(visitorRepo.count).toHaveBeenCalledWith(999, undefined);
  });

  it('returns visitors array and total count', async () => {
    const result = await useCase.execute(1);

    expect(result.visitors).toBeInstanceOf(Array);
    expect(result.visitors).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns empty array when no visitors exist', async () => {
    (visitorRepo.findAll as any).mockResolvedValue([]);
    (visitorRepo.count as any).mockResolvedValue(0);

    const result = await useCase.execute(1);

    expect(result.visitors).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
