'use client';

import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Building2,
  Users,
  MonitorPlay,
  Activity,
  DollarSign,
  TrendingDown,
  UserPlus,
  Pause,
} from 'lucide-react';
import { platformApi } from '../api/platformApi';
import { Card } from './ui/Card';
import { CardSkeleton, TableSkeleton } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import type { PlatformStats } from '../types';

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PLAN_COLORS: Record<string, string> = {
  free: '#64748b',
  starter: '#22d3ee',
  professional: '#f59e0b',
  enterprise: '#a855f7',
  demo: '#3b82f6',
};

const StatCard = ({
  label,
  value,
  icon: Icon,
  tone = 'emerald',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: 'emerald' | 'blue' | 'amber' | 'rose' | 'purple' | 'cyan';
}) => {
  const toneClasses = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    rose: 'text-rose-400 bg-rose-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
  };
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-3)]">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-[var(--text-1)]">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${toneClasses[tone]}`}>
          <Icon size={22} />
        </div>
      </div>
    </Card>
  );
};

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#b1bcc6', font: { family: 'IBM Plex Sans' } } },
  },
};

export function Dashboard() {
  const { data: stats, isLoading, isError, refetch } = useQuery<PlatformStats>({
    queryKey: ['platform-stats'],
    queryFn: () => platformApi.getStats(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Platform Overview</h2>
          <p className="text-sm text-[var(--text-3)]">Real-time SaaS health metrics</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <Card>
          <TableSkeleton rows={5} cols={4} />
        </Card>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Platform Overview</h2>
        </div>
        <ErrorState message="Failed to load dashboard metrics." onRetry={() => refetch()} />
      </div>
    );
  }

  const growthData = {
    labels: stats.tenantsGrowth.map((g) => g.month),
    datasets: [
      {
        label: 'Tenants',
        data: stats.tenantsGrowth.map((g) => g.count),
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74, 222, 128, 0.15)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#101417',
        pointBorderColor: '#4ade80',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
    ],
  };

  const planDistributionData = {
    labels: stats.planDistribution.map((p) => p.plan),
    datasets: [
      {
        data: stats.planDistribution.map((p) => p.count),
        backgroundColor: stats.planDistribution.map((p) => PLAN_COLORS[p.plan] ?? '#64748b'),
        borderWidth: 0,
      },
    ],
  };

  const revenueData = {
    labels: stats.revenueByPlan.map((r) => r.plan),
    datasets: [
      {
        label: 'MRR (USD)',
        data: stats.revenueByPlan.map((r) => r.revenue),
        backgroundColor: stats.revenueByPlan.map((r) => PLAN_COLORS[r.plan] ?? '#64748b'),
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Platform Overview</h2>
        <p className="text-sm text-[var(--text-3)]">Real-time SaaS health metrics</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Tenants" value={stats.totalTenants} icon={Building2} tone="emerald" />
        <StatCard label="Active Tenants" value={stats.activeTenants} icon={Activity} tone="amber" />
        <StatCard label="Suspended" value={stats.suspendedTenants} icon={Pause} tone="rose" />
        <StatCard label="Demo Tenants" value={stats.demoTenants} icon={MonitorPlay} tone="blue" />
        <StatCard label="Total Users" value={stats.totalUsers} icon={Users} tone="cyan" />
        <StatCard label="MRR Estimate" value={`$${stats.mrrEstimate.toLocaleString()}`} icon={DollarSign} tone="emerald" />
        <StatCard label="Churn Rate" value={`${stats.churnRate}%`} icon={TrendingDown} tone="rose" />
        <StatCard label="New This Month" value={stats.newSignupsThisMonth} icon={UserPlus} tone="purple" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 h-80">
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">
            Tenant growth
          </h3>
          <div className="h-64">
            <Line
              data={growthData}
              options={{
                ...baseChartOptions,
                scales: {
                  x: { grid: { color: '#222b33' }, ticks: { color: '#7c8a97' } },
                  y: { grid: { color: '#222b33' }, ticks: { color: '#7c8a97' }, beginAtZero: true },
                },
              }}
            />
          </div>
        </Card>
        <Card className="h-80">
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">
            Plan distribution
          </h3>
          <div className="h-64 flex items-center justify-center">
            <Doughnut
              data={planDistributionData}
              options={{
                ...baseChartOptions,
                cutout: '60%',
                plugins: { legend: { position: 'bottom', labels: { color: '#b1bcc6' } } },
              }}
            />
          </div>
        </Card>
      </div>

      <Card className="h-80">
        <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">
          Revenue by plan (MRR)
        </h3>
        <div className="h-64">
          <Bar
            data={revenueData}
            options={{
              ...baseChartOptions,
              scales: {
                x: { grid: { color: '#222b33' }, ticks: { color: '#7c8a97' } },
                y: { grid: { color: '#222b33' }, ticks: { color: '#7c8a97' }, beginAtZero: true },
              },
            }}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">
          Recent signups (last 7 days)
        </h3>
        {stats.recentSignups.length === 0 ? (
          <EmptyState title="No recent signups" description="New users will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-tech">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Tenant</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSignups.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium text-[var(--text-1)]">{user.name}</td>
                    <td className="text-[var(--text-2)]">{user.email}</td>
                    <td className="text-[var(--text-2)]">{user.tenantName}</td>
                    <td className="text-[var(--text-2)]">{user.role}</td>
                    <td className="text-[var(--text-3)]">
                      {format(parseISO(user.createdAt), 'MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
