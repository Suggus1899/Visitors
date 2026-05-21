import { Request, Response, NextFunction } from 'express';

// Blocked IPs and suspicious patterns
const BLOCKED_IPS = new Set<string>();

const SUSPICIOUS_USER_AGENTS = [
  /bot/i,
  /crawler/i,
  /scanner/i,
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
];

const BLOCKED_PATHS = [
  '/admin',
  '/wp-admin',
  '/phpmyadmin',
  '/.env',
  '/config',
  '/backup',
  '/.git',
];

const ALLOWED_PATHS = [
  '/api',
  '/data/photos',
  '/health',
  '/',
  '/api-docs',
];

interface SecurityEvent {
  ip: string;
  path: string;
  method: string;
  userAgent: string;
  timestamp: Date;
  reason: string;
}

const securityEvents: SecurityEvent[] = [];

// Clean old security events (keep last 1000)
const cleanSecurityEvents = () => {
  if (securityEvents.length > 1000) {
    securityEvents.splice(0, securityEvents.length - 1000);
  }
};

// Check if IP should be temporarily blocked
const isTemporarilyBlocked = (ip: string): boolean => {
  const now = new Date();
  const recentEvents = securityEvents.filter(
    event => event.ip === ip && 
    (now.getTime() - event.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
  );

  // Block if too many suspicious activities
  return recentEvents.length > 50;
};

// Log security event
const logSecurityEvent = (req: Request, reason: string) => {
  const event: SecurityEvent = {
    ip: req.ip || 'unknown',
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent') || 'unknown',
    timestamp: new Date(),
    reason,
  };

  securityEvents.push(event);
  cleanSecurityEvents();

  console.warn(`🚨 Security Event: ${reason}`, {
    ip: event.ip,
    path: event.path,
    method: event.method,
    userAgent: event.userAgent,
  });
};

// Main firewall middleware
export const firewall = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const path = req.path;

  // Check permanently blocked IPs
  if (BLOCKED_IPS.has(ip)) {
    logSecurityEvent(req, 'Permanently blocked IP');
    return res.status(403).json({
      success: false,
      error: {
        code: 'BLOCKED',
        message: 'Access denied',
      },
    });
  }

  // Check temporarily blocked IPs
  if (isTemporarilyBlocked(ip)) {
    logSecurityEvent(req, 'Temporarily blocked IP');
    return res.status(429).json({
      success: false,
      error: {
        code: 'TEMPORARILY_BLOCKED',
        message: 'Too many suspicious activities, please try again later',
      },
    });
  }

  // Check for suspicious user agents
  if (SUSPICIOUS_USER_AGENTS.some(pattern => pattern.test(userAgent))) {
    logSecurityEvent(req, 'Suspicious user agent');
    return res.status(403).json({
      success: false,
      error: {
        code: 'SUSPICIOUS_USER_AGENT',
        message: 'Access denied',
      },
    });
  }

  // Check for blocked paths
  if (BLOCKED_PATHS.some(blockedPath => path.startsWith(blockedPath))) {
    logSecurityEvent(req, 'Access to blocked path');
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
      },
    });
  }

  // Validate request size
  const contentLength = parseInt(req.get('Content-Length') || '0');
  if (contentLength > 10 * 1024 * 1024) { // 10MB
    logSecurityEvent(req, 'Request too large');
    return res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request entity too large',
      },
    });
  }

  // Check for common attack patterns in URL
  const attackPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /delete\s+from/i,
    /exec\s*\(/i,
    /eval\s*\(/i,
  ];

  if (attackPatterns.some(pattern => pattern.test(req.url))) {
    logSecurityEvent(req, 'Suspicious URL pattern');
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid request',
      },
    });
  }

  next();
};

// Get security statistics
export const getSecurityStats = () => {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const recentEvents = securityEvents.filter(
    event => event.timestamp > last24h
  );

  const eventsByReason = recentEvents.reduce((acc, event) => {
    acc[event.reason] = (acc[event.reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const eventsByIP = recentEvents.reduce((acc, event) => {
    acc[event.ip] = (acc[event.ip] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalEvents: recentEvents.length,
    eventsByReason,
    topOffenders: Object.entries(eventsByIP)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count })),
    temporarilyBlockedIPs: BLOCKED_IPS.size,
  };
};

// Clear security events (for admin use)
export const clearSecurityEvents = () => {
  securityEvents.length = 0;
};

// Add IP to blocklist
export const blockIP = (ip: string) => {
  BLOCKED_IPS.add(ip);
};

// Remove IP from blocklist
export const unblockIP = (ip: string) => {
  BLOCKED_IPS.delete(ip);
};
