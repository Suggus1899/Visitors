import type { TenantPlan, TenantStatus, UserRole } from '../../types';

const statusStyles: Record<TenantStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  suspended: 'bg-red-500/15 text-red-400 border-red-500/20',
  demo: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  trial: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

const planStyles: Record<TenantPlan, string> = {
  free: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
  starter: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  professional: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  enterprise: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  demo: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
};

const roleStyles: Record<UserRole, string> = {
  admin: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  operador: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  auditor: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  guardia: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
};

interface BadgeProps {
  children?: string;
  type?: 'status' | 'plan' | 'role';
  plan?: TenantPlan;
  status?: TenantStatus;
  role?: UserRole;
}

export function Badge({ children, type, plan, status, role }: BadgeProps) {
  let label = children ?? '';
  let styles = '';

  if (plan) {
    label = plan;
    styles = planStyles[plan];
  } else if (status) {
    label = status;
    styles = statusStyles[status];
  } else if (role) {
    label = role;
    styles = roleStyles[role];
  } else if (type && children) {
    styles =
      type === 'status'
        ? statusStyles[children as TenantStatus]
        : type === 'plan'
        ? planStyles[children as TenantPlan]
        : roleStyles[children as UserRole];
  }

  return <span className={`badge-tech border ${styles}`}>{label}</span>;
}
