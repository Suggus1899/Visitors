import { z } from 'zod';

export const checkInSchema = z.object({
  visitorCedula: z.string().min(1, 'Visitor cedula is required').max(20, 'Cedula too long'),
  consent: z.object({
    accepted: z.literal(true),
    policyVersion: z.string().min(1, 'Policy version is required').max(20, 'Policy version too long'),
    acceptedAt: z.string().datetime('Invalid consent timestamp')
  }),
  purpose: z.string().min(1, 'Purpose is required').max(500, 'Purpose too long'),
  personToVisit: z.string().min(1, 'Person to visit is required').max(200, 'Name too long'),
  status: z.enum(['waiting', 'active']).optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),

  // --- Mandatory registration fields (Step 4) ---
  targetDepartment: z.string().min(1, 'Area/Department to visit is required').max(200, 'Too long'),
  hostPerson: z.string().min(1, 'Person to visit is required').max(200, 'Name too long'),

  // --- ISO 8601 Timestamp lifecycle (optional at registration; set by guards later) ---
  arrivalTime: z.string().datetime({ message: 'Invalid arrival_time timestamp' }).optional(),
  entryTime: z.string().datetime({ message: 'Invalid entry_time timestamp' }).optional(),
  exitTime: z.string().datetime({ message: 'Invalid exit_time timestamp' }).optional(),

  // New Pase de Entrada fields
  companionName: z.string().max(200, 'Name too long').optional(),
  companionCedula: z.string().max(20, 'Cedula too long').optional(),
  vehicleBrand: z.string().max(100, 'Brand too long').optional(),
  vehicleModel: z.string().max(100, 'Model too long').optional(),
  vehiclePlate: z.string().max(50, 'Plate too long').optional(),
  area: z.string().max(200, 'Area too long').optional(),
  action: z.enum(['Carga', 'Descarga', 'Ninguna']).optional(),
  department: z.string().max(200, 'Department too long').optional(),
  visitorData: z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    company: z.string().max(200).optional(),
    email: z.string().email('Invalid email').max(200).optional(),
    phone: z.string().max(20).optional(),
    photo: z.string().optional(),
    photoBase64: z.string().optional(),
    idPhotoBase64: z.string().optional(),
    jobTitle: z.string().max(200).optional(),
  }).optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
