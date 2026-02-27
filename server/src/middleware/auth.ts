import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No token provided'));

    jwt.verify(token.split(' ')[1], config.jwtSecret, (err, decoded) => {
        if (err || !decoded) return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
        req.user = decoded;
        next();
    });
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    // req.user logic depends on how you type the decoded token.
    // Assuming decoded token has { role: string }
    const userRole = (req.user as any)?.role;

    if (userRole !== 'admin') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Admin Role'));
    }
    next();
};
