/**
 * Domain Entity: Visitor
 * Pure business object without infrastructure dependencies
 */
export interface VisitorEntity {
  id?: number;
  cedula: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle?: string;
  photoUrl?: string;
  idPhotoUrl?: string;
  photoBlob?: Buffer;
  idPhotoBlob?: Buffer;
  email?: string;
  phone?: string;
  isBlocked?: boolean;
  observations?: string;
  createdAt?: Date;
}

/**
 * Visitor domain class with business logic
 */
export class Visitor {
  constructor(
    public readonly id: number | undefined,
    public readonly cedula: string,
    public firstName: string,
    public lastName: string,
    public company: string,
    public jobTitle?: string,
    public photoUrl?: string,
    public idPhotoUrl?: string,
    public email?: string,
    public phone?: string,
    public photoBlob?: Buffer,
    public idPhotoBlob?: Buffer,
    public isBlocked: boolean = false,
    public observations?: string,
    public createdAt: Date = new Date(),
  ) {
    this.validate();
  }

  /**
   * Business validation rules
   */
  private validate(): void {
    if (!this.cedula || this.cedula.trim().length === 0) {
      throw new Error("Cedula is required");
    }

    // Normalize cedula format (remove spaces, uppercase)
    const normalizedCedula = this.cedula
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");
    if (!/^[VEJPGvejpg]-?\d{6,9}$/.test(normalizedCedula)) {
      throw new Error(
        "Invalid cedula format. Expected format: V-12345678 or V12345678",
      );
    }

    if (!this.firstName || this.firstName.trim().length === 0) {
      throw new Error("First name is required");
    }

    if (!this.lastName || this.lastName.trim().length === 0) {
      throw new Error("Last name is required");
    }

    if (!this.company || this.company.trim().length === 0) {
      throw new Error("Company is required");
    }

    // Email is optional, validate format if provided
    if (this.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      throw new Error("Invalid email format");
    }
  }

  /**
   * Get normalized cedula (V-12345678 format)
   */
  get normalizedCedula(): string {
    const clean = this.cedula
      .trim()
      .toUpperCase()
      .replace(/\s/g, "")
      .replace(/^-/, "");
    if (clean.match(/^[VEJPG]\d/)) {
      return clean[0] + "-" + clean.substring(1);
    }
    return clean;
  }

  /**
   * Check if visitor is blocked
   */
  isBlacklisted(): boolean {
    return this.isBlocked === true;
  }

  /**
   * Get full name
   */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /**
   * Check if visitor has complete contact info
   */
  hasCompleteContact(): boolean {
    return !!(this.email && this.phone);
  }

  /**
   * Factory method to create from plain object
   */
  static fromObject(obj: VisitorEntity): Visitor {
    return new Visitor(
      obj.id,
      obj.cedula,
      obj.firstName,
      obj.lastName,
      obj.company,
      obj.jobTitle,
      obj.photoUrl,
      obj.idPhotoUrl,
      obj.email,
      obj.phone,
      obj.photoBlob,
      obj.idPhotoBlob,
      obj.isBlocked,
      obj.observations,
      obj.createdAt,
    );
  }

  /**
   * Convert to plain object
   */
  toObject(): VisitorEntity {
    return {
      id: this.id,
      cedula: this.cedula,
      firstName: this.firstName,
      lastName: this.lastName,
      company: this.company,
      jobTitle: this.jobTitle,
      photoUrl: this.photoUrl,
      idPhotoUrl: this.idPhotoUrl,
      email: this.email,
      phone: this.phone,
      isBlocked: this.isBlocked,
      observations: this.observations,
      createdAt: this.createdAt,
    };
  }

  hasPhoto(): boolean {
    return !!(this.photoBlob || this.photoUrl);
  }

  hasIdPhoto(): boolean {
    return !!(this.idPhotoBlob || this.idPhotoUrl);
  }
}
