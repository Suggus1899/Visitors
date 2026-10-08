export interface IntermittentLogEntity {
  id: number;
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
  create(input: CreateIntermittentLogInput): Promise<IntermittentLogEntity>;
  findByVisitId(visitId: number): Promise<IntermittentLogEntity[]>;
  findOpenByVisitId(visitId: number): Promise<IntermittentLogEntity | null>;
  closeLog(id: number, input: CloseLogInput): Promise<IntermittentLogEntity>;
  findAll(): Promise<IntermittentLogEntity[]>;
}
