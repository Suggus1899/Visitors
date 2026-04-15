import { z } from 'zod';

export const restoreBackupSchema = z.object({
  restorePassword: z.string().min(1, 'Restore password is required').max(200, 'Password too long'),
});

export type RestoreBackupInput = z.infer<typeof restoreBackupSchema>;
