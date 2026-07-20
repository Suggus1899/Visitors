import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PrivateRoute } from './components/PrivateRoute';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Tenants } from './components/Tenants';
import { TenantDetail } from './components/TenantDetail';
import { Subscriptions } from './components/Subscriptions';

// Lazy-load secondary pages for a smaller initial bundle.
const Users = lazy(() => import('./components/Users').then((m) => ({ default: m.Users })));
const AuditLogs = lazy(() =>
  import('./components/AuditLogs').then((m) => ({ default: m.AuditLogs }))
);
const Settings = lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
);

function PageFallback() {
  return (
    <div className="flex h-64 items-center justify-center text-[var(--text-3)]">
      <div className="h-8 w-8 rounded-full border-2 border-[var(--accent-0)] border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/tenants/:id" element={<TenantDetail />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route
            path="/users"
            element={
              <Suspense fallback={<PageFallback />}>
                <Users />
              </Suspense>
            }
          />
          <Route
            path="/audit-logs"
            element={
              <Suspense fallback={<PageFallback />}>
                <AuditLogs />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<PageFallback />}>
                <Settings />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
