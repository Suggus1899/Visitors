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

  // Timestamp lifecycle
  arrivalTime?: Date;
  entryTime?: Date;
  exitTime?: Date;

  // Relational
  targetDepartment?: string;
  hostPerson?: string;
  
  // Pase de Entrada
  companionName?: string;
  companionCedula?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  area?: string;
  action?: 'Carga' | 'Descarga' | 'Ninguna';
  department?: string;
}

export enum VisitStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  INTERMITTENT = 'intermittent',
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
    public readonly visitorCompany?: string,
    public readonly companionName?: string,
    public readonly companionCedula?: string,
    public readonly vehicleBrand?: string,
    public readonly vehicleModel?: string,
    public readonly vehiclePlate?: string,
    public readonly area?: string,
    public readonly action?: 'Carga' | 'Descarga' | 'Ninguna',
    public readonly department?: string,
    public readonly arrivalTime?: Date,
    public readonly entryTime?: Date,
    public readonly exitTime?: Date,
    public readonly targetDepartment?: string,
    public readonly hostPerson?: string
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

    // Business rule: only active visits can be checked out
    // (intermittent visits must reactivate first)
  }

  /**
   * Check if visit is currently open (active or intermittent)
   */
  isActive(): boolean {
    return (this.status === VisitStatus.ACTIVE || this.status === VisitStatus.INTERMITTENT) && !this.checkOutTime;
  }

  /**
   * Check if visit is strictly in ACTIVE state (not intermittent)
   */
  isStrictlyActive(): boolean {
    return this.status === VisitStatus.ACTIVE && !this.checkOutTime;
  }

  /**
   * Check if visit is in intermittent state
   */
  isIntermittent(): boolean {
    return this.status === VisitStatus.INTERMITTENT;
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
   * Create a completed visit (checkout) — only allowed from ACTIVE status
   */
  checkout(checkOutTime: Date, notes?: string): Visit {
    if (this.status !== VisitStatus.ACTIVE) {
      throw new Error(
        this.status === VisitStatus.INTERMITTENT
          ? 'Cannot check out an intermittent visit. Reactivate the visit first.'
          : 'Only active visits can be checked out'
      );
    }
    return this._cloneWith({
      status: VisitStatus.COMPLETED,
      checkOutTime,
      notes: notes || this.notes,
      exitTime: checkOutTime,
    });
  }

  /**
   * Transition: Active → Intermittent (temporary exit)
   */
  toIntermittent(): Visit {
    if (this.status !== VisitStatus.ACTIVE) {
      throw new Error('Solo las visitas en estado Activo pueden pasar a Intermitente.');
    }
    return this._cloneWith({ status: VisitStatus.INTERMITTENT });
  }

  /**
   * Transition: Intermittent → Active (re-entry)
   */
  reEnter(): Visit {
    if (this.status !== VisitStatus.INTERMITTENT) {
      throw new Error('Solo las visitas en estado Intermitente pueden reingresar.');
    }
    return this._cloneWith({ status: VisitStatus.ACTIVE });
  }

  /**
   * Mark visit as intermittent (visitor temporarily left) — only from ACTIVE
   */
  goIntermittent(): Visit {
    if (this.status !== VisitStatus.ACTIVE) {
      throw new Error('Only active visits can be marked as intermittent');
    }
    return new Visit(
      this.visitorCedula,
      this.checkInTime,
      this.purpose,
      this.personToVisit,
      VisitStatus.INTERMITTENT,
      this.id,
      this.checkOutTime,
      this.notes,
      this.visitorName,
      this.visitorCompany,
      this.companionName,
      this.companionCedula,
      this.vehicleBrand,
      this.vehicleModel,
      this.vehiclePlate,
      this.area,
      this.action,
      this.department
    );
  }

  /**
   * Reactivate an intermittent visit (visitor returned) — only from INTERMITTENT
   */
  reactivate(): Visit {
    if (this.status !== VisitStatus.INTERMITTENT) {
      throw new Error('Only intermittent visits can be reactivated');
    }
    return new Visit(
      this.visitorCedula,
      this.checkInTime,
      this.purpose,
      this.personToVisit,
      VisitStatus.ACTIVE,
      this.id,
      this.checkOutTime,
      this.notes,
      this.visitorName,
      this.visitorCompany,
      this.companionName,
      this.companionCedula,
      this.vehicleBrand,
      this.vehicleModel,
      this.vehiclePlate,
      this.area,
      this.action,
      this.department
    );
  }

  /**
   * Admit a waiting visit (mark as active and update check-in time)
   */
  admit(checkInTime: Date): Visit {
    if (this.status !== VisitStatus.WAITING) {
      throw new Error('Only visits in waiting status can be admitted');
    }

    return this._cloneWith({
      checkInTime,
      status: VisitStatus.ACTIVE,
      entryTime: checkInTime,
    });
  }

  /**
   * Internal helper to clone a Visit with overrides.
   * Keeps all existing fields and only replaces the ones provided.
   */
  private _cloneWith(overrides: Partial<{
    visitorCedula: string;
    checkInTime: Date;
    purpose: string;
    personToVisit: string;
    status: VisitStatus;
    id: number;
    checkOutTime: Date;
    notes: string;
    visitorName: string;
    visitorCompany: string;
    companionName: string;
    companionCedula: string;
    vehicleBrand: string;
    vehicleModel: string;
    vehiclePlate: string;
    area: string;
    action: 'Carga' | 'Descarga' | 'Ninguna';
    department: string;
    arrivalTime: Date;
    entryTime: Date;
    exitTime: Date;
    targetDepartment: string;
    hostPerson: string;
  }>): Visit {
    return new Visit(
      overrides.visitorCedula ?? this.visitorCedula,
      overrides.checkInTime ?? this.checkInTime,
      overrides.purpose ?? this.purpose,
      overrides.personToVisit ?? this.personToVisit,
      overrides.status ?? this.status,
      overrides.id ?? this.id,
      overrides.checkOutTime ?? this.checkOutTime,
      overrides.notes ?? this.notes,
      overrides.visitorName ?? this.visitorName,
      overrides.visitorCompany ?? this.visitorCompany,
      overrides.companionName ?? this.companionName,
      overrides.companionCedula ?? this.companionCedula,
      overrides.vehicleBrand ?? this.vehicleBrand,
      overrides.vehicleModel ?? this.vehicleModel,
      overrides.vehiclePlate ?? this.vehiclePlate,
      overrides.area ?? this.area,
      overrides.action ?? this.action,
      overrides.department ?? this.department,
      overrides.arrivalTime ?? this.arrivalTime,
      overrides.entryTime ?? this.entryTime,
      overrides.exitTime ?? this.exitTime,
      overrides.targetDepartment ?? this.targetDepartment,
      overrides.hostPerson ?? this.hostPerson,
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
      obj.visitorCompany,
      obj.companionName,
      obj.companionCedula,
      obj.vehicleBrand,
      obj.vehicleModel,
      obj.vehiclePlate,
      obj.area,
      obj.action,
      obj.department,
      obj.arrivalTime,
      obj.entryTime,
      obj.exitTime,
      obj.targetDepartment,
      obj.hostPerson,
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
      visitorCompany: this.visitorCompany,
      arrivalTime: this.arrivalTime,
      entryTime: this.entryTime,
      exitTime: this.exitTime,
      targetDepartment: this.targetDepartment,
      hostPerson: this.hostPerson,
      companionName: this.companionName,
      companionCedula: this.companionCedula,
      vehicleBrand: this.vehicleBrand,
      vehicleModel: this.vehicleModel,
      vehiclePlate: this.vehiclePlate,
      area: this.area,
      action: this.action,
      department: this.department,
    };
  }
}
