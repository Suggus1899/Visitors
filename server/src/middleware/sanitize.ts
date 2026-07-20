import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

/**
 * Recursively sanitise a value: strings get XSS-filtered, arrays and
 * plain objects are walked. Anything else (number, boolean, null, Date,
 * Buffer, etc.) is returned as-is.
 *
 * Used as Express middleware to clean `req.body`, `req.query` and
 * `req.params` of HTML/script injection before reaching controllers.
 *
 * NOTE: This is defence-in-depth. React already escapes values rendered
 * as JSX children, but stored XSS (value persisted then later rendered
 * via dangerouslySetInnerHTML or by a non-React consumer) is still a
 * risk. Sanitising on input closes that gap.
 */
const sanitizeValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return xss(value);
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Buffer)) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[xss(k)] = sanitizeValue(v);
        }
        return out;
    }
    return value;
};

/**
 * XSS sanitiser for request body, query and params.
 *
 * Skips routes whose body is not JSON (file uploads, raw blobs) — those
 * are validated at the controller level via content-type checks.
 */
export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
        req.body = sanitizeValue(req.body);
    }
    // Sanitise query string values in place — express mutates req.query
    // as a ParsedQs record. We walk keys and overwrite string values.
    if (req.query && typeof req.query === 'object') {
        for (const [k, v] of Object.entries(req.query)) {
            const cleanKey = xss(k);
            const cleanVal = sanitizeValue(v);
            if (cleanKey !== k) delete req.query[k];
            (req.query as Record<string, unknown>)[cleanKey] = cleanVal;
        }
    }
    if (req.params && typeof req.params === 'object') {
        for (const [k, v] of Object.entries(req.params)) {
            const cleanKey = xss(k);
            const cleanVal = sanitizeValue(v);
            if (cleanKey !== k) delete req.params[k];
            (req.params as Record<string, unknown>)[cleanKey] = cleanVal;
        }
    }
    next();
};
