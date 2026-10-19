import PrivacyDashboard from '@/components/PrivacyDashboard';
import { requireUser } from '@/server/session';

export default async function PrivacyPage() {
  await requireUser('/privacy', ['operador', 'admin', 'auditor', 'root']);
  return <PrivacyDashboard />;
}
