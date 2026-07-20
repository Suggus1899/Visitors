'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '../contexts/TenantContext';
import { Building2, Loader2, ChevronRight } from 'lucide-react';

/**
 * Tenant selector page.
 *
 * Shown after login when the auditor has access to multiple tenants.
 * If only one tenant is available the TenantContext auto-selects it
 * and this page redirects immediately.
 */
export const TenantSelectorPage = () => {
    const { tenants, currentTenant, loading, selectTenant } = useTenant();
    const router = useRouter();

    useEffect(() => {
        if (!loading && currentTenant) {
            router.replace('/');
        }
    }, [loading, currentTenant, router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-[color:var(--bg-0)] flex items-center justify-center">
                <Loader2 className="animate-spin text-[color:var(--accent-0)]" size={32} />
            </div>
        );
    }

    if (tenants.length === 0) {
        return (
            <div className="min-h-screen bg-[color:var(--bg-0)] flex items-center justify-center p-6">
                <div className="panel-tech rounded-2xl p-8 max-w-md text-center">
                    <p className="text-[color:var(--text-1)] font-medium mb-2">
                        No tenants available
                    </p>
                    <p className="text-sm text-[color:var(--text-3)]">
                        Your account does not have access to any tenants.
                        Please contact your administrator.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-30" />
            <div className="absolute -top-28 -left-28 h-72 w-72 rounded-full bg-[color:var(--accent-2)] opacity-20 blur-3xl" />

            <div className="relative w-full max-w-lg">
                <div className="panel-tech rounded-2xl p-8 animate-slideUp relative z-10">
                    <div className="absolute inset-x-0 top-0 h-1 bg-[color:var(--accent-0)]" />

                    <div className="flex flex-col items-center mb-6">
                        <Building2 className="text-[color:var(--accent-0)] mb-3" size={36} />
                        <h2 className="text-2xl font-display uppercase tracking-[0.18em] text-[color:var(--text-1)]">
                            Select Tenant
                        </h2>
                        <p className="text-[color:var(--text-3)] text-sm mt-1">
                            Choose the tenant you want to audit
                        </p>
                    </div>

                    <div className="space-y-3">
                        {tenants.map((tenant) => (
                            <button
                                key={tenant.slug}
                                onClick={() => {
                                    selectTenant(tenant.slug);
                                    router.replace('/');
                                }}
                                className="w-full flex items-center justify-between p-4 rounded-xl border border-[color:var(--border-1)] bg-[color:var(--surface-2)] hover:border-[color:var(--accent-0)] hover:bg-[color:var(--surface-3)] transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-[color:var(--surface-3)] border border-[color:var(--border-1)]">
                                        <Building2 size={20} className="text-[color:var(--accent-0)]" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-[color:var(--text-1)]">
                                            {tenant.name}
                                        </p>
                                        <p className="text-xs text-[color:var(--text-3)] font-mono">
                                            {tenant.slug}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight
                                    size={20}
                                    className="text-[color:var(--text-3)] group-hover:text-[color:var(--accent-0)] transition-colors"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
