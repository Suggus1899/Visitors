export type ArcoRequestType = 'access' | 'rectification' | 'cancellation' | 'opposition';
export type ArcoRequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

export interface ArcoRequestEntity {
  id: number;
  requestType: ArcoRequestType;
  subjectCedulaHash: string;
  subjectCedulaEncrypted: string | null;
  requestedByName: string;
  requestedByUserId: number | null;
  contactEmail: string | null;
  reason: string | null;
  requestPayload: string | null;
  status: ArcoRequestStatus;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface ArcoRequestFilters {
  status?: string;
  requestType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateArcoRequestData {
  requestType: ArcoRequestType;
  subjectCedulaHash: string;
  subjectCedulaEncrypted: string | null;
  requestedByName: string;
  requestedByUserId: number;
  contactEmail: string | null;
  reason: string | null;
  requestPayload: string | null;
  status: ArcoRequestStatus;
}

export interface UpdateArcoRequestData {
  status: ArcoRequestStatus;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
}

export interface IArcoRequestRepository {
  create(data: CreateArcoRequestData): Promise<ArcoRequestEntity>;
  findById(id: number): Promise<ArcoRequestEntity | null>;
  findAll(filters?: ArcoRequestFilters): Promise<{ rows: ArcoRequestEntity[]; count: number }>;
  update(id: number, data: Partial<UpdateArcoRequestData>): Promise<ArcoRequestEntity | null>;
}
