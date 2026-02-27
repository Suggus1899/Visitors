export interface BackupFile {
  name: string;
  date: Date;
  sizeBytes: number;
  path: string;
}

export interface IBackupService {
  createBackup(): Promise<string>;
  listBackups(): Promise<BackupFile[]>;
  restoreBackup(filename: string): Promise<void>;
  deleteBackup(filename: string): Promise<void>;
}
