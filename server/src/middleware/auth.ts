import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No Bearer token provided'));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Empty token'));
    }

    jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err || !decoded) return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
        req.user = decoded;
        next();
    });
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    // req.user logic depends on how you type the decoded token.
    // Assuming decoded token has { role: string }
    const userRole = (req.user as jwt.JwtPayload)?.role;

    if (userRole !== 'admin') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Admin Role'));
    }
    next();
};

export const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req.user as jwt.JwtPayload)?.role;

    if (userRole !== 'superadmin') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Super Admin Role'));
    }
    next();
};
