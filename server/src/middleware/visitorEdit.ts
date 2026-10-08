import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { timingSafeEqual, createHash } from 'crypto';
import config from '../config/AppConfig';
import { ResponseBuilder } from '../shared/ApiResponse';

export async function validEditPassword(password: string): Promise<boolean> {
    if (!config.editPassword) throw new Error('Edit password is not configured');
    if (config.editPassword.startsWith('$2')) return bcrypt.compare(password, config.editPassword);
    return timingSafeEqual(createHash('sha256').update(password).digest(), createHash('sha256').update(config.editPassword).digest());
}

export const authorizeVisitorEdit = async (req: Request, res: Response, next: NextFunction) => {
    if (!['operador', 'admin', 'root'].includes(req.user?.role || '') ||
        ('isBlocked' in req.body && !['admin', 'root'].includes(req.user?.role || ''))) {
        return res.status(403).json(ResponseBuilder.error('FORBIDDEN', 'No tiene permiso para esta modificación'));
    }
    if (typeof req.body.editPassword !== 'string' || !req.body.editPassword) {
        return res.status(400).json(ResponseBuilder.error('EDIT_PASSWORD_REQUIRED', 'La contraseña de edición es requerida'));
    }
    try {
        if (!await validEditPassword(req.body.editPassword)) return res.status(403).json(ResponseBuilder.error('INVALID_EDIT_PASSWORD', 'Contraseña de edición incorrecta'));
        next();
    } catch (error) { next(error); }
};
