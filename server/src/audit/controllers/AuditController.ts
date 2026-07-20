import { Request, Response } from 'express';
import { ResponseBuilder } from '../../shared/ApiResponse';
import { container } from '../../shared/Container';
import { AuditLogFilters } from '../domain/repositories/IAuditLogRepository';
import logger from '../../config/logger';

const requireTenantId = (req: Request): number => {
  if (!req.tenantId) throw new Error('Tenant context is required');
  return req.tenantId;
};

/**
 * Controller para endpoints de auditoría
 * Solo accesible por usuarios con rol 'auditor' o 'admin'
 */

/**
 * GET /api/v1/audit/logs
 * Obtener logs con filtros avanzados
 */
export const getLogs = async (req: Request, res: Response) => {
    try {
        const tenantId = requireTenantId(req);
        const {
            page = '1',
            limit = '50',
            action,
            username,
            entity,
            ip,
            startDate,
            endDate,
            search
        } = req.query;

        const pageNum = parseInt(page as string) || 1;
        const limitNum = Math.min(parseInt(limit as string) || 50, 100);
        const offset = (pageNum - 1) * limitNum;

        const filters: AuditLogFilters = {
            action: action as string | undefined,
            username: username as string | undefined,
            entity: entity as string | undefined,
            ip: ip as string | undefined,
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined,
            search: search as string | undefined,
            limit: limitNum,
            offset
        };

        const { logs, total } = await container.auditLogRepository.findAll(tenantId, filters);

        res.json(ResponseBuilder.success({
            logs: logs.map(log => ({
                id: log.id,
                userId: log.userId,
                username: log.username,
                action: log.action,
                entity: log.entity,
                entityId: log.entityId,
                details: log.details,
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                createdAt: log.createdAt
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        }));
    } catch (error) {
        logger.error('Error fetching audit logs:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener logs'));
    }
};

/**
 * GET /api/v1/audit/stats
 * Obtener estadísticas de auditoría
 */
export const getStats = async (req: Request, res: Response) => {
    try {
        const stats = await container.auditLogRepository.getStats(requireTenantId(req));

        res.json(ResponseBuilder.success({
            today: stats.today,
            lastWeek: stats.lastWeek
        }));
    } catch (error) {
        logger.error('Error fetching audit stats:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener estadísticas'));
    }
};

/**
 * GET /api/v1/audit/export
 * Exportar logs a CSV
 */
export const exportLogs = async (req: Request, res: Response) => {
    try {
        const tenantId = requireTenantId(req);
        const { startDate, endDate, action, username } = req.query;

        const filters: AuditLogFilters = {
            action: action as string | undefined,
            username: username as string | undefined,
            startDate: startDate ? new Date(startDate as string) : undefined,
            endDate: endDate ? new Date(endDate as string) : undefined,
            limit: 10000
        };

        const { logs } = await container.auditLogRepository.findAll(tenantId, filters);

        const headers = ['ID', 'Fecha', 'Usuario', 'Acción', 'Entidad', 'ID Entidad', 'Detalles', 'IP', 'User Agent'];
        const rows = logs.map(log => [
            log.id,
            log.createdAt.toISOString(),
            log.username,
            log.action,
            log.entity,
            log.entityId,
            (log.details || '').replace(/"/g, '""'),
            log.ipAddress || '',
            (log.userAgent || '').replace(/"/g, '""')
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
        res.send('\uFEFF' + csv);
    } catch (error) {
        logger.error('Error exporting audit logs:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al exportar logs'));
    }
};

/**
 * GET /api/v1/audit/actions
 * Obtener lista de acciones únicas para filtros
 */
export const getActions = async (req: Request, res: Response) => {
    try {
        const actions = await container.auditLogRepository.getDistinctActions(requireTenantId(req));

        res.json(ResponseBuilder.success(actions));
    } catch (error) {
        logger.error('Error fetching actions:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener acciones'));
    }
};

/**
 * GET /api/v1/audit/users
 * Obtener lista de usuarios para filtros
 */
export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await container.auditLogRepository.getDistinctUsers(requireTenantId(req));

        res.json(ResponseBuilder.success(users));
    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener usuarios'));
    }
};

/**
 * GET /api/v1/audit/config
 * Obtener configuración de retención
 */
export const getRetentionPolicy = async (_req: Request, res: Response) => {
    try {
        const retentionDays = process.env.AUDIT_RETENTION_DAYS ? parseInt(process.env.AUDIT_RETENTION_DAYS) : 365;

        res.json(ResponseBuilder.success({
            retentionDays,
            policy: `Logs older than ${retentionDays} days are automatically purged.`
        }));
    } catch (error) {
        logger.error('Error fetching retention policy:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener política de retención'));
    }
};
