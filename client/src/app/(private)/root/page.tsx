import SuperAdminDashboard from '@/components/SuperAdminDashboard';
import { requireUser } from '@/server/session';

export default async function RootAdminPage() {
  await requireUser('/root', ['root']);
  return <SuperAdminDashboard />;
}
