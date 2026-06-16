import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';
import { tokenBlacklist } from '../infrastructure/services/TokenBlacklist';
import type { AuthPayload } from '../types/express';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No Bearer token provided'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Empty token'));
    }

    if (tokenBlacklist.isBlacklisted(token)) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been revoked'));
    }

    jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err || !decoded) return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));

        const payload = decoded as AuthPayload;
        if (payload.id && payload.iat && tokenBlacklist.isTokenInvalidatedForUser(payload.id, payload.iat)) {
            return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been invalidated'));
        }

        req.user = payload;
        next();
    });
};

export const verifySseToken = (req: Request, res: Response, next: NextFunction) => {
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

    if (!queryToken) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No token provided'));
    }

    if (tokenBlacklist.isBlacklisted(queryToken)) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been revoked'));
    }

    try {
        const decoded = jwt.verify(queryToken, config.jwtSecret, { algorithms: ['HS256'] }) as AuthPayload;

        if (!decoded) {
            return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
        }

        if (decoded.id && decoded.iat && tokenBlacklist.isTokenInvalidatedForUser(decoded.id, decoded.iat)) {
            return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been invalidated'));
        }

        req.user = decoded;
        next();
    } catch {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
    }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Admin Role'));
    }
    next();
};

export const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'superadmin') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Super Admin Role'));
    }
    next();
};
