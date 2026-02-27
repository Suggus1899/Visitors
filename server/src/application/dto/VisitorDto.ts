/**
 * Data Transfer Object for Visitor
 */
export interface VisitorDto {
  cedula: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle?: string;
  photoUrl?: string;
  email?: string;
  phone?: string;
}
