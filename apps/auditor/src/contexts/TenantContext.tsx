import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import type { Tenant } from '../types';
import { TenantService } from '../services/tenantApi';

const STORAGE_KEY = 'auditor_tenant_slug';

interface TenantContextValue {
    tenants: Tenant[];
    currentTenant: Tenant | null;
    loading: boolean;
    error: string | null;
    selectTenant: (slug: string) => void;
    refreshTenants: () => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadTenants = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await TenantService.getAvailableTenants();
            setTenants(list);

            const savedSlug = localStorage.getItem(STORAGE_KEY);
            const saved = savedSlug ? list.find((t) => t.slug === savedSlug) : null;

            if (saved) {
                setCurrentTenant(saved);
            } else if (list.length === 1) {
                // Auto-select when only one tenant is available.
                setCurrentTenant(list[0]);
                localStorage.setItem(STORAGE_KEY, list[0].slug);
            } else if (list.length > 1) {
                // Leave unselected — TenantSelector page will prompt.
                setCurrentTenant(null);
            } else {
                setCurrentTenant(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load tenants');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTenants();
    }, [loadTenants]);

    const selectTenant = useCallback(
        (slug: string) => {
            const tenant = tenants.find((t) => t.slug === slug);
            if (tenant) {
                setCurrentTenant(tenant);
                localStorage.setItem(STORAGE_KEY, slug);
            }
        },
        [tenants],
    );

    const value = useMemo<TenantContextValue>(
        () => ({
            tenants,
            currentTenant,
            loading,
            error,
            selectTenant,
            refreshTenants: loadTenants,
        }),
        [tenants, currentTenant, loading, error, selectTenant, loadTenants],
    );

    return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTenant = (): TenantContextValue => {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        throw new Error('useTenant must be used within a TenantProvider');
    }
    return ctx;
};
