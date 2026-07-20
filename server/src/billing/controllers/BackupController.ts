import { Request, Response } from 'express';
import { container } from '../../shared/Container';
import { ResponseBuilder } from '../../shared/ApiResponse';
import logger from '../../config/logger';
import { getSubscriptionLimits, normalizeSubscriptionPlan } from '../../config/subscription';

const requireTenantId = (req: Request): number => {
  if (!req.tenantId) throw new Error('Tenant context is required');
  return req.tenantId;
};

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
    const result = await useCase.execute(requireTenantId(req));

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
    const result = await useCase.execute(requireTenantId(req));

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
export const createTenantBackup = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const tenant = await container.tenantRepository.findById(tenantId);
  if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
  const limits = getSubscriptionLimits(tenant.subscriptionPlan);
  const result = await container.backupService.createBackup(tenantId);
  const deletedByRetention = await container.backupService.applyRetention(tenantId, limits.backupRetentionCount);
  res.status(201).json(ResponseBuilder.success({ ...result, tenantId, deletedByRetention }));
};

export const listTenantBackups = async (req: Request, res: Response) => {
  const backups = await container.backupService.listBackups(requireTenantId(req));
  res.json(ResponseBuilder.success(backups));
};

export const restoreTenantBackup = async (req: Request, res: Response) => {
  const { filename } = req.params;
  const { restorePassword } = req.body;
  const tenantId = requireTenantId(req);
  try {
    await container.backupService.restoreBackup(filename as string, restorePassword, tenantId);
    res.json(ResponseBuilder.success({ message: 'Tenant-tagged backup restored successfully', filename }));
  } catch (error: any) {
    if (error.message === 'Invalid restore password') return res.status(401).json(ResponseBuilder.error('INVALID_PASSWORD', error.message));
    if (error.message === 'Backup file not found') return res.status(404).json(ResponseBuilder.error('NOT_FOUND', error.message));
    if (error.message === 'Backup does not belong to tenant') return res.status(403).json(ResponseBuilder.error('BACKUP_TENANT_MISMATCH', error.message));
    throw error;
  }
};

export const getTenantBackupSchedule = async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const tenant = await container.tenantRepository.findById(tenantId);
  if (!tenant) return res.status(404).json(ResponseBuilder.error('TENANT_NOT_FOUND', 'Tenant not found'));
  const limits = getSubscriptionLimits(tenant.subscriptionPlan);
  const intervalHours = limits.backupFrequency === 'daily' ? 24 : limits.backupFrequency === 'four-hour' ? 4 : null;
  const backups = await container.backupService.listBackups(tenantId);
  const lastBackupAt = backups[0]?.date ?? null;
  const nextBackupAt = intervalHours && lastBackupAt
    ? new Date(lastBackupAt.getTime() + intervalHours * 60 * 60 * 1000)
    : null;
  res.json(ResponseBuilder.success({
    plan: normalizeSubscriptionPlan(tenant.subscriptionPlan),
    frequency: limits.backupFrequency,
    intervalHours,
    lastBackupAt,
    nextBackupAt,
    retentionCount: limits.backupRetentionCount,
    continuousPlaceholder: limits.backupFrequency === 'continuous',
  }));
};

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
