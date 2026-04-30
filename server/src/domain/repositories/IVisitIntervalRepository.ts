import { VisitInterval } from '../entities/VisitInterval.entity';

export interface IVisitIntervalRepository {
  create(interval: VisitInterval): Promise<VisitInterval>;
  findByVisit(visitId: number): Promise<VisitInterval[]>;
  findOpenByVisit(visitId: number): Promise<VisitInterval | null>;
  closeInterval(intervalId: number, reentryTime: Date): Promise<VisitInterval>;
  delete(id: number): Promise<void>;
}
