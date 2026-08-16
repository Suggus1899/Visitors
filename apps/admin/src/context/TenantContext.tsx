'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Tenant, TenantMembership } from '../types/tenant';

interface TenantContextValue {
    tenant: Tenant | null;
    tenants: TenantMembership[];
    selectedSlug: string | null;
    selectTenant: (slug: string) => void;
    clearTenant: () => void;
    loadingTenants: boolean;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

const STORAGE_KEY = 'logmaster.selectedTenantSlug';

/**
 * TenantContext manages the selected tenant for the current session.
 *
 * After login, the user may belong to one or more tenants. If multiple,
 * a tenant selector is shown. The selected tenant slug is stored in
 * localStorage and used to scope all API calls to /v1/:tenantSlug/...
 *
 * TODO: Replace mock tenant fetching with real API call to
 *   GET /v1/auth/me/memberships
 * once the backend multi-tenant migration is complete.
 */
export const TenantProvider = ({ children }: { children: ReactNode }) => {
    const [tenants, setTenants] = useState<TenantMembership[]>([]);
    const [tenant, setTenant] = useState<Tenant | null>(null);
    // Lazy-init from localStorage so the slug is available on the very first
    // render — reading it inside a useEffect runs after mount, which left
    // tenant-scoped queries firing once with a null slug (and getting cached
    // as 404s, since React Query doesn't retry a cached error on its own).
    // When localStorage has nothing (first-ever visit, or cleared), fall back
    // to the mock's single 'default' tenant below instead of null — the mock
    // fetch effect resolves this same value a tick later regardless, but by
    // then any query fired on first render has already been fired (and
    // cached as an error) with the un-scoped path. Update this fallback if
    // the mock is ever replaced with a real multi-tenant membership fetch.
    const [selectedSlug, setSelectedSlug] = useState<string | null>(() =>
        typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) ?? 'default' : null
    );
    const [loadingTenants, setLoadingTenants] = useState(true);

    // Fetch tenant memberships for the current user.
    // TODO: Replace with real API: GET /v1/auth/me/memberships
    // For now we use a mock single-tenant so the app works end-to-end.
    useEffect(() => {
        const fetchTenants = async () => {
            setLoadingTenants(true);
            try {
                // TODO: Replace mock with real API call once backend supports memberships.
                // const response = await api.get('/auth/me/memberships');
                // const memberships = response.data.data as TenantMembership[];

                // Mock: single default tenant
                const mockTenants: TenantMembership[] = [
                    {
                        tenant: {
                            id: 'default',
                            name: 'Organización',
                            slug: 'default',
                            plan: 'pro',
                            limits: {
                                maxVisitors: 10000,
                                maxBackups: 50,
                                retentionDays: 365,
                                maxUsers: 50,
                            },
                        },
                        role: 'admin',
                    },
                ];
                setTenants(mockTenants);

                // Auto-select if only one tenant
                if (mockTenants.length === 1) {
                    const slug = mockTenants[0].tenant.slug;
                    setSelectedSlug(slug);
                    localStorage.setItem(STORAGE_KEY, slug);
                }
            } catch {
                // If we can't fetch tenants, default to empty
                setTenants([]);
            } finally {
                setLoadingTenants(false);
            }
        };
        fetchTenants();
    }, []);

    // Update the active tenant object when the slug changes
    useEffect(() => {
        if (selectedSlug) {
            const membership = tenants.find((m) => m.tenant.slug === selectedSlug);
            if (membership) {
                setTenant(membership.tenant);
            }
        } else {
            setTenant(null);
        }
    }, [selectedSlug, tenants]);

    const selectTenant = useCallback((slug: string) => {
        setSelectedSlug(slug);
        localStorage.setItem(STORAGE_KEY, slug);
    }, []);

    const clearTenant = useCallback(() => {
        setSelectedSlug(null);
        setTenant(null);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return (
        <TenantContext.Provider
            value={{ tenant, tenants, selectedSlug, selectTenant, clearTenant, loadingTenants }}
        >
            {children}
        </TenantContext.Provider>
    );
};

export const useTenant = (): TenantContextValue => {
    const context = useContext(TenantContext);
    if (!context) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return context;
};
