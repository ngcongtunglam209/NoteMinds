import { useState, useEffect, useCallback } from 'react';
import {
  Send, Mail, MailOpen, Eye, TrendingUp, RefreshCw, Loader2,
  Calendar, Search, CheckCircle2, Clock, ShieldCheck, KeyRound,
  Megaphone, ArrowUpRight, ArrowDownRight, BarChart3, Activity,
} from 'lucide-react';
import api from '../api';

const TYPE_CONFIG = {
  verification: { icon: ShieldCheck, label: 'Verification', color: '#a78bfa' },
  password_reset: { icon: KeyRound, label: 'Password Reset', color: '#f87171' },
  blast: { icon: Megaphone, label: 'Blast Email', color: '#60a5fa' },
};

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3.5 hover:border-primary-500/20 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold pl-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5 pl-0.5">{sub}</p>}
    </div>
  );
}

function RateRing({ rate, size = 56 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(100, rate || 0) / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-surface-2" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        strokeWidth={4} strokeLinecap="round"
        className="stroke-primary-500"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" className="fill-current text-[11px] font-bold">
        {parseFloat(rate || 0).toFixed(0)}%
      </text>
    </svg>
  );
}

export default function EmailDashboard() {
  const [stats, setStats] = useState(null);
  const [rangeStats, setRangeStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/email/stats');
      setStats(response.data || { overview: {}, byType: [], recent: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load email stats');
      setStats({ overview: { total_sent: 0, total_opened: 0, open_rate: 0, total_opens: 0 }, byType: [], recent: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRangeStats = useCallback(async () => {
    setRangeLoading(true);
    try {
      const response = await api.get('/api/email/stats/range', {
        params: { startDate: dateRange.startDate, endDate: dateRange.endDate },
      });
      setRangeStats(response.data || { overview: {}, byType: [], daily: [] });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load date range stats');
    } finally {
      setRangeLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try { return new Date(dateString).toLocaleString(); } catch { return dateString; }
  };

  const formatPercent = (value) => `${parseFloat(value || 0).toFixed(1)}%`;

  const getTypeConfig = (type) => TYPE_CONFIG[type] || { icon: Mail, label: type, color: '#9496a1' };

  // Filtered recent emails
  const filteredRecent = (stats?.recent || []).filter((e) => {
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (searchQuery && !e.email?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !e.recipient_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const ov = stats?.overview || {};

  const TABS = [
    { id: 'overview', icon: BarChart3, label: 'Overview' },
    { id: 'recent', icon: Clock, label: 'Recent' },
    { id: 'analytics', icon: Activity, label: 'Analytics' },
  ];

  if (loading && !stats) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={24} className="animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Mail size={18} className="text-primary-400" /> Email Tracking
          </h2>
          <p className="text-xs text-muted mt-0.5">Monitor delivery and engagement</p>
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-line rounded-lg text-xs font-medium hover:border-primary-500/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface border border-line rounded-lg w-fit">
        {TABS.map(({ id, icon: TabIcon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === id
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-muted hover:text-txt hover:bg-surface-2/50'
            }`}
          >
            <TabIcon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {activeTab === 'overview' && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Send} label="Total Sent" value={ov.total_sent || 0} color="#a78bfa" />
            <StatCard icon={MailOpen} label="Opened" value={ov.total_opened || 0} color="#34d399" />
            <StatCard icon={TrendingUp} label="Open Rate" value={formatPercent(ov.open_rate)} color="var(--color-primary-400)" />
            <StatCard icon={Eye} label="Total Opens" value={ov.total_opens || 0} sub="Including re-opens" color="#60a5fa" />
          </div>

          {/* Performance by type */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Activity size={14} className="text-primary-400" /> Performance by Type
            </h3>
            {stats?.byType?.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {stats.byType.map((ts) => {
                  const cfg = getTypeConfig(ts.type);
                  const TypeIcon = cfg.icon;
                  return (
                    <div
                      key={ts.type}
                      className="bg-surface-2/50 border border-line rounded-lg p-4 hover:border-primary-500/20 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${cfg.color}15` }}>
                            <TypeIcon size={15} style={{ color: cfg.color }} />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{cfg.label}</div>
                            <div className="text-[10px] text-muted">{ts.sent} sent</div>
                          </div>
                        </div>
                        <RateRing rate={ts.open_rate} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-bg rounded-md py-1.5">
                          <div className="text-sm font-bold">{ts.sent}</div>
                          <div className="text-[10px] text-muted">Sent</div>
                        </div>
                        <div className="bg-bg rounded-md py-1.5">
                          <div className="text-sm font-bold text-emerald-400">{ts.opened}</div>
                          <div className="text-[10px] text-muted">Opened</div>
                        </div>
                        <div className="bg-bg rounded-md py-1.5">
                          <div className="text-sm font-bold text-blue-400">{ts.total_opens || 0}</div>
                          <div className="text-[10px] text-muted">Opens</div>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 bg-bg rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, ts.open_rate || 0)}%`, background: cfg.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Mail size={28} className="mx-auto mb-2 text-muted opacity-40" />
                <p className="text-sm text-muted">No email data available yet</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── RECENT TAB ─── */}
      {activeTab === 'recent' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-bg border border-line rounded-lg text-xs focus:outline-none focus:border-primary-500/50"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 bg-bg border border-line rounded-lg text-xs focus:outline-none focus:border-primary-500/50"
            >
              <option value="all">All Types</option>
              <option value="verification">Verification</option>
              <option value="password_reset">Password Reset</option>
              <option value="blast">Blast</option>
            </select>
            <span className="text-[10px] text-muted">
              {filteredRecent.length} result{filteredRecent.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          {filteredRecent.length > 0 ? (
            <div className="bg-surface border border-line rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
                      <th className="text-left py-3 px-4">Type</th>
                      <th className="text-left py-3 px-4">Recipient</th>
                      <th className="text-left py-3 px-4">Sent</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Opens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecent.map((email) => {
                      const cfg = getTypeConfig(email.type);
                      const TypeIcon = cfg.icon;
                      return (
                        <tr key={email.tracking_id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <TypeIcon size={13} style={{ color: cfg.color }} />
                              <span className="text-xs font-medium">{cfg.label}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-medium">{email.recipient_name || '-'}</div>
                            <div className="text-[10px] text-muted">{email.email}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-muted">{formatDate(email.sent_at)}</td>
                          <td className="py-3 px-4">
                            {email.opened_at ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded text-[10px] font-bold">
                                <CheckCircle2 size={10} /> Opened
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-2 text-muted rounded text-[10px] font-bold">
                                <Clock size={10} /> Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-bold">{email.open_count || 0}</span>
                            {email.last_opened_at && email.open_count > 1 && (
                              <div className="text-[10px] text-muted mt-0.5">
                                Last: {formatDate(email.last_opened_at)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-xl p-12 text-center">
              <Mail size={28} className="mx-auto mb-2 text-muted opacity-40" />
              <p className="text-sm text-muted">No emails found</p>
              <p className="text-[10px] text-muted mt-1">
                {searchQuery || filterType !== 'all' ? 'Try adjusting your filters' : 'Emails will appear here once sent'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── ANALYTICS TAB ─── */}
      {activeTab === 'analytics' && (
        <div className="space-y-4">
          {/* Date range selector */}
          <div className="bg-surface border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Calendar size={14} className="text-primary-400" /> Date Range Analysis
            </h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">From</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-line rounded-lg text-xs focus:outline-none focus:border-primary-500/50"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">To</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-line rounded-lg text-xs focus:outline-none focus:border-primary-500/50"
                />
              </div>
              <button
                onClick={loadRangeStats}
                disabled={rangeLoading}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {rangeLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                Analyze
              </button>
            </div>
          </div>

          {rangeLoading && (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary-400" />
            </div>
          )}

          {rangeStats && !rangeLoading && (
            <>
              {/* Range stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={Send} label="Sent" value={rangeStats.overview?.total_sent || 0} color="#a78bfa" />
                <StatCard icon={MailOpen} label="Opened" value={rangeStats.overview?.total_opened || 0} color="#34d399" />
                <StatCard icon={TrendingUp} label="Open Rate" value={formatPercent(rangeStats.overview?.open_rate)} color="var(--color-primary-400)" />
                <StatCard icon={Eye} label="Total Opens" value={rangeStats.overview?.total_opens || 0} color="#60a5fa" />
              </div>

              {/* Daily chart */}
              <div className="bg-surface border border-line rounded-xl p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                  <TrendingUp size={14} className="text-primary-400" /> Daily Performance
                </h3>
                {rangeStats.daily?.length > 0 ? (
                  <div className="space-y-1">
                    {rangeStats.daily.map((day) => (
                      <div key={day.date} className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-surface-2/50 transition-colors">
                        <span className="text-xs font-mono text-muted w-24 shrink-0">{day.date}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-5 bg-bg rounded-md overflow-hidden relative">
                            <div
                              className="h-full bg-primary-500/80 rounded-md transition-all duration-500 flex items-center justify-end pr-1.5"
                              style={{ width: `${Math.max(2, Math.min(100, day.open_rate || 0))}%` }}
                            >
                              {day.open_rate >= 15 && (
                                <span className="text-[9px] font-bold text-white">{parseFloat(day.open_rate).toFixed(0)}%</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted shrink-0">
                          <span className="flex items-center gap-1"><Send size={9} /> {day.sent}</span>
                          <span className="flex items-center gap-1 text-emerald-400"><MailOpen size={9} /> {day.opened}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted text-sm">No data for this date range</div>
                )}
              </div>

              {/* Type breakdown */}
              {rangeStats.byType?.length > 0 && (
                <div className="bg-surface border border-line rounded-xl p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-primary-400" /> Type Breakdown
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {rangeStats.byType.map((ts) => {
                      const cfg = getTypeConfig(ts.type);
                      const TypeIcon = cfg.icon;
                      return (
                        <div key={ts.type} className="bg-surface-2/50 border border-line rounded-lg p-3 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cfg.color}15` }}>
                            <TypeIcon size={16} style={{ color: cfg.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{cfg.label}</div>
                            <div className="flex items-center gap-2 text-[10px] text-muted mt-0.5">
                              <span>{ts.sent} sent</span>
                              <span className="text-emerald-400">{ts.opened} opened</span>
                            </div>
                          </div>
                          <div className="text-sm font-bold" style={{ color: cfg.color }}>
                            {formatPercent(ts.open_rate)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {!rangeStats && !rangeLoading && (
            <div className="bg-surface border border-line rounded-xl p-12 text-center">
              <Calendar size={28} className="mx-auto mb-2 text-muted opacity-40" />
              <p className="text-sm text-muted">Select a date range and click Analyze</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}