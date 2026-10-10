import AuditDashboard from '@/components/AuditDashboard';
import { requireUser } from '@/server/session';

export default async function AuditPage() {
  await requireUser('/audit', ['admin', 'auditor', 'root']);
  return <AuditDashboard />;
}
