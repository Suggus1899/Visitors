import { IVisitRepository, VisitFilters } from '../../../domain/repositories/IVisitRepository';
import { Visit, VisitEntity, VisitStatus } from '../../../domain/entities/Visit.entity';
import VisitModel from '../../../models/Visit';
import VisitorModel from '../../../models/Visitor';
import IntermittentLogModel from '../../../models/IntermittentLog';
import { Op } from 'sequelize';
import Encryption from '../../../utils/Encryption';

/**
 * Sequelize implementation of IVisitRepository
 * Adapts between domain entities and Sequelize models
 */
export class SequelizeVisitRepository implements IVisitRepository {
  async findById(id: number): Promise<Visit | null> {
    const model = await VisitModel.findByPk(id, {
        include: [{ model: VisitorModel }]
    });
    return model ? this.toDomain(model) : null;
  }

  async findAll(filters?: VisitFilters): Promise<Visit[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.visitorCedula) {
      // Buscar el visitante por cédula hasheada para obtener su ID
      const hashedCedula = Encryption.hash(filters.visitorCedula);
      const visitor = await VisitorModel.findOne({
        where: { cedula: hashedCedula }
      });
      
      if (visitor) {
        // Filtrar visitas por visitor_id (FK real)
        where.visitor_id = visitor.id;
      } else {
        // Si no se encuentra el visitante, retornar array vacío
        return [];
      }
    }

    if (filters?.personToVisit) {
      where.person_to_visit = { [Op.like]: `%${filters.personToVisit}%` };
    }

    if (filters?.search) {
      const search = filters.search.trim();
      if (search.length > 0) {
        const orConditions: any[] = [
          { person_to_visit: { [Op.like]: `%${search}%` } },
          { purpose: { [Op.like]: `%${search}%` } },
          { notes: { [Op.like]: `%${search}%` } }
        ];

        // Nota: La búsqueda por cédula numérica se maneja a través de visitorCedula filter
        // ya que ahora usamos visitor_id como FK en lugar de visitor_cedula

        where[Op.and] = [...(where[Op.and] || []), { [Op.or]: orConditions }];
      }
    }

    if (filters?.startDate && filters?.endDate) {
      where.check_in_time = {
        [Op.between]: [filters.startDate, filters.endDate]
      };
    } else if (filters?.startDate) {
      where.check_in_time = { [Op.gte]: filters.startDate };
    } else if (filters?.endDate) {
      where.check_in_time = { [Op.lte]: filters.endDate };
    }

    const limit = filters?.limit || 50;
    const offset = filters?.page ? (filters.page - 1) * limit : 0;

    const models = await VisitModel.findAll({
      where,
      limit,
      offset,
      order: [['check_in_time', 'DESC']],
      include: [{ model: VisitorModel }]
    });

