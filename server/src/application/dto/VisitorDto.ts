/**
 * Data Transfer Object for Visitor
 */
export interface VisitorDto {
  id?: number;
  cedula: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle?: string;
  photoUrl?: string;
  idPhotoUrl?: string;
  email?: string;
  phone?: string;
  isBlocked?: boolean;
  observations?: string;
  createdAt?: Date;
}

/**
 * Visit history item for VisitorWithHistoryDto
 */
export interface VisitorHistoryItem {
  id: number;
  purpose: string;
  checkInTime: Date;
  checkOutTime?: Date;
  status: string;
  targetDepartment?: string;
}

/**
 * Data Transfer Object for Visitor with visit history
 */
export interface VisitorWithHistoryDto extends VisitorDto {
  history: VisitorHistoryItem[];
}

/**
 * Input for creating/updating a visitor
 */
export interface VisitorInputDto {
  cedula: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  photoBlob?: Buffer;
  idPhotoBlob?: Buffer;
  isBlocked?: boolean;
  observations?: string;
}
