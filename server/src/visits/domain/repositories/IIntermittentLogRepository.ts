export interface IntermittentLogEntity {
  id: number;
  tenantId: number;
  visitId: number;
  checkOut: Date;
  reEntry: Date | null;
  notes: string | null;
  registeredBy: string | null;
}

export interface CreateIntermittentLogInput {
  visitId: number;
  checkOut: Date;
  notes?: string | null;
  registeredBy?: string | null;
}

export interface CloseLogInput {
  reEntry: Date;
  registeredBy?: string | null;
}

export interface IIntermittentLogRepository {
  create(tenantId: number, input: CreateIntermittentLogInput): Promise<IntermittentLogEntity>;
  findByVisitId(tenantId: number, visitId: number): Promise<IntermittentLogEntity[]>;
  findOpenByVisitId(tenantId: number, visitId: number): Promise<IntermittentLogEntity | null>;
  closeLog(tenantId: number, id: number, input: CloseLogInput): Promise<IntermittentLogEntity>;
  findAll(tenantId: number): Promise<IntermittentLogEntity[]>;
}
