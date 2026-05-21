import { Request, Response, NextFunction } from 'express';
import { firewall, getSecurityStats, blockIP, unblockIP } from '../firewall';

// Mock console.warn to avoid test output pollution
jest.mock('../../../config/AppConfig', () => ({
    nodeEnv: 'test',
}));

describe('Firewall Middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction;

    beforeEach(() => {
        mockRequest = {
            ip: '192.168.1.1',
            path: '/api/test',
            method: 'GET',
            get: jest.fn(),
            url: '/api/test',
        };
        
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            setHeader: jest.fn(),
        };
        
        nextFunction = jest.fn();
        
        // Clear security events before each test
        const { clearSecurityEvents } = require('../firewall');
        clearSecurityEvents();
    });

    it('allows legitimate requests', () => {
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        
        expect(nextFunction).toHaveBeenCalled();
        expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('blocks requests with suspicious user agents', () => {
        mockRequest.get = jest.fn().mockReturnValue('sqlmap/1.0');
        
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
        mockRequest.get = jest.fn().mockReturnValue('15');
        
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
        
        // Clean up
        unblockIP('192.168.1.1');
    });

    it('temporarily blocks IPs with too many suspicious activities', () => {
        const ip = '192.168.1.2';
        
        // Simulate multiple suspicious activities
        for (let i = 0; i < 60; i++) {
            mockRequest.ip = ip;
            mockRequest.get = jest.fn().mockReturnValue(`bot${i}`);
            firewall(mockRequest as Request, mockResponse as Response, jest.fn());
        }
        
        // Next request should be temporarily blocked
        mockRequest.get = jest.fn().mockReturnValue('normal-agent');
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
            get: jest.fn().mockReturnValue('sqlmap/1.0'),
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
        
        // Clean up
        unblockIP('192.168.1.100');
        unblockIP('192.168.1.200');
    });

    it('allows unblocking of IPs', () => {
        blockIP('192.168.1.100');
        
        // Should be blocked
        mockRequest.ip = '192.168.1.100';
        firewall(mockRequest as Request, mockResponse as Response, jest.fn());
        expect(mockResponse.status).toHaveBeenCalledWith(403);
        
        // Unblock IP
        unblockIP('192.168.1.100');
        
        // Reset mock
        mockResponse.status = jest.fn().mockReturnThis();
        mockResponse.json = jest.fn().mockReturnThis();
        
        // Should now be allowed
        firewall(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalled();
    });

    it('provides accurate security statistics', () => {
        // Generate some security events
        const suspiciousRequests = [
            { ...mockRequest, get: jest.fn().mockReturnValue('bot1') },
            { ...mockRequest, get: jest.fn().mockReturnValue('bot2') },
            { ...mockRequest, get: jest.fn().mockReturnValue('bot3') },
        ];
        
        suspiciousRequests.forEach(req => {
            firewall(req as Request, mockResponse as Response, jest.fn());
        });
        
        const stats = getSecurityStats();
        expect(stats.totalEvents).toBe(3);
        expect(stats.eventsByReason['Suspicious user agent']).toBe(3);
        expect(stats.topOffenders).toHaveLength(1);
        expect(stats.topOffenders[0].count).toBe(3);
    });
});
