import { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import { IVisitorEditHistoryRepository } from '../../domain/repositories/IVisitorEditHistoryRepository';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { VisitorDto, VisitorInputDto } from '../dto/VisitorDto';
import { VisitorMapper } from '../mappers/VisitorMapper';

/**
 * Edit context for tracking who made changes and within which visit.
 */
export interface EditContext {
  visitId: number;
  editedBy: number;
  editedByUsername: string;
}

/**
 * Use Case: Update Visitor
 * Used to edit visitor data and manage blacklist status.
 * Tracks field-level changes in VisitorEditHistory when an EditContext is provided.
 */
export class UpdateVisitorUseCase {
  constructor(
    private visitorRepository: IVisitorRepository,
    private editHistoryRepository?: IVisitorEditHistoryRepository
  ) {}

  async execute(cedula: string, data: VisitorInputDto, editContext?: EditContext): Promise<VisitorDto> {
    // Check if visitor exists
    const existingVisitor = await this.visitorRepository.findByCedula(cedula);

    if (!existingVisitor) {
      throw new Error('Visitor not found');
    }

    // Track field-level changes before updating
    const changes: { field: string; oldValue: string; newValue: string }[] = [];

    const fieldMap: Array<{ dtoKey: keyof VisitorInputDto; entityKey: string; getValue: (v: Visitor) => string }> = [
      { dtoKey: 'firstName', entityKey: 'first_name', getValue: v => v.firstName || '' },
      { dtoKey: 'lastName', entityKey: 'last_name', getValue: v => v.lastName || '' },
      { dtoKey: 'company', entityKey: 'company', getValue: v => v.company || '' },
      { dtoKey: 'jobTitle', entityKey: 'job_title', getValue: v => v.jobTitle || '' },
      { dtoKey: 'email', entityKey: 'email', getValue: v => v.email || '' },
      { dtoKey: 'phone', entityKey: 'phone', getValue: v => v.phone || '' },
      { dtoKey: 'observations', entityKey: 'observations', getValue: v => v.observations || '' },
    ];

    for (const { dtoKey, entityKey, getValue } of fieldMap) {
      const newValue = (data as any)[dtoKey];
      if (newValue !== undefined) {
        const oldValue = getValue(existingVisitor);
        if (String(newValue ?? '') !== String(oldValue ?? '')) {
          changes.push({ field: entityKey, oldValue, newValue: String(newValue ?? '') });
        }
      }
    }

    // isBlocked is a boolean
    if (data.isBlocked !== undefined && data.isBlocked !== existingVisitor.isBlocked) {
      changes.push({
        field: 'isBlocked',
        oldValue: String(existingVisitor.isBlocked ?? false),
        newValue: String(data.isBlocked),
      });
    }

    // Update visitor
    const updatedVisitor = await this.visitorRepository.update(cedula, {
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company,
      jobTitle: data.jobTitle,
      email: data.email,
      phone: data.phone,
      isBlocked: data.isBlocked,
      observations: data.observations,
      photoBlob: data.photoBlob,
      idPhotoBlob: data.idPhotoBlob,
    });

    // Log changes to edit history if context provided
    if (editContext && this.editHistoryRepository && changes.length > 0) {
      for (const change of changes) {
        await this.editHistoryRepository.create({
          visitId: editContext.visitId,
          visitorId: existingVisitor.id!,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          editedBy: editContext.editedBy,
          editedByUsername: editContext.editedByUsername,
        });
      }
    }

    return VisitorMapper.toVisitorDto(updatedVisitor);
  }
}
