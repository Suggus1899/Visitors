import { Request, Response, NextFunction } from 'express';
import { ResponseBuilder } from '../shared/ApiResponse';

interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        username: string;
        role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
    };
}

/**
 * Middleware para verificar acceso de auditor
 * Permite acceso a usuarios con rol 'auditor' o 'admin'
 */
export const verifyAuditor = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No autenticado'));
    }
    
    const { role } = authReq.user;
    
    if (role !== 'auditor' && role !== 'admin' && role !== 'root') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Acceso restringido a auditores'));
    }
    
    next();
};

/**
 * Middleware para verificar que NO es solo auditor
 * Usado para proteger rutas de visitantes/visitas del auditor
 */
export const denyAuditorOnly = (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No autenticado'));
    }
    
    // Si es auditor (y no admin), denegar acceso
    if (authReq.user.role === 'auditor') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Auditores no tienen acceso a esta función'));
    }
    
    next();
};
