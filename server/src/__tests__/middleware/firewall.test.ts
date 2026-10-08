import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { firewall, getSecurityStats, blockIP, unblockIP, clearSecurityEvents } from '../../middleware/firewall';

describe('Firewall Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction;

    beforeEach(() => {
        mockRequest = {
            ip: '192.168.1.1',
            path: '/api/test',
            method: 'GET',
            get: vi.fn(),
            url: '/api/test',
        };
        
        mockResponse = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn(),
        };
        
        nextFunction = vi.fn();
        
        clearSecurityEvents();
    });

    it('allows legitimate requests', () => {
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(nextFunction).toHaveBeenCalled();
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('blocks requests with suspicious user agents', () => {
        mockRequest.get = vi.fn().mockReturnValue('sqlmap/1.0');
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.status).toHaveBeenCalledWith(403);
        expect(mockResponse.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'SUSPICIOUS_USER_AGENT',
                message: 'Access denied',
            },
        });
        expect(nextFunction).not.toHaveBeenCalled();
    });

    it('blocks requests to blocked paths', () => {
        mockRequest.path = '/admin';
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.status).toHaveBeenCalledWith(404);
        expect(mockResponse.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: 'Resource not found',
            },
        });
        expect(nextFunction).not.toHaveBeenCalled();
    });

    it('blocks requests with attack patterns in URL', () => {
        mockRequest.url = '/api/test<script>alert(1)</script>';
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'INVALID_REQUEST',
                message: 'Invalid request',
            },
        });
        expect(nextFunction).not.toHaveBeenCalled();
    });

    it('blocks requests with large payload', () => {
        mockRequest.get = vi.fn().mockReturnValue('15');
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.status).toHaveBeenCalledWith(413);
        expect(mockResponse.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'Request entity too large',
            },
        });
        expect(nextFunction).not.toHaveBeenCalled();
    });

    it('adds security headers', () => {
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
        expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
        expect(mockResponse.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
        expect(mockResponse.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    it('allows requests without origin (server-to-server)', () => {
        mockRequest.ip = undefined;
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(nextFunction).toHaveBeenCalled();
    });

    it('blocks permanently blocked IPs', () => {
        blockIP('192.168.1.1');
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.status).toHaveBeenCalledWith(403);
        expect(mockResponse.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'BLOCKED',
                message: 'Access denied',
            },
        });
        expect(nextFunction).not.toHaveBeenCalled();
        
        unblockIP('192.168.1.1');
    });

    it('temporarily blocks IPs with too many suspicious activities', () => {
        const ip = '192.168.1.2';
        
        for (let i = 0; i < 60; i++) {
            mockRequest.ip = ip;
            mockRequest.get = vi.fn().mockReturnValue(`bot${i}`);
            firewall(mockRequest as Request, mockResponse as Response, vi.fn());
        }
        
        mockRequest.get = vi.fn().mockReturnValue('normal-agent');
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(mockResponse.status).toHaveBeenCalledWith(429);
        expect(mockResponse.json).toHaveBeenCalledWith({
            success: false,
            error: {
                code: 'TEMPORARILY_BLOCKED',
                message: 'Too many suspicious activities, please try again later',
            },
        });
        expect(nextFunction).not.toHaveBeenCalled();
    });

    it('tracks security events correctly', () => {
        const suspiciousRequest = {
            ...mockRequest,
            get: vi.fn().mockReturnValue('sqlmap/1.0'),
        };
        
        firewall(suspiciousRequest as Request, mockResponse as Response, nextFunction);
        
        const stats = getSecurityStats();
        expect(stats.totalEvents).toBe(1);
        expect(stats.eventsByReason['Suspicious user agent']).toBe(1);
        expect(stats.topOffenders).toHaveLength(1);
        expect(stats.topOffenders[0].ip).toBe('192.168.1.1');
        expect(stats.topOffenders[0].count).toBe(1);
    });

    it('handles multiple blocked IPs', () => {
        blockIP('192.168.1.100');
        blockIP('192.168.1.200');
        
        const stats = getSecurityStats();
        expect(stats.temporarilyBlockedIPs).toBe(2);
        
        unblockIP('192.168.1.100');
        unblockIP('192.168.1.200');
    });

    it('allows unblocking of IPs', () => {
        blockIP('192.168.1.100');
        
        mockRequest.ip = '192.168.1.100';
        firewall(mockRequest as Request, mockResponse as Response, vi.fn());
        expect(mockResponse.status).toHaveBeenCalledWith(403);
        
        unblockIP('192.168.1.100');
        
        mockResponse.status = vi.fn().mockReturnThis();
        mockResponse.json = vi.fn().mockReturnThis();
        
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalled();
    });

    it('provides accurate security statistics', () => {
        const suspiciousRequests = [
            { ...mockRequest, get: vi.fn().mockReturnValue('bot1') },
            { ...mockRequest, get: vi.fn().mockReturnValue('bot2') },
            { ...mockRequest, get: vi.fn().mockReturnValue('bot3') },
        ];
        
        suspiciousRequests.forEach(req => {
            firewall(req as Request, mockResponse as Response, vi.fn());
        });
        
        const stats = getSecurityStats();
        expect(stats.totalEvents).toBe(3);
        expect(stats.eventsByReason['Suspicious user agent']).toBe(3);
        expect(stats.topOffenders).toHaveLength(1);
        expect(stats.topOffenders[0].count).toBe(3);
    });
});
