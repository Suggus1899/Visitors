export interface BackupFile {
  name: string;
  date: Date;
  sizeBytes: number;
  path: string;
  restorePassword?: string; // Solo disponible al crear, no se almacena
}

export interface BackupResult {
  filePath: string;
  restorePassword: string; // Contraseña única: trebol-XXXX-XXXX
}

export interface IBackupService {
  createBackup(): Promise<BackupResult>;
  listBackups(): Promise<BackupFile[]>;
  restoreBackup(filename: string, restorePassword: string): Promise<void>;
  deleteBackup(filename: string): Promise<void>;
  verifyRestorePassword(filename: string, password: string): Promise<boolean>;
}
