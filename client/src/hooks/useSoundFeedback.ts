import { useCallback, useRef } from 'react';

// Audio URLs (using Web Audio API for lightweight sounds)
const createBeep = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
};

export const useSoundFeedback = () => {
    const enabled = useRef(true);

    const playSuccess = useCallback(() => {
        if (!enabled.current) return;
        try {
            // Two-tone ascending (success)
            createBeep(523.25, 0.1); // C5
            setTimeout(() => createBeep(659.25, 0.15), 100); // E5
        } catch {
            console.warn('Audio not supported');
        }
    }, []);

    const playCheckout = useCallback(() => {
        if (!enabled.current) return;
        try {
            // Two-tone descending (checkout)
            createBeep(659.25, 0.1); // E5
            setTimeout(() => createBeep(523.25, 0.15), 100); // C5
        } catch {
            console.warn('Audio not supported');
        }
    }, []);

    const playError = useCallback(() => {
        if (!enabled.current) return;
        try {
            // Low buzz (error)
            createBeep(200, 0.3, 'square');
        } catch {
            console.warn('Audio not supported');
        }
    }, []);

    const playClick = useCallback(() => {
        if (!enabled.current) return;
        try {
            createBeep(800, 0.05);
        } catch {
            console.warn('Audio not supported');
        }
    }, []);

    const toggleSound = useCallback(() => {
        enabled.current = !enabled.current;
        return enabled.current;
    }, []);

    return { playSuccess, playCheckout, playError, playClick, toggleSound, enabled };
};
