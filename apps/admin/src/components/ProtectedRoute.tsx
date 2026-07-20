import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@logmaster/auth';
import { useTenant } from '../context/TenantContext';
import type { ReactNode } from 'react';

/**
 * ProtectedRoute — guards routes that require authentication and admin role.
 *
 * - Redirects to /login if not authenticated
 * - Redirects to /login if role is not 'admin' or 'root'
 * - Redirects to /select-tenant if authenticated but no tenant selected
 *   (and user has multiple tenants)
 */
const ProtectedRoute = ({ children }: { children: ReactNode }) => {
    const { user, loading } = useAuth();
    const { selectedSlug, loadingTenants, tenants } = useTenant();
    const location = useLocation();

    if (loading || loadingTenants) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-0)]">
                <div className="animate-spin w-8 h-8 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full" />
            </div>
        );
    }

    // Not authenticated
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Role guard: only admin and root can access this app
    if (user.role !== 'admin' && user.role !== 'root') {
        return <Navigate to="/login" state={{ from: location, error: 'Access denied: admin role required' }} replace />;
    }

    // Authenticated but no tenant selected and has multiple tenants
    if (!selectedSlug && tenants.length > 1) {
        return <Navigate to="/select-tenant" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
