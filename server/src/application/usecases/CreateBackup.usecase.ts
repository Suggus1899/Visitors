import { IBackupService } from '../../domain/services/IBackupService';

export class CreateBackupUseCase {
  constructor(private backupService: IBackupService) {}

  async execute(): Promise<{ path: string; message: string }> {
    const path = await this.backupService.createBackup();
    return {
        path,
        message: 'Backup created successfully'
    };
  }
}
