export interface AuthPayload {
  sub?: number;
  id: number;
  username: string;
  email?: string | null;
  tid?: number;
  tslug?: string;
  role?: string;
  iat?: number;
  exp?: number;
  mustChangePassword?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      tenantId?: number;
      tenantRole?: 'admin' | 'operador' | 'auditor' | 'demo';
      /** Set by resolveTenant — used by demoRateLimiter to throttle demo tenants. */
      tenantIsDemo?: boolean;
    }
  }
}
