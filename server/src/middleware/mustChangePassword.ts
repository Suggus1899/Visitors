import { Request, Response, NextFunction } from 'express';
import { ResponseBuilder } from '../shared/ApiResponse';

// Authentication loads the current database flag before this check.
export const mustChangePassword = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.mustChangePassword && !['/api/v1/auth/change-password', '/v1/auth/change-password'].includes(req.path)) {
        return res.status(403).json(ResponseBuilder.error('PASSWORD_CHANGE_REQUIRED', 'You must change your password before continuing'));
    }
    next();
};
