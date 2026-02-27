import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';

/**
 * Clean Architecture Backup Controller
 */

/**
 * Create a new backup
 * POST /api/v1/backups
 */
export const createBackup = async (req: Request, res: Response) => {
  try {
    const useCase = container.createCreateBackupUseCase();
    const result = await useCase.execute();
    
    res.json(ResponseBuilder.success(result));
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json(ResponseBuilder.error('BACKUP_FAILED', 'Failed to create backup'));
  }
};

/**
 * List all backups
 * GET /api/v1/backups
 */
export const listBackups = async (req: Request, res: Response) => {
  try {
    const useCase = container.createListBackupsUseCase();
    const result = await useCase.execute();
    
    res.json(ResponseBuilder.success(result));
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json(ResponseBuilder.error('BACKUP_LIST_FAILED', 'Failed to list backups'));
  }
};
