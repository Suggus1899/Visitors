import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import AuthService from '../services/AuthService';

interface SessionTimeoutOptions {
    warningTime?: number;  // Show warning this many ms before logout (default: 2 min)
    logoutTime?: number;   // Auto logout after this many ms of inactivity (default: 15 min, matching access token expiry)
}

export const useSessionTimeout = (options: SessionTimeoutOptions = {}) => {
    const { warningTime = 2 * 60 * 1000, logoutTime = 15 * 60 * 1000 } = options;
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [showWarning, setShowWarning] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);

    const logoutTimerRef = useRef<NodeJS.Timeout>();
    const warningTimerRef = useRef<NodeJS.Timeout>();
    const countdownRef = useRef<NodeJS.Timeout>();

    const handleLogout = useCallback(() => {
        clearTimeout(logoutTimerRef.current);
        clearTimeout(warningTimerRef.current);
        clearInterval(countdownRef.current);
        logout();
        navigate('/login');
    }, [logout, navigate]);

    const resetTimers = useCallback(() => {
        clearTimeout(logoutTimerRef.current);
        clearTimeout(warningTimerRef.current);
        clearInterval(countdownRef.current);
        setShowWarning(false);

        warningTimerRef.current = setTimeout(() => {
            setShowWarning(true);
            setTimeLeft(Math.floor(warningTime / 1000));

            countdownRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }, logoutTime - warningTime);

        logoutTimerRef.current = setTimeout(handleLogout, logoutTime);
    }, [logoutTime, warningTime, handleLogout]);

    const extendSession = useCallback(async () => {
        try {
            await AuthService.refreshAccessToken();
        } catch {
            // If refresh fails, the 401 interceptor will handle it later
        }
        resetTimers();
    }, [resetTimers]);

    useEffect(() => {
        if (!AuthService.isAuthenticated()) return;

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

        const handleActivity = () => {
            if (!showWarning) {
                resetTimers();
            }
        };

        events.forEach(event => {
            window.addEventListener(event, handleActivity);
        });

        resetTimers();

        return () => {
            events.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            clearTimeout(logoutTimerRef.current);
            clearTimeout(warningTimerRef.current);
            clearInterval(countdownRef.current);
        };
    }, [resetTimers, showWarning]);

    return {
        showWarning,
        timeLeft,
        extendSession,
        logout: handleLogout
    };
};


