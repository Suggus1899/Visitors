import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';
import { container } from '../shared/Container';
import type { AuthPayload } from '../types/express';
import { ACCESS_COOKIE } from '../utils/authCookies';

/**
 * Extract access token from either the Authorization header (Bearer) or the
 * httpOnly cookie set by the hybrid cookie+header auth flow.
 * - Header path: programmatic API clients, webhooks, integrations.
 * - Cookie path: Next.js Server Components (SSR) and same-origin browsers.
 */
const extractAccessToken = (req: Request): string | null => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const headerToken = authHeader.slice(7).trim();
        if (headerToken) return headerToken;
    }
    const cookieToken = req.cookies?.[ACCESS_COOKIE];
    if (typeof cookieToken === 'string' && cookieToken) return cookieToken;
    return null;
};

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = extractAccessToken(req);
    if (!token) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'No Bearer token provided'));
    }

    if (container.tokenBlacklist.isBlacklisted(token)) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been revoked'));
    }

    jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err || !decoded) return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));

        const payload = decoded as AuthPayload;
        if (payload.id && payload.iat && container.tokenBlacklist.isTokenInvalidatedForUser(payload.id, payload.iat)) {
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

    if (container.tokenBlacklist.isBlacklisted(queryToken)) {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been revoked'));
    }

    try {
        const decoded = jwt.verify(queryToken, config.jwtSecret, { algorithms: ['HS256'] }) as AuthPayload;

        if (!decoded) {
            return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
        }

        if (decoded.id && decoded.iat && container.tokenBlacklist.isTokenInvalidatedForUser(decoded.id, decoded.iat)) {
            return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Token has been invalidated'));
        }

        req.user = decoded;
        next();
    } catch {
        return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Failed to authenticate token'));
    }
};

export const resolveTenant = async (req: Request, res: Response, next: NextFunction) => {
    const slug = typeof req.params.tenantSlug === 'string' ? req.params.tenantSlug : req.user?.tslug;
    const tenantId = req.user?.tid;
    const tenant = slug
        ? await container.tenantRepository.findBySlug(slug)
        : tenantId ? await container.tenantRepository.findById(tenantId) : null;

    if (!tenant || !tenant.id || tenant.status === 'suspended' || (tenant.isDemo && tenant.demoExpiresAt && tenant.demoExpiresAt < new Date())) {
        return res.status(403).json(ResponseBuilder.error('TENANT_UNAVAILABLE', 'Tenant is unavailable'));
    }
    if (tenantId && tenantId !== tenant.id) {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Token tenant does not match requested tenant'));
    }
    req.user = { ...req.user!, tid: tenant.id, tslug: tenant.slug };
    req.tenantId = tenant.id;
    next();
};

/*
 * Demo tenant isolation notes (security audit item):
 * - Demo tenants are read/write-scoped to their own tenantId by the same
 *   repository filters as production tenants (every repo query filters by
 *   tenantId), so cross-tenant data access is already prevented.
 * - Plan upgrades and tenant mutation endpoints live under /v1/superadmin/*
 *   which is guarded by isSuperAdmin (root role only); demo tenants cannot
 *   self-upgrade their plan or lift demo restrictions via the API.
 * - Demo expiry is enforced above (demoExpiresAt < now => 403).
 * - TODO(security): apply a stricter per-tenant rate limiter (demoLimiter)
 *   to /v1/:tenantSlug/* when tenant.isDemo is true, to throttle demo abuse.
 *   This requires resolving the tenant before the limiter runs (or a
 *   limiter that reads tenant.isDemo from the repository), which is a
 *   larger routing change deferred to avoid breaking the current middleware
 *   ordering.
 */

export const verifyTenantMembership = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.tid) return res.status(401).json(ResponseBuilder.error('UNAUTHORIZED', 'Tenant context is required'));
    const membership = await container.tenantUserRepository.findMembership(req.user.id, req.user.tid);
    if (!membership) return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Tenant membership is required'));
    req.user.role = membership.role;
    req.tenantRole = membership.role;
    next();
};

export const requireTenantRole = (...roles: Array<'admin' | 'operador' | 'auditor' | 'demo'>) =>
    (req: Request, res: Response, next: NextFunction) => {
        if (!req.user?.role || !roles.includes(req.user.role as 'admin' | 'operador' | 'auditor' | 'demo')) {
            return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Insufficient tenant role'));
        }
        next();
    };

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Admin Role'));
    }
    next();
};

export const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'root') {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'Require Root Role'));
    }
    next();
};
