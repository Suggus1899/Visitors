export interface AuthPayload {
  id: number;
  username: string;
  role: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
  mustChangePassword?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}
