import { Visitor } from '../../domain/entities/Visitor.entity';
import { VisitorDto, VisitorWithHistoryDto } from '../dto/VisitorDto';

export interface VisitorListItemDto extends VisitorDto {
  first_name: string;
  last_name: string;
}

export class VisitorMapper {
  static toVisitorDto(visitor: Visitor): VisitorDto {
    return {
      id: visitor.id,
      cedula: visitor.cedula,
      firstName: visitor.firstName,
      lastName: visitor.lastName,
      company: visitor.company,
      jobTitle: visitor.jobTitle,
      photoUrl: visitor.photoUrl,
      idPhotoUrl: visitor.idPhotoUrl,
      email: visitor.email,
      phone: visitor.phone,
      isBlocked: visitor.isBlocked,
      observations: visitor.observations,
      createdAt: visitor.createdAt,
    };
  }

  static toVisitorListDto(visitor: Visitor): VisitorListItemDto {
    return {
      ...VisitorMapper.toVisitorDto(visitor),
      first_name: visitor.firstName,
      last_name: visitor.lastName,
    };
  }

  static toVisitorWithHistoryDto(visitor: Visitor, history: any[]): VisitorWithHistoryDto {
    return {
      ...VisitorMapper.toVisitorDto(visitor),
      history: history.map((visit: any) => ({
        id: visit.id,
        purpose: visit.purpose,
        checkInTime: visit.checkInTime ?? visit.check_in_time,
        checkOutTime: visit.checkOutTime ?? visit.check_out_time,
        status: visit.status,
        targetDepartment: visit.targetDepartment ?? visit.target_department ?? visit.department,
        hostPerson: visit.hostPerson ?? visit.host_person ?? visit.person_to_visit,
        vehicleBrand: visit.vehicleBrand ?? visit.vehicle_brand,
        vehicleModel: visit.vehicleModel ?? visit.vehicle_model,
        vehiclePlate: visit.vehiclePlate ?? visit.vehicle_plate,
      })),
    };
  }
}
