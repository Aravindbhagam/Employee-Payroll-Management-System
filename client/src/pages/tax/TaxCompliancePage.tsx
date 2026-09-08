import { FormEvent, useEffect, useState } from 'react';
import { Landmark, Save } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { useFetch } from '../../hooks/useFetch';
import { api, apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { formatCurrency } from '../../utils/format';
import { Spinner } from '../../components/FullPageSpinner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function TaxCompliancePage() {
  const { user } = useAuth();
  const { data, loading, refetch } = useFetch<{ rates: any; statutoryDeductionHistory: any[] }>('/tax-compliance');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const canEdit = can(user, 'TAX_COMPLIANCE', 'EDIT');

  useEffect(() => {
    if (data?.rates) setForm(data.rates);
  }, [data]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.put('/tax-compliance', form);
      setSuccess('Tax & compliance settings updated.');
      refetch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Tax & Compliance" subtitle="Statutory deduction rates and compliance history." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Provident Fund Rate" value={`${data?.rates.providentFundRate ?? 0}%`} icon={Landmark} tone="brand" />
        <StatCard label="Professional Tax" value={formatCurrency(data?.rates.professionalTax)} icon={Landmark} tone="amber" />
        <StatCard label="Income Tax Rate" value={`${data?.rates.incomeTaxRate ?? 0}%`} icon={Landmark} tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Statutory Deduction History</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.statutoryDeductionHistory ?? []}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="totalDeductions" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {canEdit && form && (
          <form onSubmit={handleSave} className="card space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Default Statutory Rates</h3>
            {error && <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-700">{success}</div>}
            <div>
              <label className="label">Provident Fund Rate (%)</label>
              <input
                type="number"
                className="input"
                value={form.providentFundRate}
                onChange={(e) => setForm({ ...form, providentFundRate: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Professional Tax (flat)</label>
              <input
                type="number"
                className="input"
                value={form.professionalTax}
                onChange={(e) => setForm({ ...form, professionalTax: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="label">Income Tax Rate (%)</label>
              <input
                type="number"
                className="input"
                value={form.incomeTaxRate}
                onChange={(e) => setForm({ ...form, incomeTaxRate: Number(e.target.value) })}
              />
            </div>
            <button className="btn-primary" disabled={saving}>
              {saving && <Spinner />} <Save className="h-4 w-4" /> Save Rates
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
