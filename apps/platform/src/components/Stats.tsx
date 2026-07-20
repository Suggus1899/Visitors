import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Building2, TrendingUp, Users } from 'lucide-react';
import { getStats } from '../api/mockApi';
import { Card } from './ui/Card';
import type { PlatformStats } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const monthlyTenantData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  datasets: [
    {
      label: 'New tenants',
      data: [2, 3, 1, 4, 2, 5, 3],
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

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: { color: '#b1bcc6', font: { family: 'IBM Plex Sans' } },
    },
    title: {
      display: true,
      text: 'Tenant growth (last 7 months)',
      color: '#e5edf5',
      font: { family: 'IBM Plex Sans', size: 14 },
    },
  },
  scales: {
    x: {
      grid: { color: '#222b33' },
      ticks: { color: '#7c8a97' },
    },
    y: {
      grid: { color: '#222b33' },
      ticks: { color: '#7c8a97' },
      beginAtZero: true,
    },
  },
};

export function Stats() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">
          Platform Stats
        </h2>
        <p className="text-sm text-[var(--text-3)]">
          High-level growth and activity metrics
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-[var(--text-3)]">Loading stats...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-3)]">Total Tenants</p>
                  <p className="mt-2 font-display text-3xl font-bold text-[var(--text-1)]">
                    {stats?.totalTenants ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                  <Building2 size={22} />
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-3)]">Total Users</p>
                  <p className="mt-2 font-display text-3xl font-bold text-[var(--text-1)]">
                    {stats?.totalUsers ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                  <Users size={22} />
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-3)]">Active Tenants</p>
                  <p className="mt-2 font-display text-3xl font-bold text-[var(--text-1)]">
                    {stats?.activeTenants ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                  <TrendingUp size={22} />
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-3)]">Demo Tenants</p>
                  <p className="mt-2 font-display text-3xl font-bold text-[var(--text-1)]">
                    {stats?.demoTenants ?? 0}
                  </p>
                </div>
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                  <TrendingUp size={22} />
                </div>
              </div>
            </Card>
          </div>

          <Card className="h-96">
            <Line data={monthlyTenantData} options={chartOptions} />
          </Card>
        </>
      )}
    </div>
  );
}
