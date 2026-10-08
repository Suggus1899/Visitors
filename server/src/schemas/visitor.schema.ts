import { z } from 'zod';

export const updateVisitorSchema = z.object({
    editPassword: z.string().min(1).max(200),
    visitId: z.number().int().nonnegative().nullable().optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    first_name: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    company: z.string().trim().min(1).max(200).optional(),
    jobTitle: z.string().trim().max(200).nullable().optional(),
    job_title: z.string().trim().max(200).nullable().optional(),
    email: z.string().email().max(254).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    observations: z.string().trim().max(2000).nullable().optional(),
    isBlocked: z.boolean().optional(),
    photoBase64: z.string().max(5 * 1024 * 1024).optional(),
    idPhotoBase64: z.string().max(5 * 1024 * 1024).optional(),
}).strict().refine(data => Object.keys(data).some(key => !['editPassword', 'visitId'].includes(key)), { message: 'At least one field is required' });
