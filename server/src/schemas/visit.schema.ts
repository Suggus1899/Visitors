import { z } from 'zod';

export const checkInSchema = z.object({
  visitorCedula: z.string().min(1, 'Visitor cedula is required').max(20, 'Cedula too long'),
  purpose: z.string().min(1, 'Purpose is required').max(500, 'Purpose too long'),
  personToVisit: z.string().min(1, 'Person to visit is required').max(200, 'Name too long'),
  notes: z.string().max(1000, 'Notes too long').optional(),
  visitorData: z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    company: z.string().max(200).optional(),
    email: z.string().email('Invalid email').max(200).optional(),
    phone: z.string().max(20).optional(),
    photo: z.string().optional(),
    photoBase64: z.string().optional(),
    jobTitle: z.string().max(200).optional(),
  }).optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
