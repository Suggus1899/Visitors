import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para capturar IP real del cliente
 * Considera proxies y load balancers
 */
export const captureClientInfo = (req: Request, _res: Response, next: NextFunction) => {
    // Obtener IP real considerando proxies
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    
    let clientIp: string;
    
    if (typeof forwardedFor === 'string') {
        // X-Forwarded-For puede tener múltiples IPs, tomar la primera (cliente original)
        clientIp = forwardedFor.split(',')[0].trim();
    } else if (typeof realIp === 'string') {
        clientIp = realIp;
    } else {
        clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    }
    
    // Obtener User-Agent
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Adjuntar al request para uso posterior
    (req as RequestWithClientInfo).clientInfo = {
        ip: clientIp,
        userAgent: userAgent.substring(0, 500) // Limitar longitud
    };
    
    next();
};

/**
 * Extensión del Request con información del cliente
 */
export interface ClientInfo {
    ip: string;
    userAgent: string;
}

export interface RequestWithClientInfo extends Request {
    clientInfo?: ClientInfo;
}

/**
 * Helper para obtener info del cliente desde el request
 */
export const getClientInfo = (req: Request): ClientInfo => {
    const reqWithInfo = req as RequestWithClientInfo;
    return reqWithInfo.clientInfo || {
        ip: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown'
    };
};
