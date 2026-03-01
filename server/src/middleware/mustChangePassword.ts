/**
 * Must Change Password Middleware
 * Enforces password change for users with mustChangePassword flag
 * Requirements: 5.3, 5.4
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to check if user must change password
 * Allows access only to the change-password endpoint
 */
export const mustChangePassword = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    // If user is not authenticated, skip this check (handled by auth middleware)
    if (!user) {
        return next();
    }

    // Check if user must change password (Requirement: 5.3)
    if (user.mustChangePassword === true) {
        // Allow access to change-password endpoint (Requirement: 5.4)
        if (req.path === '/api/v1/auth/change-password' || req.path === '/v1/auth/change-password') {
            return next();
        }

        // Block access to all other endpoints
        return res.status(403).json({
            success: false,
            error: {
                code: 'PASSWORD_CHANGE_REQUIRED',
                message: 'You must change your password before continuing'
            }
        });
    }

    // User doesn't need to change password, continue
    next();
};
