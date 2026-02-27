import { IBackupService, BackupFile } from '../../domain/services/IBackupService';

export class ListBackupsUseCase {
  constructor(private backupService: IBackupService) {}

  async execute(): Promise<BackupFile[]> {
    return await this.backupService.listBackups();
  }
}
