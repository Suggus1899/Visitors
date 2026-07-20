'use client';

import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '@logmaster/auth';
import { PasswordChangeModal } from '@logmaster/ui';

import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import KeyboardShortcutsModal from '@/components/KeyboardShortcutsModal';
import { useVisitSSE } from '@/hooks/useVisitSSE';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

/**
 * AdminLayout — authenticated shell with sidebar + topbar.
 *
 * Replaces the former react-router AdminLayout. Renders the active page via
 * `children` (App Router). Wires up real-time SSE, keyboard shortcuts, and the
 * password-change / shortcuts modals.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Real-time SSE for visit events
    useVisitSSE({ enabled: !!user });

    // Keyboard shortcuts
    const handleShowShortcuts = useCallback(() => setShowShortcuts(true), []);
    useKeyboardShortcuts({ onShowShortcuts: handleShowShortcuts });

    // Listen for password-change-required events from the API interceptor
    useEffect(() => {
        const handlePasswordChangeRequired = () => setShowPasswordChangeModal(true);
        window.addEventListener('password-change-required', handlePasswordChangeRequired);
        return () => window.removeEventListener('password-change-required', handlePasswordChangeRequired);
    }, []);

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] font-sans relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-30 pointer-events-none" />
            <div className="absolute inset-0 bg-noise opacity-20 mix-blend-soft-light pointer-events-none" />
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[color:var(--accent-2)] opacity-15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[color:var(--accent-0)] opacity-12 blur-3xl pointer-events-none" />

            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3000,
                    style: {
                        background: 'var(--surface-1)',
                        color: 'var(--text-1)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-1)',
                    },
                    success: { iconTheme: { primary: '#4dd7ff', secondary: '#081116' } },
                    error: { iconTheme: { primary: '#ff6b6b', secondary: '#0b0f12' } },
                }}
            />

            <div className="flex relative z-10">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                <div className="flex-1 min-w-0">
                    <TopBar
                        onToggleSidebar={() => setSidebarOpen(true)}
                        onShowShortcuts={() => setShowShortcuts(true)}
                        onShowPasswordChange={() => setShowPasswordChangeModal(true)}
                    />

                    <main className="p-4 md:p-8 overflow-auto min-h-[calc(100vh-65px)]">
                        {children}
                    </main>
                </div>
            </div>

            <KeyboardShortcutsModal
                isOpen={showShortcuts}
                onClose={() => setShowShortcuts(false)}
            />

            <PasswordChangeModal
                show={showPasswordChangeModal}
                onPasswordChanged={() => {
                    setShowPasswordChangeModal(false);
                    window.location.reload();
                }}
            />
        </div>
    );
}
