/**
 * Must Change Password Middleware
 * Enforces password change for users with mustChangePassword flag
 * Requirements: 5.3, 5.4
 * T-11: Checks the database instead of JWT claims to enforce real-time flag changes
 */

import { Request, Response, NextFunction } from 'express';
import User from '../models/User';

// Simple in-memory cache to avoid hitting DB on every request
const mustChangeCache = new Map<number, { value: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Middleware to check if user must change password
 * Allows access only to the change-password endpoint
 */
export const mustChangePassword = async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user || !user.id) {
        return next();
    }

    let mustChange = false;
    const cached = mustChangeCache.get(user.id);
    if (cached && Date.now() < cached.expiresAt) {
        mustChange = cached.value;
    } else {
        try {
            const dbUser = await User.findByPk(user.id, { attributes: ['mustChangePassword'] });
            mustChange = dbUser?.mustChangePassword === true;
            mustChangeCache.set(user.id, { value: mustChange, expiresAt: Date.now() + CACHE_TTL_MS });
        } catch {
            mustChange = user.mustChangePassword === true;
        }
    }

    if (mustChange) {
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
