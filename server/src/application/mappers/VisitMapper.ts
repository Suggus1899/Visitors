import { Visit } from '../../domain/entities/Visit.entity';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { IntermittentLogEntity } from '../../domain/repositories/IIntermittentLogRepository';
import { ActiveVisitDto, VisitResponseDto } from '../dto/VisitDto';

export interface IntermittentVisitResponseDto extends Omit<ActiveVisitDto, 'durationMinutes'> {
  status: string;
  targetDepartment?: string;
  hostPerson?: string;
  intermittentSince: string | null;
  intermittentNotes: string | null;
  totalIntermittentEvents: number;
  minutesOutside: number;
  lastExitTime: string;
  intervals: {
    id?: number;
    exitTime: string;
    reentryTime?: string | null;
    notes?: string | null;
  }[];
  intermittent_logs: {
    id: number;
    visit_id: number;
    check_out: string;
    re_entry: string | null;
    notes: string | null;
    registered_by: string | null;
  }[];
}

export class VisitMapper {
  static toVisitResponseDto(visit: Visit, visitor?: Visitor | null): VisitResponseDto {
    const visitorName = visitor?.fullName || visit.visitorName;
    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName,
      visitorCompany: visitor?.company || visit.visitorCompany,
      firstName: visitor?.firstName || visit.visitorName?.split(' ')[0],
      lastName: visitor?.lastName || visit.visitorName?.split(' ').slice(1).join(' '),
      checkInTime: visit.checkInTime.toISOString(),
      checkOutTime: visit.checkOutTime?.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      status: visit.status,
      durationMinutes: visit.getDurationMinutes() || undefined,
      notes: visit.notes,
      companionName: visit.companionName,
      companionCedula: visit.companionCedula,
      vehicleBrand: visit.vehicleBrand,
      vehicleModel: visit.vehicleModel,
      vehiclePlate: visit.vehiclePlate,
      area: visit.area,
      action: visit.action,
      department: visit.department,
      arrivalTime: visit.arrivalTime?.toISOString(),
      entryTime: visit.entryTime?.toISOString(),
      exitTime: visit.exitTime?.toISOString(),
    };
  }

  static toActiveVisitDto(visit: Visit, visitor: Visitor | null): ActiveVisitDto {
    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visitor?.fullName || 'Unknown',
      company: visitor?.company || 'Unknown',
      checkInTime: visit.checkInTime.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      durationMinutes: visit.getDurationMinutes() || 0,
      photoUrl: visitor?.photoUrl,
      entryTime: visit.entryTime?.toISOString(),
      arrivalTime: visit.arrivalTime?.toISOString(),
      companionName: visit.companionName,
      companionCedula: visit.companionCedula,
      vehicleBrand: visit.vehicleBrand,
      vehicleModel: visit.vehicleModel,
      vehiclePlate: visit.vehiclePlate,
      notes: visit.notes,
      area: visit.area,
      action: visit.action,
      department: visit.department,
    };
  }

  static toWaitingVisitDto(visit: Visit, visitor?: Visitor | null): ActiveVisitDto {
    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visit.visitorName || 'Unknown',
      company: visit.visitorCompany || 'Unknown',
      checkInTime: visit.checkInTime.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      photoUrl: visitor?.photoUrl || '',
      notes: visit.notes,
      durationMinutes: 0,
      arrivalTime: visit.arrivalTime?.toISOString(),
      companionName: visit.companionName,
      companionCedula: visit.companionCedula,
      vehicleBrand: visit.vehicleBrand,
      vehicleModel: visit.vehicleModel,
      vehiclePlate: visit.vehiclePlate,
      area: visit.area,
      action: visit.action,
      department: visit.department,
    };
  }

  static toIntermittentVisitDto(
    visit: Visit,
    visitor: Visitor | null,
    logs: IntermittentLogEntity[] = []
  ): IntermittentVisitResponseDto {
    const currentLog = logs.find((l) => !l.reEntry);
    const minutesOutside = currentLog
      ? Math.floor((Date.now() - currentLog.checkOut.getTime()) / 60000)
      : 0;

    return {
      id: visit.id!,
      visitorCedula: visit.visitorCedula,
      visitorName: visitor?.fullName || 'Desconocido',
      firstName: visitor?.firstName,
      lastName: visitor?.lastName,
      company: visitor?.company || 'Sin empresa',
      checkInTime: visit.checkInTime.toISOString(),
      purpose: visit.purpose,
      personToVisit: visit.personToVisit,
      status: visit.status,
      photoUrl: visitor?.photoUrl,
      targetDepartment: visit.targetDepartment,
      hostPerson: visit.hostPerson,
      area: visit.area,
      department: visit.department,
      intermittentSince: currentLog?.checkOut.toISOString() || null,
      intermittentNotes: currentLog?.notes || null,
      totalIntermittentEvents: logs.length,
      minutesOutside,
      lastExitTime: currentLog?.checkOut.toISOString() || visit.checkInTime.toISOString(),
      intervals: logs.map((l) => ({
        id: l.id,
        exitTime: l.checkOut.toISOString(),
        reentryTime: l.reEntry?.toISOString() || null,
        notes: l.notes,
      })),
      intermittent_logs: logs.map((l) => ({
        id: l.id,
        visit_id: l.visitId,
        check_out: l.checkOut.toISOString(),
        re_entry: l.reEntry?.toISOString() || null,
        notes: l.notes,
        registered_by: l.registeredBy,
      })),
    };
  }
}
