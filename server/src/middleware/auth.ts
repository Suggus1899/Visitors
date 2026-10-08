import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';
import { container } from '../shared/Container';
import type { AuthPayload } from '../types/express';
import { mustChangePassword } from './mustChangePassword';

async function authenticate(token: string | undefined, req: Request, res: Response, next: NextFunction) {
    let payload: AuthPayload;
    try {
        if (!token || container.tokenBlacklist.isBlacklisted(token)) throw new Error('Invalid token');
        payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as AuthPayload;
        if (!Number.isInteger(payload.id) || !Number.isInteger(payload.tokenVersion)) throw new Error('Invalid session');
    } catch {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
    }
    try {
        const user = await container.userRepository.findById(payload.id);
        if (!user || payload.tokenVersion !== user.tokenVersion ||
            (payload.iat && container.tokenBlacklist.isTokenInvalidatedForUser(payload.id, payload.iat))) {
            return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been revoked'));
        }
        req.user = { ...payload, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
        return mustChangePassword(req, res, next);
    } catch (error) { next(error); }
}

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    return authenticate(header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined, req, res, next);
};

export const verifySseToken = (req: Request, res: Response, next: NextFunction) =>
    authenticate(typeof req.query.token === 'string' ? req.query.token : undefined, req, res, next);

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!['admin', 'root'].includes(req.user?.role || '')) return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Admin Role'));
    next();
};

export const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'root') return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Root Role'));
    next();
};
