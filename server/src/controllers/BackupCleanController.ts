import { Request, Response } from 'express';
import { container } from '../shared/Container';
import { ResponseBuilder } from '../shared/ApiResponse';
import logger from '../config/logger';

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

    // La contraseña de restauración se muestra UNA SOLA VEZ aquí
    res.json(ResponseBuilder.success({
      filePath: result.filePath,
      restorePassword: result.restorePassword,
      message: 'IMPORTANTE: Guarde esta contraseña de restauración. No se mostrará nuevamente.'
    }));
  } catch (error) {
    logger.error('Create backup error:', error);
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

    // No incluir restorePassword en la lista (ya no está disponible después de crear)
    res.json(ResponseBuilder.success(result));
  } catch (error) {
    logger.error('List backups error:', error);
    res.status(500).json(ResponseBuilder.error('BACKUP_LIST_FAILED', 'Failed to list backups'));
  }
};

/**
 * Restore a backup
 * POST /api/v1/backups/:filename/restore
 */
export const restoreBackup = async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { restorePassword } = req.body;

    if (!restorePassword) {
      return res.status(400).json(
        ResponseBuilder.error('MISSING_PASSWORD', 'Restore password is required')
      );
    }

    const service = container.backupService;
    await service.restoreBackup(filename as string, restorePassword);

    res.json(ResponseBuilder.success({
      message: 'Backup restored successfully',
      filename
    }));
  } catch (error: any) {
    logger.error('Restore backup error:', error);
    if (error.message === 'Invalid restore password') {
      res.status(401).json(ResponseBuilder.error('INVALID_PASSWORD', 'Invalid restore password'));
    } else if (error.message === 'Backup file not found') {
      res.status(404).json(ResponseBuilder.error('NOT_FOUND', 'Backup file not found'));
    } else {
      res.status(500).json(ResponseBuilder.error('RESTORE_FAILED', 'Failed to restore backup'));
    }
  }
};
