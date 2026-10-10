import AdminDashboard from '@/components/AdminDashboard';
import { requireUser } from '@/server/session';

export default async function AdminPage() {
  await requireUser('/admin', ['admin', 'root']);
  return <AdminDashboard />;
}
