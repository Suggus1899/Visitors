import { IBackupService, BackupFile } from '../../domain/services/IBackupService';

export class ListBackupsUseCase {
  constructor(private backupService: IBackupService) {}

  async execute(tenantId?: number): Promise<BackupFile[]> {
    return tenantId !== undefined
      ? await this.backupService.listBackups(tenantId)
      : await this.backupService.listBackups();
  }
}
