import type { ArcoRequestType, ArcoRequestStatus } from '../../domain/repositories/IArcoRequestRepository';

export interface CreateArcoRequestDto {
  requestType: ArcoRequestType;
  cedula: string;
  requestedByName: string;
  contactEmail?: string;
  reason?: string;
  requestPayload?: Record<string, unknown>;
}

export interface UpdateArcoRequestStatusDto {
  status: ArcoRequestStatus;
  resolutionNotes?: string;
}

export interface RectifySubjectDataDto {
  cedula: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
}

export interface CreateOppositionRequestDto {
  cedula: string;
  requestedByName: string;
  contactEmail?: string;
  reason?: string;
}

export interface ArcoRequestResponseDto {
  id: number;
  status: ArcoRequestStatus;
  requestType: ArcoRequestType;
  createdAt: Date;
}

export interface ArcoRequestListResponseDto {
  id: number;
  requestType: ArcoRequestType;
  requestedByName: string;
  contactEmail: string | null;
  status: ArcoRequestStatus;
  reason: string | null;
  resolutionNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  requestPayload: Record<string, unknown> | null;
}

export interface AccessSubjectDataResponseDto {
  visitor: unknown;
  visits: Array<{
    id: number;
    status: string;
    purpose: string;
    personToVisit: string;
    checkInTime: Date;
    checkOutTime: Date | null;
    notes: string | null;
  }>;
}
