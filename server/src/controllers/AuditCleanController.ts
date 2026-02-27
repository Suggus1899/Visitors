import { Request, Response } from 'express';
import ActivityLog from '../models/ActivityLog';
import { ResponseBuilder } from '../shared/ApiResponse';
import { Op, fn, col, literal } from 'sequelize';

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

        // Construir filtros
        const where: Record<string, unknown> = {};

        if (action) {
            where.action = action;
        }

        if (username) {
            where.username = { [Op.like]: `%${username}%` };
        }

        if (entity) {
            where.entity = entity;
        }

        if (ip) {
            where.ipAddress = { [Op.like]: `%${ip}%` };
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                (where.createdAt as Record<symbol, Date>)[Op.gte] = new Date(startDate as string);
            }
            if (endDate) {
                const end = new Date(endDate as string);
                end.setHours(23, 59, 59, 999);
                (where.createdAt as Record<symbol, Date>)[Op.lte] = end;
            }
        }

        if (search) {
            where[Op.or as unknown as string] = [
                { details: { [Op.like]: `%${search}%` } },
                { entityId: { [Op.like]: `%${search}%` } }
            ];
        }

        const { rows: logs, count: total } = await ActivityLog.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: limitNum,
            offset
        });

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
        console.error('Error fetching audit logs:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener logs'));
    }
};

/**
 * GET /api/v1/audit/stats
 * Obtener estadísticas de auditoría
 */
export const getStats = async (req: Request, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Logins de hoy
        const loginsToday = await ActivityLog.count({
            where: {
                action: 'LOGIN',
                createdAt: { [Op.gte]: today }
            }
        });

        // Acciones de hoy
        const actionsToday = await ActivityLog.count({
            where: { createdAt: { [Op.gte]: today } }
        });

        // Usuarios únicos hoy
        const uniqueUsersToday = await ActivityLog.count({
            where: { createdAt: { [Op.gte]: today } },
            distinct: true,
            col: 'userId'
        });

        // IPs únicas últimas 24h
        const uniqueIPs = await ActivityLog.count({
            where: { createdAt: { [Op.gte]: yesterday } },
            distinct: true,
            col: 'ipAddress'
        });

        // Acciones por tipo (últimos 7 días)
        const actionsByType = await ActivityLog.findAll({
            where: { createdAt: { [Op.gte]: weekAgo } },
            attributes: [
                'action',
                [fn('COUNT', col('id')), 'count']
            ],
            group: ['action'],
            order: [[literal('count'), 'DESC']],
            raw: true
        });

        // Actividad por usuario (últimos 7 días, top 10)
        const topUsers = await ActivityLog.findAll({
            where: { createdAt: { [Op.gte]: weekAgo } },
            attributes: [
                'username',
                [fn('COUNT', col('id')), 'count']
            ],
            group: ['username'],
            order: [[literal('count'), 'DESC']],
            limit: 10,
            raw: true
        });

        // Actividad por día (últimos 7 días)
        const dailyActivity = await ActivityLog.findAll({
            where: { createdAt: { [Op.gte]: weekAgo } },
            attributes: [
                [fn('DATE', col('createdAt')), 'date'],
                [fn('COUNT', col('id')), 'count']
            ],
            group: [fn('DATE', col('createdAt'))],
            order: [[fn('DATE', col('createdAt')), 'ASC']],
            raw: true
        });

        res.json(ResponseBuilder.success({
            today: {
                logins: loginsToday,
                actions: actionsToday,
                uniqueUsers: uniqueUsersToday,
                uniqueIPs
            },
            lastWeek: {
                actionsByType,
                topUsers,
                dailyActivity
            }
        }));
    } catch (error) {
        console.error('Error fetching audit stats:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener estadísticas'));
    }
};

/**
 * GET /api/v1/audit/export
 * Exportar logs a CSV
 */
export const exportLogs = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, action, username } = req.query;

        const where: Record<string, unknown> = {};

        if (action) where.action = action;
        if (username) where.username = username;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                (where.createdAt as Record<symbol, Date>)[Op.gte] = new Date(startDate as string);
            }
            if (endDate) {
                const end = new Date(endDate as string);
                end.setHours(23, 59, 59, 999);
                (where.createdAt as Record<symbol, Date>)[Op.lte] = end;
            }
        }

        const logs = await ActivityLog.findAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: 10000 // Límite para evitar exportaciones masivas
        });

        // Generar CSV
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
        res.send('\uFEFF' + csv); // BOM para Excel
    } catch (error) {
        console.error('Error exporting audit logs:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al exportar logs'));
    }
};

/**
 * GET /api/v1/audit/actions
 * Obtener lista de acciones únicas para filtros
 */
export const getActions = async (_req: Request, res: Response) => {
    try {
        const actions = await ActivityLog.findAll({
            attributes: [[fn('DISTINCT', col('action')), 'action']],
            raw: true
        });

        res.json(ResponseBuilder.success(
            actions.map((a: { action: string }) => a.action).filter(Boolean)
        ));
    } catch (error) {
        console.error('Error fetching actions:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener acciones'));
    }
};

/**
 * GET /api/v1/audit/users
 * Obtener lista de usuarios para filtros
 */
export const getUsers = async (_req: Request, res: Response) => {
    try {
        const users = await ActivityLog.findAll({
            attributes: [[fn('DISTINCT', col('username')), 'username']],
            raw: true
        });

        res.json(ResponseBuilder.success(
            users.map((u: { username: string }) => u.username).filter(Boolean)
        ));
    } catch (error) {
        console.error('Error fetching users:', error);
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
        console.error('Error fetching retention policy:', error);
        res.status(500).json(ResponseBuilder.error('SERVER_ERROR', 'Error al obtener política de retención'));
    }
};
