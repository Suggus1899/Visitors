import { z } from 'zod';

const arcoTypeSchema = z.enum(['access', 'rectification', 'cancellation', 'opposition']);
const arcoStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'rejected']);

export const createArcoRequestSchema = z.object({
  requestType: arcoTypeSchema,
  cedula: z.string().trim().min(1, 'La cedula es requerida').max(20, 'Cedula demasiado larga'),
  requestedByName: z.string().trim().min(2, 'Nombre requerido').max(120, 'Nombre demasiado largo'),
  contactEmail: z.string().email('Email invalido').max(200, 'Email demasiado largo').optional(),
  reason: z.string().trim().max(1000, 'Motivo demasiado largo').optional(),
  requestPayload: z.record(z.string(), z.unknown()).optional()
});

export const rectifyDataSchema = z.object({
  firstName: z.string().trim().min(1, 'Nombre requerido').max(100, 'Nombre demasiado largo').optional(),
  lastName: z.string().trim().min(1, 'Apellido requerido').max(100, 'Apellido demasiado largo').optional(),
  company: z.string().trim().min(1, 'Compania requerida').max(200, 'Compania demasiado larga').optional(),
  jobTitle: z.string().trim().max(200, 'Cargo demasiado largo').optional(),
  email: z.string().email('Email invalido').max(200, 'Email demasiado largo').nullable().optional(),
  phone: z.string().trim().max(20, 'Telefono demasiado largo').nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo para rectificar',
});

export const updateArcoStatusSchema = z.object({
  status: arcoStatusSchema,
  resolutionNotes: z.string().trim().max(1000, 'Notas demasiado largas').optional()
});

export const oppositionSchema = z.object({
  reason: z.string().trim().max(1000, 'Motivo demasiado largo').optional(),
  requestedByName: z.string().trim().min(2, 'Nombre requerido').max(120, 'Nombre demasiado largo'),
  contactEmail: z.string().email('Email invalido').max(200, 'Email demasiado largo').optional(),
});

export type CreateArcoRequestInput = z.infer<typeof createArcoRequestSchema>;
export type RectifyDataInput = z.infer<typeof rectifyDataSchema>;
export type UpdateArcoStatusInput = z.infer<typeof updateArcoStatusSchema>;
export type OppositionInput = z.infer<typeof oppositionSchema>;
