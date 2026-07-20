'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Settings as SettingsIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { platformApi } from '../api/platformApi';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';
import { ErrorState } from './ui/States';
import type { PlatformSettings, TenantPlan } from '../types';

const PLAN_LIST: TenantPlan[] = ['free', 'starter', 'professional', 'enterprise', 'demo'];

export function Settings() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PlatformSettings | null>(null);

  const { data: settings, isLoading, isError, refetch } = useQuery<PlatformSettings>({
    queryKey: ['platform-settings'],
    queryFn: () => platformApi.getSettings(),
  });

  // Sync draft when settings load
  if (settings && !draft) {
    setDraft(settings);
  }

  const updateMutation = useMutation({
    mutationFn: (updated: PlatformSettings) => platformApi.updateSettings(updated),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      setDraft(data);
      toast.success('Settings saved successfully.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save settings.'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Settings</h2>
        </div>
        <Card><Skeleton rows={6} /></Card>
        <Card><Skeleton rows={4} /></Card>
      </div>
    );
  }

  if (isError || !settings || !draft) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Settings</h2>
        </div>
        <ErrorState message="Failed to load settings." onRetry={() => refetch()} />
      </div>
    );
  }

  const updatePlanLimit = (plan: TenantPlan, field: 'maxUsers' | 'visitsPerMonth', value: number) => {
    setDraft({
      ...draft,
      defaultPlanLimits: {
        ...draft.defaultPlanLimits,
        [plan]: { ...draft.defaultPlanLimits[plan], [field]: value },
      },
    });
  };

  const toggleFlag = (flag: keyof PlatformSettings['featureFlags']) => {
    setDraft({
      ...draft,
      featureFlags: { ...draft.featureFlags, [flag]: !draft.featureFlags[flag] },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(draft);
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-[var(--text-1)]">Settings</h2>
          <p className="text-sm text-[var(--text-3)]">Platform-wide configuration and feature flags</p>
        </div>
        <Button type="submit" form="settings-form" disabled={updateMutation.isPending || !hasChanges}>
          {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save changes
        </Button>
      </div>

      <form id="settings-form" onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-[var(--text-1)]">
            <SettingsIcon size={18} /> General
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Demo tenant duration (hours)"
              type="number"
              min={1}
              value={draft.demoTenantDurationHours}
              onChange={(e) => setDraft({ ...draft, demoTenantDurationHours: Number(e.target.value) })}
            />
            <Input
              label="Backup retention (days)"
              type="number"
              min={1}
              value={draft.backupRetentionDays}
              onChange={(e) => setDraft({ ...draft, backupRetentionDays: Number(e.target.value) })}
            />
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">
            Default plan limits
          </h3>
          <div className="overflow-x-auto">
            <table className="table-tech">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Max users</th>
                  <th>Visits / month</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_LIST.map((plan) => (
                  <tr key={plan}>
                    <td className="font-medium capitalize text-[var(--text-1)]">{plan}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={draft.defaultPlanLimits[plan].maxUsers}
                        onChange={(e) => updatePlanLimit(plan, 'maxUsers', Number(e.target.value))}
                        className="input-tech w-24"
                        aria-label={`Max users for ${plan}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={draft.defaultPlanLimits[plan].visitsPerMonth}
                        onChange={(e) => updatePlanLimit(plan, 'visitsPerMonth', Number(e.target.value))}
                        className="input-tech w-32"
                        aria-label={`Visits per month for ${plan}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 font-display text-lg font-semibold text-[var(--text-1)]">Feature flags</h3>
          <div className="space-y-3">
            {([
              ['enableDemoProvisioning', 'Enable demo provisioning', 'Allow new demo tenant signups from the landing page.'],
              ['enablePublicSignup', 'Enable public signup', 'Allow anyone to create a tenant without invitation.'],
              ['enableWebhooks', 'Enable webhooks', 'Send event webhooks to configured tenant endpoints.'],
            ] as const).map(([flag, label, description]) => (
              <div
                key={flag}
                className="flex items-center justify-between rounded-lg border border-[var(--border-1)] p-4"
              >
                <div>
                  <p className="font-medium text-[var(--text-1)]">{label}</p>
                  <p className="text-sm text-[var(--text-3)]">{description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFlag(flag)}
                  className="flex items-center gap-2 text-sm"
                  aria-pressed={draft.featureFlags[flag]}
                  aria-label={label}
                >
                  {draft.featureFlags[flag] ? (
                    <ToggleRight size={32} className="text-[var(--accent-0)]" />
                  ) : (
                    <ToggleLeft size={32} className="text-[var(--text-3)]" />
                  )}
                  <span className={draft.featureFlags[flag] ? 'text-[var(--accent-0)]' : 'text-[var(--text-3)]'}>
                    {draft.featureFlags[flag] ? 'On' : 'Off'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </Card>
      </form>
    </div>
  );
}
