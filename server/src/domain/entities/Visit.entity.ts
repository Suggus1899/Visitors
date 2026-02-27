/**
 * Domain Entity: Visit
 * Pure business object without infrastructure dependencies
 */
export interface VisitEntity {
  id?: number;
  visitorCedula: string;
  checkInTime: Date;
  checkOutTime?: Date;
  purpose: string;
  personToVisit: string;
  status: VisitStatus;
  notes?: string;
  visitorName?: string;
  visitorCompany?: string;
}

export enum VisitStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed'
}

/**
 * Visit domain class with business logic
 */
export class Visit {
  constructor(
    public readonly visitorCedula: string,
    public readonly checkInTime: Date,
    public readonly purpose: string,
    public readonly personToVisit: string,
    public readonly status: VisitStatus = VisitStatus.ACTIVE,
    public readonly id?: number,
    public readonly checkOutTime?: Date,
    public readonly notes?: string,
    public readonly visitorName?: string,
    public readonly visitorCompany?: string
  ) {
    this.validate();
  }

  /**
   * Business validation rules
   */
  private validate(): void {
    if (!this.visitorCedula || this.visitorCedula.trim().length === 0) {
      throw new Error('Visitor cedula is required');
    }

    if (!this.checkInTime) {
      throw new Error('Check-in time is required');
    }

    if (!this.purpose || this.purpose.trim().length === 0) {
      throw new Error('Visit purpose is required');
    }

    if (!this.personToVisit || this.personToVisit.trim().length === 0) {
      throw new Error('Person to visit is required');
    }

    // Business rule: checkout time must be after checkin time
    if (this.checkOutTime && this.checkOutTime <= this.checkInTime) {
      throw new Error('Check-out time must be after check-in time');
    }

    // Business rule: completed visits must have checkout time
    if (this.status === VisitStatus.COMPLETED && !this.checkOutTime) {
      throw new Error('Completed visits must have a check-out time');
    }
  }

  /**
   * Check if visit is active
   */
  isActive(): boolean {
    return this.status === VisitStatus.ACTIVE && !this.checkOutTime;
  }

  /**
   * Get visit duration in minutes
   */
  getDurationMinutes(): number | null {
    if (!this.checkOutTime) return null;
    
    const diffMs = this.checkOutTime.getTime() - this.checkInTime.getTime();
    return Math.floor(diffMs / (1000 * 60));
  }

  /**
   * Create a completed visit (checkout)
   */
  checkout(checkOutTime: Date, notes?: string): Visit {
    return new Visit(
      this.visitorCedula,
      this.checkInTime,
      this.purpose,
      this.personToVisit,
      VisitStatus.COMPLETED,
      this.id,
      checkOutTime,
      notes || this.notes,
      this.visitorName,
      this.visitorCompany
    );
  }

  /**
   * Factory method to create from plain object
   */
  static fromObject(obj: VisitEntity): Visit {
    return new Visit(
      obj.visitorCedula,
      obj.checkInTime,
      obj.purpose,
      obj.personToVisit,
      obj.status,
      obj.id,
      obj.checkOutTime,
      obj.notes,
      obj.visitorName,
      obj.visitorCompany
    );
  }

  /**
   * Convert to plain object
   */
  toObject(): VisitEntity {
    return {
      id: this.id,
      visitorCedula: this.visitorCedula,
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      purpose: this.purpose,
      personToVisit: this.personToVisit,
      status: this.status,
      notes: this.notes,
      visitorName: this.visitorName,
      visitorCompany: this.visitorCompany
    };
  }
}