    return models.map(m => this.toDomain(m));
  }

  async findActive(): Promise<Visit[]> {
    const models = await VisitModel.findAll({
      where: { status: VisitStatus.ACTIVE },
      order: [['check_in_time', 'DESC']],
      include: [
        { model: VisitorModel },
        { model: IntermittentLogModel, as: 'intermittent_logs' }
      ]
    });

    return models.map(m => this.toDomain(m));
  }

  async findIntermittent(): Promise<Visit[]> {
    const models = await VisitModel.findAll({
      where: { status: VisitStatus.INTERMITTENT },
      order: [['check_in_time', 'DESC']],
      include: [
        { model: VisitorModel },
        { model: IntermittentLogModel, as: 'intermittent_logs' }
      ]
    });

    return models.map(m => this.toDomain(m));
  }

  async findByVisitor(visitorCedula: string): Promise<Visit[]> {
    const hashedCedula = Encryption.hash(visitorCedula);
    
    // Find visitor to get id
    const visitor = await VisitorModel.findOne({
      where: { cedula: hashedCedula }
    });
    
    if (!visitor) {
      return [];  // No visitor found, return empty array
    }
    
    const models = await VisitModel.findAll({
      where: { visitor_id: visitor.id },
      order: [['check_in_time', 'DESC']],
      include: [{ model: VisitorModel }]
    });

    return models.map(m => this.toDomain(m));
  }

  async findByDateRange(startDate: Date, endDate: Date): Promise<Visit[]> {
    const models = await VisitModel.findAll({
      where: {
        check_in_time: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['check_in_time', 'DESC']],
      include: [{ model: VisitorModel }]
    });

    return models.map(m => this.toDomain(m));
  }

  async create(visit: Visit): Promise<Visit> {
    const hashedCedula = Encryption.hash(visit.visitorCedula);
    
    // Find visitor by cedula to get the id (foreign key)
    const visitor = await VisitorModel.findOne({
      where: { cedula: hashedCedula }
    });
    
    if (!visitor) {
      throw new Error('Visitor not found');
    }
    
    const model = await VisitModel.create({
      visitor_id: visitor.id,  // Foreign key
      visitor_cedula: hashedCedula,  // Data field
      check_in_time: visit.checkInTime,
      check_out_time: visit.checkOutTime || null,
      purpose: visit.purpose,
      person_to_visit: visit.personToVisit,
      status: visit.status,
      notes: visit.notes || null,
      companion_name: visit.companionName || null,
      companion_cedula: visit.companionCedula || null,
      vehicle_brand: visit.vehicleBrand || null,
      vehicle_model: visit.vehicleModel || null,
      vehicle_plate: visit.vehiclePlate || null,
      area: visit.area || null,
      action: visit.action || 'Ninguna',
      department: visit.department || null,
    });
    
    // Reload to get visitor details (name, etc) for the returned entity
    await model.reload({ include: [VisitorModel] });

    return this.toDomain(model);
  }

  async update(id: number, data: Partial<VisitEntity>): Promise<Visit> {
    const model = await VisitModel.findByPk(id);
    
    if (!model) {
      throw new Error('Visit not found');
    }

    await model.update({
      check_in_time: data.checkInTime,
      check_out_time: data.checkOutTime,
      entry_time: data.entryTime,
      exit_time: data.exitTime,
      status: data.status,
      notes: data.notes,
      companion_name: data.companionName,
      companion_cedula: data.companionCedula,
      vehicle_brand: data.vehicleBrand,
      vehicle_model: data.vehicleModel,
      vehicle_plate: data.vehiclePlate,
      area: data.area,
      action: data.action,
      department: data.department
    });
    
    // Reload to get visitor
    await model.reload({ include: [VisitorModel] });

    return this.toDomain(model);
  }

  async delete(id: number): Promise<void> {
    await VisitModel.destroy({ where: { id } });
  }

  async count(filters?: VisitFilters): Promise<number> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.visitorCedula) {
      // Buscar el visitante por cédula hasheada para obtener su ID
      const hashedCedula = Encryption.hash(filters.visitorCedula);
      const visitor = await VisitorModel.findOne({
        where: { cedula: hashedCedula }
      });
      
      if (visitor) {
        // Filtrar visitas por visitor_id (FK real)
        where.visitor_id = visitor.id;
      } else {
        // Si no se encuentra el visitante, retornar 0
        return 0;
      }
    }

    if (filters?.personToVisit) {
      where.person_to_visit = { [Op.like]: `%${filters.personToVisit}%` };
    }

    if (filters?.search) {
      const search = filters.search.trim();
      if (search.length > 0) {
        const orConditions: any[] = [
          { person_to_visit: { [Op.like]: `%${search}%` } },
          { purpose: { [Op.like]: `%${search}%` } },
          { notes: { [Op.like]: `%${search}%` } }
        ];

        // Nota: La búsqueda por cédula numérica se maneja a través de visitorCedula filter
        // ya que ahora usamos visitor_id como FK en lugar de visitor_cedula

        where[Op.and] = [...(where[Op.and] || []), { [Op.or]: orConditions }];
      }
    }

    if (filters?.startDate && filters?.endDate) {
      where.check_in_time = {
        [Op.between]: [filters.startDate, filters.endDate]
      };
    } else if (filters?.startDate) {
      where.check_in_time = { [Op.gte]: filters.startDate };
    } else if (filters?.endDate) {
      where.check_in_time = { [Op.lte]: filters.endDate };
    }

    return await VisitModel.count({ where });
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await VisitModel.destroy({
      where: {
        check_out_time: {
          [Op.lt]: date
        },
        status: VisitStatus.COMPLETED
      }
    });

    return result;
  }

  async countByStatus(status: VisitStatus): Promise<number> {
    return await VisitModel.count({
      where: { status }
    });
  }

  async countByDateRange(startDate: Date, endDate: Date): Promise<number> {
    return await VisitModel.count({
      where: {
        check_in_time: {
          [Op.between]: [startDate, endDate]
        }
      }
    });
  }

  async findMissedCheckouts(thresholdDate: Date): Promise<Visit[]> {
    const models = await VisitModel.findAll({
      where: {
        status: VisitStatus.ACTIVE,
        check_in_time: {
          [Op.lt]: thresholdDate
        },
        check_out_time: null
      },
      include: [VisitorModel],
      order: [['check_in_time', 'ASC']]
    });

    return models.map(m => this.toDomain(m));
  }

  async findForReport(startDate: Date, endDate: Date): Promise<Visit[]> {
    const models = await VisitModel.findAll({
      where: {
        check_in_time: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['check_in_time', 'ASC']],
      include: [VisitorModel] // Include visitor for name
    });

    return models.map(m => this.toDomain(m));
  }

  /**
   * Convert Sequelize model to domain entity
   */
  private toDomain(model: InstanceType<typeof VisitModel> | any): Visit {
    let visitorName = undefined;
    let visitorCompany = undefined;
    let visitorCedula = model.visitor_cedula;

    if (model.Visitor) {
        if (typeof model.Visitor.getDecrypted === 'function') {
            const decrypted = model.Visitor.getDecrypted();
            visitorName = `${decrypted.first_name || ''} ${decrypted.last_name || ''}`.trim();
            visitorCompany = decrypted.company;
            visitorCedula = decrypted.cedula;
        }
    }

    return new Visit(
      visitorCedula,
      model.check_in_time,
      model.purpose,
      model.person_to_visit,
      model.status as VisitStatus,
      model.id,
      model.check_out_time || undefined,
      model.notes || undefined,
      visitorName,
      visitorCompany,
      model.companion_name || undefined,
      model.companion_cedula || undefined,
      model.vehicle_brand || undefined,
      model.vehicle_model || undefined,
      model.vehicle_plate || undefined,
      model.area,
      model.action,
      model.department || undefined,
      model.arrival_time || undefined,
      model.entry_time || undefined,
      model.exit_time || undefined,
      model.target_department || undefined,
      model.host_person || undefined,
    );
  }
}
