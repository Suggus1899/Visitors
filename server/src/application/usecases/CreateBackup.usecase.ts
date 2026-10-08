import { IBackupService, BackupResult } from '../../domain/services/IBackupService';

export class CreateBackupUseCase {
  constructor(private backupService: IBackupService) {}

  async execute(): Promise<BackupResult> {
    const result = await this.backupService.createBackup();
    return result;
  }
}
