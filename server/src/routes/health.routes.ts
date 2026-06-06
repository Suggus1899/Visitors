import { Router } from 'express';
import sequelize from '../database';
import config from '../config/AppConfig';

const router = Router();

/**
 * Healthcheck endpoint - Verifica estado del servidor y dependencias
 * GET /api/v1/health
 */
router.get('/', async (req, res) => {
    const checks = {
        database: false,
        jwt: false,
        timestamp: new Date().toISOString()
    };

    // Verificar conexión a PostgreSQL
    try {
        await sequelize.authenticate();
        checks.database = true;
    } catch (error) {
        checks.database = false;
    }

    // Verificar configuración JWT
    checks.jwt = !!(config.jwtSecret && config.jwtSecret.length >= 32);

    const healthy = checks.database && checks.jwt;

    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'unhealthy',
        service: 'logmaster-api',
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        ...checks
    });
});

export default router;
