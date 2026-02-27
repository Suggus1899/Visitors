import { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

interface SessionTimeoutOptions {
    warningTime?: number;  // Show warning this many ms before logout (default: 5 min)
    logoutTime?: number;   // Auto logout after this many ms of inactivity (default: 30 min)
}

export const useSessionTimeout = (options: SessionTimeoutOptions = {}) => {
    const { warningTime = 5 * 60 * 1000, logoutTime = 30 * 60 * 1000 } = options;
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
        // Clear existing timers
        clearTimeout(logoutTimerRef.current);
        clearTimeout(warningTimerRef.current);
        clearInterval(countdownRef.current);
        setShowWarning(false);

        // Set warning timer
        warningTimerRef.current = setTimeout(() => {
            setShowWarning(true);
            setTimeLeft(Math.floor(warningTime / 1000));

            // Start countdown
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

        // Set logout timer
        logoutTimerRef.current = setTimeout(handleLogout, logoutTime);
    }, [logoutTime, warningTime, handleLogout]);

    const extendSession = useCallback(() => {
        resetTimers();
    }, [resetTimers]);

    useEffect(() => {
        // Only run if user is logged in
        const token = localStorage.getItem('token');
        if (!token) return;

        // Set up event listeners for user activity
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

        const handleActivity = () => {
            if (!showWarning) {
                resetTimers();
            }
        };

        events.forEach(event => {
            window.addEventListener(event, handleActivity);
        });

        // Initial timer setup
        resetTimers();

        // Cleanup
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


