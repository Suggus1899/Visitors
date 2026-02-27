/**
 * Domain Entity: Visitor
 * Pure business object without infrastructure dependencies
 */
export interface VisitorEntity {
  cedula: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle?: string;
  photoUrl?: string;
  email?: string;
  phone?: string;
}

/**
 * Visitor domain class with business logic
 */
export class Visitor {
  constructor(
    public readonly cedula: string,
    public firstName: string,
    public lastName: string,
    public company: string,
    public jobTitle?: string,
    public photoUrl?: string,
    public idPhotoUrl?: string,
    public email?: string,
    public phone?: string
  ) {
    this.validate();
  }

  /**
   * Business validation rules
   */
  private validate(): void {
    if (!this.cedula || this.cedula.trim().length === 0) {
      throw new Error('Cedula is required');
    }

    if (!this.firstName || this.firstName.trim().length === 0) {
      throw new Error('First name is required');
    }

    if (!this.lastName || this.lastName.trim().length === 0) {
      throw new Error('Last name is required');
    }

    if (!this.company || this.company.trim().length === 0) {
      throw new Error('Company is required');
    }

    // Email validation if provided
    if (this.email && !this.isValidEmail(this.email)) {
      throw new Error('Invalid email format');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
      obj.cedula,
      obj.firstName,
      obj.lastName,
      obj.company,
      obj.jobTitle,
      obj.photoUrl,
      obj.email,
      obj.phone
    );
  }

  /**
   * Convert to plain object
   */
  toObject(): VisitorEntity {
    return {
      cedula: this.cedula,
      firstName: this.firstName,
      lastName: this.lastName,
      company: this.company,
      jobTitle: this.jobTitle,
      photoUrl: this.photoUrl,
      email: this.email,
      phone: this.phone
    };
  }
}
