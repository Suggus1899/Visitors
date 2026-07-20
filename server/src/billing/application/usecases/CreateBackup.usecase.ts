import { IBackupService, BackupResult } from '../../domain/services/IBackupService';

export class CreateBackupUseCase {
  constructor(private backupService: IBackupService) {}

  async execute(tenantId?: number): Promise<BackupResult> {
    const result = tenantId !== undefined
      ? await this.backupService.createBackup(tenantId)
      : await this.backupService.createBackup();
    return result;
  }
}
