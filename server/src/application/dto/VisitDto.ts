import { VisitStatus } from '../../domain/entities/Visit.entity';

/**
 * DTO for creating a new visit (check-in)
 */
export interface CheckInDto {
  visitorCedula: string;
  visitorData?: {
    firstName: string;
    lastName: string;
    company: string;
    jobTitle?: string;
    photoBase64?: string;
    email?: string;
    phone?: string;
  };
  purpose: string;
  personToVisit: string;
  notes?: string;
}

/**
 * DTO for active visit list item
 */
export interface ActiveVisitDto {
  id: number;
  visitorCedula: string;
  visitorName: string;
  company: string;
  checkInTime: string;
  purpose: string;
  personToVisit: string;
  durationMinutes: number;
  photoUrl?: string;
}

/**
 * DTO for checking out a visit
 */
export interface CheckOutDto {
  visitId: number;
  notes?: string;
}

/**
 * DTO for visit response
 */
export interface VisitResponseDto {
  id: number;
  visitorCedula: string;
  visitorName?: string;
  checkInTime: string; // ISO string
  checkOutTime?: string; // ISO string
  purpose: string;
  personToVisit: string;
  status: VisitStatus;
  durationMinutes?: number;
  notes?: string;
}
