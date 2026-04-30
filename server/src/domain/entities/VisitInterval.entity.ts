/**
 * Domain Entity: VisitInterval
 * Represents a single temporary exit/reentry event for an ongoing visit
 */
export interface VisitIntervalEntity {
  id?: number;
  visitId: number;
  exitTime: Date;
  reentryTime?: Date;
  notes?: string;
}

export class VisitInterval {
  constructor(
    public readonly visitId: number,
    public readonly exitTime: Date,
    public readonly id?: number,
    public readonly reentryTime?: Date,
    public readonly notes?: string
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.visitId || this.visitId <= 0) {
      throw new Error('Valid visit ID is required');
    }
    if (!this.exitTime) {
      throw new Error('Exit time is required');
    }
    if (this.reentryTime && this.reentryTime <= this.exitTime) {
      throw new Error('Reentry time must be after exit time');
    }
  }

  isOpen(): boolean {
    return !this.reentryTime;
  }

  getDurationMinutes(): number | null {
    if (!this.reentryTime) return null;
    return Math.floor((this.reentryTime.getTime() - this.exitTime.getTime()) / (1000 * 60));
  }

  static fromObject(obj: VisitIntervalEntity): VisitInterval {
    return new VisitInterval(
      obj.visitId,
      obj.exitTime,
      obj.id,
      obj.reentryTime,
      obj.notes
    );
  }

  toObject(): VisitIntervalEntity {
    return {
      id: this.id,
      visitId: this.visitId,
      exitTime: this.exitTime,
      reentryTime: this.reentryTime,
      notes: this.notes
    };
  }
}
