import { IArcoRequestRepository, ArcoRequestFilters } from '../../../domain/repositories/IArcoRequestRepository';
import { ArcoRequestListResponseDto } from '../../dto/ArcoRequestDto';

export class ListArcoRequestsUseCase {
  constructor(private arcoRepository: IArcoRequestRepository) { }

  async execute(tenantId: number, filters: ArcoRequestFilters): Promise<{ requests: ArcoRequestListResponseDto[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const { rows, count } = await this.arcoRepository.findAll(tenantId, filters);

    return {
      requests: rows.map((r) => ({
        id: r.id,
        requestType: r.requestType,
        requestedByName: r.requestedByName,
        contactEmail: r.contactEmail,
        status: r.status,
        reason: r.reason,
        resolutionNotes: r.resolutionNotes,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        requestPayload: r.requestPayload ? this.parsePayload(r.requestPayload) : null
      })),
      pagination: {
        page: Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1,
        limit: filters.limit || 20,
        total: count,
        pages: Math.ceil(count / (filters.limit || 20))
      }
    };
  }

  private parsePayload(payload: string): Record<string, unknown> | null {
    try { return JSON.parse(payload); } catch { return null; }
  }
}
