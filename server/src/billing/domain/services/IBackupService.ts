export interface BackupFile {
  name: string;
  date: Date;
  sizeBytes: number;
  path: string;
  tenantId?: number;
  restorePassword?: string; // Solo disponible al crear, no se almacena
}

export interface BackupResult {
  filePath: string;
  restorePassword: string; // Contraseña única: trebol-XXXX-XXXX
}

export interface IBackupService {
  createBackup(tenantId?: number): Promise<BackupResult>;
  listBackups(tenantId?: number): Promise<BackupFile[]>;
  restoreBackup(filename: string, restorePassword: string, tenantId?: number): Promise<void>;
  applyRetention(tenantId: number, keepLast: number | null): Promise<number>;
  deleteBackup(filename: string): Promise<void>;
  verifyRestorePassword(filename: string, password: string): Promise<boolean>;
}
