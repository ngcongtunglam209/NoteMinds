import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Users, ArrowLeft, Search, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, Ban, ShieldCheck, Globe, Trash2, Plus,
  UserX, UserCheck, Clock, Wifi, BarChart3, FileText, Megaphone,
  ScrollText, Eye, EyeOff, Edit3, Save, X, TrendingUp,
  ChevronLeft, ChevronRight, Activity, Cpu, HardDrive, Mail, ToggleLeft,
  ToggleRight, Download, MapPin, Wrench, AlertOctagon, Flag,
  Zap, Server, Database, Brain, Send, CheckSquare, Square,
  Info, ArrowRight, Bell, BellRing, Filter,
} from 'lucide-react';
import {
  adminGetUsers, adminSetPlan, adminSetRole, adminGetPlans,
  adminBanUser, adminUnbanUser, adminGetBannedIps, adminBanIp, adminUnbanIp,
  adminGetStats, adminGetDocuments, adminDeleteDocument, adminToggleDocPublic,
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  adminGetAuditLogs,
  adminGetRealtime, adminBulkSetPlan, adminBulkBanUsers, adminBulkDeleteDocs,
  adminBulkTogglePublicDocs, adminGetUserDetail, adminGetAiUsage,
  adminGetReports, adminReviewReport, adminGetSystemHealth,
  adminSendEmailBlast, adminGetEmailBlasts,
  adminGetFeatureFlags, adminCreateFeatureFlag, adminUpdateFeatureFlag, adminDeleteFeatureFlag,
  adminExportUsers, adminExportDocuments, adminExportActivity,
  adminGetLoginActivity, adminUpdateSystemSetting, getSystemSettings,
  adminGetNotifications, adminGetNotificationStats, adminSendNotification,
  adminDeleteNotification, adminCleanupNotifications,
} from '../api';
import ConfirmModal from './ConfirmModal';
import { useLanguage } from '../LanguageContext';
import EmailDashboard from './EmailDashboard';

const PLAN_STYLES = {
  free:      { badge: '📦', label: 'Free',      color: '#9496a1' },
  basic:     { badge: '⭐', label: 'Basic',     color: '#fbbf24' },
  pro:       { badge: '💎', label: 'Pro',        color: '#818cf8' },
  unlimited: { badge: '👑', label: 'Unlimited',  color: 'var(--color-primary-500)' },
};

export default function AdminPanel({ onBack }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [tab, setTab] = useState('realtime');
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [bannedIps, setBannedIps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [userDetailId, setUserDetailId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [u, p, ips] = await Promise.all([adminGetUsers(), adminGetPlans(), adminGetBannedIps()]);
      setUsers(u);
      setPlans(p);
      setBannedIps(ips);
    } catch { setToast({ type: 'error', msg: t('admin.loadDataError') }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const showToast = (type, msg) => setToast({ type, msg });

  const askConfirm = useCallback((title, message, variant, onConfirm) => {
    setConfirm({ title, message, variant, action: onConfirm });
  }, []);

  const executeConfirm = async () => {
    if (!confirm?.action) return;
    await confirm.action();
    setConfirm(null);
  };

  const handleSetPlan = (userId, plan) => {
    const user = users.find((u) => u.id === userId);
    const planLabel = PLAN_STYLES[plan]?.label || plan;
    askConfirm(
      t('admin.changePlanTitle'),
      t('admin.changePlanMessage', { username: user?.username || userId, plan: planLabel }),
      'info',
      async () => {
        try {
          const updated = await adminSetPlan(userId, plan);
          setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
          showToast('success', t('admin.planUpdated', { plan: planLabel }));
        } catch { showToast('error', t('admin.planUpdateError')); }
      }
    );
  };

  const handleSetRole = (userId, role) => {
    const user = users.find((u) => u.id === userId);
    askConfirm(
      t('admin.changeRoleTitle'),
      t('admin.changeRoleMessage', { username: user?.username || userId, role }),
      role === 'admin' ? 'warning' : 'info',
      async () => {
        try {
          const updated = await adminSetRole(userId, role);
          setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
          showToast('success', t('admin.roleUpdated', { role }));
        } catch { showToast('error', t('admin.roleUpdateError')); }
      }
    );
  };

  const handleBanUser = (userId, reason) => {
    const user = users.find((u) => u.id === userId);
    askConfirm(
      t('admin.banAccountTitle'),
      t('admin.banAccountMessage', { username: user?.username || userId, reason: reason ? ` ${t('admin.reasonLabel')}: ${reason}` : '' }),
      'danger',
      async () => {
        try {
          const updated = await adminBanUser(userId, reason);
          setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
          showToast('success', t('admin.banAccountSuccess'));
        } catch { showToast('error', t('admin.banAccountError')); }
      }
    );
  };

  const handleUnbanUser = (userId) => {
    const user = users.find((u) => u.id === userId);
    askConfirm(
      t('admin.unbanAccountTitle'),
      t('admin.unbanAccountMessage', { username: user?.username || userId }),
      'info',
      async () => {
        try {
          const updated = await adminUnbanUser(userId);
          setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
          showToast('success', t('admin.unbanAccountSuccess'));
        } catch { showToast('error', t('admin.unbanAccountError')); }
      }
    );
  };

  const handleBanIp = (ip, reason) => {
    askConfirm(
      t('admin.banIpTitle'),
      t('admin.banIpMessage', { ip, reason: reason ? ` ${t('admin.reasonLabel')}: ${reason}` : '' }),
      'danger',
      async () => {
        try {
          await adminBanIp(ip, reason);
          await load();
          showToast('success', t('admin.banIpSuccess', { ip }));
        } catch (err) { showToast('error', err.response?.data?.error || t('admin.banIpError')); }
      }
    );
  };

  const handleUnbanIp = (ip) => {
    askConfirm(
      t('admin.unbanIpTitle'),
      t('admin.unbanIpMessage', { ip }),
      'info',
      async () => {
        try {
          await adminUnbanIp(ip);
          setBannedIps((prev) => prev.filter((b) => b.ip_address !== ip));
          showToast('success', t('admin.unbanIpSuccess', { ip }));
        } catch { showToast('error', t('admin.unbanIpError')); }
      }
    );
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.displayName || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.lastIp || '').includes(search)
  );

  // Bulk actions
  const toggleSelectUser = (userId) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };
  const selectAllUsers = () => {
    if (selectedUserIds.size === filtered.length) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(filtered.map(u => u.id)));
  };
  const handleBulkSetPlan = (plan) => {
    askConfirm(t('admin.bulkSetPlanTitle'), t('admin.bulkSetPlanMessage', { count: selectedUserIds.size, plan }), 'warning', async () => {
      try {
        await adminBulkSetPlan([...selectedUserIds], plan);
        showToast('success', t('admin.bulkSetPlanSuccess', { count: selectedUserIds.size }));
        setSelectedUserIds(new Set());
        load();
      } catch { showToast('error', t('admin.bulkUpdateError')); }
    });
  };
  const handleBulkBan = () => {
    askConfirm(t('admin.bulkBanTitle'), t('admin.bulkBanMessage', { count: selectedUserIds.size }), 'danger', async () => {
      try {
        await adminBulkBanUsers([...selectedUserIds], 'Bulk ban');
        showToast('success', t('admin.bulkBanSuccess', { count: selectedUserIds.size }));
        setSelectedUserIds(new Set());
        load();
      } catch { showToast('error', t('admin.bulkBanError')); }
    });
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const totalUsers = users.length;
  const bannedUsers = users.filter((u) => u.isBanned).length;

  const SIDEBAR_SECTIONS = [
    {
      title: t('admin.sidebarOverview'),
      items: [
        { id: 'realtime', icon: <Activity size={17} />, label: t('admin.dashboard') },
        { id: 'stats', icon: <BarChart3 size={17} />, label: t('admin.stats') },
      ]
    },
    {
      title: t('admin.sidebarUsers'),
      items: [
        { id: 'users', icon: <Users size={17} />, label: t('admin.users'), badge: totalUsers },
        { id: 'ips', icon: <Globe size={17} />, label: t('admin.bannedIps'), badge: bannedIps.length },
        { id: 'logins', icon: <MapPin size={17} />, label: t('admin.loginHistory') },
      ]
    },
    {
      title: t('admin.sidebarContent'),
      items: [
        { id: 'docs', icon: <FileText size={17} />, label: t('admin.documents') },
        { id: 'moderation', icon: <Flag size={17} />, label: t('admin.moderation') },
        { id: 'ai', icon: <Brain size={17} />, label: t('admin.aiUsageMonitoring') },
      ]
    },
    {
      title: t('admin.sidebarCommunication'),
      items: [
        { id: 'notifications', icon: <Bell size={17} />, label: t('admin.notifications') },
        { id: 'email', icon: <Mail size={17} />, label: t('admin.emailBlast') },
        { id: 'emaildashboard', icon: <BarChart3 size={17} />, label: 'Email Dashboard' },
        { id: 'announcements', icon: <Megaphone size={17} />, label: t('admin.announcements') },
      ]
    },
    {
      title: t('admin.sidebarSystem'),
      items: [
        { id: 'health', icon: <Server size={17} />, label: t('admin.systemHealth') },
        { id: 'flags', icon: <ToggleLeft size={17} />, label: t('admin.featureFlags') },
        { id: 'maintenance', icon: <Wrench size={17} />, label: t('admin.maintenance') },
        { id: 'audit', icon: <ScrollText size={17} />, label: t('admin.auditLogs') },
        { id: 'export', icon: <Download size={17} />, label: t('admin.exportData') },
      ]
    },
  ];

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-64 bg-surface border-r border-line flex flex-col shrink-0 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Sidebar header */}
        <div className="p-4 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary-600/15 border border-primary-500/20 flex items-center justify-center">
                <Shield size={18} className="text-primary-400" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight">{t('admin.panelTitle')}</h1>
                <p className="text-[11px] text-muted">NoteMind</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-2 lg:hidden text-muted">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sidebar navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5 scrollbar-thin">
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted/60 px-3 mb-1.5">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setTab(item.id); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                      tab === item.id
                        ? 'bg-primary-600/15 text-primary-400 border border-primary-500/20'
                        : 'text-muted hover:text-txt hover:bg-surface-2 border border-transparent'
                    }`}
                  >
                    <span className={tab === item.id ? 'text-primary-400' : 'text-muted'}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${tab === item.id ? 'bg-primary-500/20 text-primary-300' : 'bg-surface-2 text-muted'}`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="p-3 border-t border-line">
          <button
            onClick={onBack}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-muted hover:text-txt hover:bg-surface-2 transition-all"
          >
            <ArrowLeft size={17} />
            <span>{t('admin.backHome')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-line">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-surface-2 transition-colors lg:hidden"
              >
                <BarChart3 size={18} />
              </button>
              <h2 className="text-lg font-bold tracking-tight">
                {SIDEBAR_SECTIONS.flatMap(s => s.items).find(i => i.id === tab)?.label || t('admin.dashboard')}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-surface hover:bg-surface-2 border border-line transition-colors" title={t('admin.refresh')}>
                <RefreshCw size={15} className={loading ? 'animate-spin text-primary-400' : 'text-muted'} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatCard icon={<Users size={16} />} label={t('admin.totalUsers')} value={totalUsers} color="#60a5fa" />
            <StatCard icon={<UserX size={16} />} label={t('admin.banned')} value={bannedUsers} color="#f87171" />
            <StatCard icon={<Ban size={16} />} label={t('admin.bannedIps')} value={bannedIps.length} color="#fb923c" />
            {Object.entries(PLAN_STYLES).slice(1).map(([key, { badge, label, color }]) => (
              <StatCard key={key} icon={<span className="text-sm">{badge}</span>} label={label} value={users.filter((u) => u.plan === key).length} color={color} />
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 pb-8">
        {tab === 'users' && (
          <>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  placeholder={t('admin.searchUserPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-surface border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500/50"
                />
              </div>
              {selectedUserIds.size > 0 && (
                <div className="flex items-center gap-2 bg-primary-600/10 border border-primary-500/20 rounded-xl px-3 py-2">
                  <span className="text-xs font-medium text-primary-400">{t('admin.selectedCount', { count: selectedUserIds.size })}</span>
                  <select onChange={(e) => e.target.value && handleBulkSetPlan(e.target.value)} className="bg-bg border border-line rounded-lg px-2 py-1 text-xs cursor-pointer">
                    <option value="">{t('admin.setPlan')}</option>
                    {Object.entries(PLAN_STYLES).map(([k, { label }]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                  <button onClick={handleBulkBan} className="px-2 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs hover:bg-red-500/20">{t('admin.ban')}</button>
                  <button onClick={() => setSelectedUserIds(new Set())} className="p-1 hover:bg-surface-2 rounded-lg text-muted"><X size={12} /></button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 size={28} className="animate-spin text-primary-400" />
              </div>
            ) : (
              <div className="bg-surface border border-line rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
                        <th className="py-3 px-2 w-8"><button onClick={selectAllUsers} className="text-muted hover:text-txt">{selectedUserIds.size === filtered.length && filtered.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}</button></th>
                        <th className="text-left py-3 px-4">{t('admin.user')}</th>
                        <th className="text-left py-3 px-4">{t('admin.plan')}</th>
                        <th className="text-left py-3 px-4">{t('admin.role')}</th>
                        <th className="text-left py-3 px-4 hidden lg:table-cell">{t('admin.ipAndActivity')}</th>
                        <th className="text-left py-3 px-4">{t('admin.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <UserRow
                          key={u.id}
                          user={u}
                          selected={selectedUserIds.has(u.id)}
                          onToggleSelect={() => toggleSelectUser(u.id)}
                          onSetPlan={handleSetPlan}
                          onSetRole={handleSetRole}
                          onBan={handleBanUser}
                          onUnban={handleUnbanUser}
                          onBanIp={handleBanIp}
                          onOpenDetail={() => setUserDetailId(u.id)}
                          dateLocale={dateLocale}
                        />
                      ))}
                      {filtered.length === 0 && (
                        <tr key="empty-users-row">
                          <td colSpan={6} className="text-center py-8 text-muted">
                            <Users size={28} className="mx-auto mb-2 opacity-50" />
                            <p>{t('admin.noUserFound')}</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'ips' && (
          <IpBanPanel bannedIps={bannedIps} onBanIp={handleBanIp} onUnbanIp={handleUnbanIp} loading={loading} />
        )}

        {tab === 'realtime' && <RealtimeDashboard />}
        {tab === 'stats' && <AdminStatsPanel />}
        {tab === 'docs' && <AdminDocsPanel showToast={showToast} askConfirm={askConfirm} />}
        {tab === 'ai' && <AiUsagePanel />}
        {tab === 'moderation' && <ModerationPanel showToast={showToast} askConfirm={askConfirm} />}
        {tab === 'health' && <SystemHealthPanel />}
        {tab === 'email' && <EmailBlastPanel showToast={showToast} />}
        {tab === 'emaildashboard' && <EmailDashboard />}
        {tab === 'notifications' && <AdminNotificationsPanel showToast={showToast} askConfirm={askConfirm} />}
        {tab === 'flags' && <FeatureFlagsPanel showToast={showToast} askConfirm={askConfirm} />}
        {tab === 'export' && <ExportDataPanel showToast={showToast} />}
        {tab === 'announcements' && <AdminAnnouncementsPanel showToast={showToast} askConfirm={askConfirm} />}
        {tab === 'logins' && <LoginActivityPanel />}
        {tab === 'maintenance' && <MaintenanceModePanel showToast={showToast} />}
        {tab === 'audit' && <AdminAuditPanel />}
        </div>
      </div>

      {userDetailId && <UserDetailDrawer userId={userDetailId} onClose={() => setUserDetailId(null)} />}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl border flex items-center gap-2 text-sm shadow-xl animate-fade-in ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        variant={confirm?.variant}
        onConfirm={executeConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3.5 hover:border-primary-500/20 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <p className="text-xl font-bold pl-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

function UserRow({ user, selected, onToggleSelect, onSetPlan, onSetRole, onBan, onUnban, onBanIp, onOpenDetail, dateLocale }) {
  const { t } = useLanguage();
  const [showBanInput, setShowBanInput] = useState(false);
  const [banReason, setBanReason] = useState('');
  const style = PLAN_STYLES[user.plan] || PLAN_STYLES.free;

  const confirmBan = () => {
    onBan(user.id, banReason || undefined);
    setShowBanInput(false);
    setBanReason('');
  };

  return (
    <>
      <tr className={`border-b border-line last:border-b-0 transition-colors ${user.isBanned ? 'bg-red-500/5' : 'hover:bg-surface-2/50'}`}>
        <td className="py-3 px-2 w-8">
          <button onClick={onToggleSelect} className="text-muted hover:text-txt">
            {selected ? <CheckSquare size={14} className="text-primary-400" /> : <Square size={14} />}
          </button>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            <button onClick={onOpenDetail} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs hover:ring-2 ring-primary-500/50 transition-all ${user.isBanned ? 'bg-red-500/20 text-red-400' : 'bg-primary-600/20 text-primary-400'}`}>
              {(user.displayName || user.username).charAt(0).toUpperCase()}
            </button>
            <div className="min-w-0">
              <p className="font-medium text-sm flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{user.displayName || user.username}</span>
                {user.role === 'admin' && (
                  <span className="px-1.5 py-0.5 bg-primary-600/20 text-primary-400 text-[10px] rounded-md font-bold shrink-0">{t('admin.admin')}</span>
                )}
                {user.isBanned && (
                  <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[10px] rounded-md font-bold shrink-0">{t('admin.bannedUpper')}</span>
                )}
              </p>
              <p className="text-xs text-muted truncate">@{user.username} · {user.email}</p>
            </div>
          </div>
        </td>

        <td className="py-3 px-4">
          <select
            value={user.plan}
            onChange={(e) => onSetPlan(user.id, e.target.value)}
            className="bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500/50 cursor-pointer"
            style={{ color: style.color }}
          >
            {Object.entries(PLAN_STYLES).map(([key, { badge, label }]) => (
              <option key={key} value={key}>{badge} {label}</option>
            ))}
          </select>
        </td>

        <td className="py-3 px-4">
          <select
            value={user.role}
            onChange={(e) => onSetRole(user.id, e.target.value)}
            className="bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary-500/50 cursor-pointer"
          >
            <option value="user">{t('admin.user')}</option>
            <option value="admin">{t('admin.admin')}</option>
          </select>
        </td>

        <td className="py-3 px-4 hidden lg:table-cell">
          <div className="space-y-0.5">
            {user.lastIp && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Wifi size={11} />
                <span className="font-mono">{user.lastIp}</span>
                <button
                  onClick={() => onBanIp(user.lastIp, t('admin.linkedToUser', { username: user.username }))}
                  className="p-0.5 rounded hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors"
                  title={t('admin.banThisIp')}
                >
                  <Ban size={11} />
                </button>
              </div>
            )}
            {user.lastLoginAt && (
              <div className="flex items-center gap-1.5 text-xs text-[#666]">
                <Clock size={11} />
                {new Date(user.lastLoginAt).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {!user.lastIp && !user.lastLoginAt && (
              <span className="text-xs text-muted/60">{t('admin.neverLoggedIn')}</span>
            )}
          </div>
        </td>

        <td className="py-3 px-4">
          {user.isBanned ? (
            <button
              onClick={() => onUnban(user.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs transition-colors"
            >
              <UserCheck size={13} /> {t('admin.unban')}
            </button>
          ) : (
            <button
              onClick={() => setShowBanInput(!showBanInput)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs transition-colors"
            >
              <UserX size={13} /> {t('admin.ban')}
            </button>
          )}
        </td>
      </tr>
      {showBanInput && (
        <tr className="bg-red-500/5">
          <td colSpan={5} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder={t('admin.banReasonPlaceholder')}
                className="flex-1 bg-bg border border-red-500/30 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-red-500/50"
                onKeyDown={(e) => e.key === 'Enter' && confirmBan()}
              />
              <button onClick={confirmBan} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium transition-colors">
                {t('admin.confirmBan')}
              </button>
              <button onClick={() => setShowBanInput(false)} className="px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-line text-xs transition-colors">
                {t('common.cancel')}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function IpBanPanel({ bannedIps, onBanIp, onUnbanIp, loading }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [newIp, setNewIp] = useState('');
  const [reason, setReason] = useState('');

  const handleAdd = () => {
    if (!newIp.trim()) return;
    onBanIp(newIp.trim(), reason.trim() || undefined);
    setNewIp('');
    setReason('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Plus size={14} className="text-primary-400" /> {t('admin.newIpBan')}
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder={t('admin.ipPlaceholder')}
            className="flex-1 bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50 font-mono"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.reasonOptional')}
            className="flex-1 bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={!newIp.trim()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <Ban size={14} /> {t('admin.ban')}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={24} className="animate-spin text-primary-400" />
          </div>
        ) : bannedIps.length === 0 ? (
          <div className="text-center py-10 text-muted">
            <ShieldCheck size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('admin.noBannedIps')}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">{t('admin.ip')}</th>
                <th className="text-left py-3 px-4">{t('admin.reason')}</th>
                <th className="text-left py-3 px-4 hidden sm:table-cell">{t('admin.banDate')}</th>
                <th className="text-left py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {bannedIps.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                  <td className="py-3 px-4 font-mono text-red-400">
                    <div className="flex items-center gap-2">
                      <Globe size={14} /> {b.ip_address}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted">{b.reason || '—'}</td>
                  <td className="py-3 px-4 text-xs text-[#666] hidden sm:table-cell">
                    {b.created_at ? new Date(b.created_at).toLocaleString(dateLocale) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => onUnbanIp(b.ip_address)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs transition-colors"
                    >
                      <Trash2 size={12} /> {t('admin.unban')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
// ── Admin Stats Panel ─────────────────────────────────
function AdminStatsPanel() {
  const { t } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;
  if (!stats) return <div className="text-center py-8 text-muted">{t('admin.statsLoadError')}</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />} label={t('admin.totalUsers')} value={stats.totalUsers} color="#60a5fa" />
        <StatCard icon={<TrendingUp size={16} />} label={t('admin.newUsersToday')} value={stats.newUsersToday} color="#34d399" />
        <StatCard icon={<TrendingUp size={16} />} label={t('admin.newUsersWeek')} value={stats.newUsersThisWeek} color="#a78bfa" />
        <StatCard icon={<FileText size={16} />} label={t('admin.totalDocuments')} value={stats.totalDocuments} color="#fbbf24" />
      </div>

      {stats.planDistribution && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">{t('admin.planDistribution')}</h3>
          <div className="space-y-2">
            {stats.planDistribution.map(p => (
              <div key={p.plan} className="flex items-center gap-3">
                <span className="w-20 text-xs font-medium">{p.plan || t('admin.planFree')}</span>
                <div className="flex-1 h-3 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${stats.totalUsers > 0 ? (p.count / stats.totalUsers) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-muted w-10 text-right">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.registrationTrend && stats.registrationTrend.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">{t('admin.registrations7Days')}</h3>
          <div className="flex items-end gap-2 h-32">
            {stats.registrationTrend.map((d, i) => {
              const max = Math.max(1, ...stats.registrationTrend.map(x => x.count || 0));
              const height = ((d.count || 0) / max) * 100;
              const dateStr = d.date || d.day || '';
              return (
                <div key={dateStr || i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted">{d.count || 0}</span>
                  <div className="w-full bg-primary-500/20 rounded-t-lg relative" style={{ height: `${Math.max(4, height)}%` }}>
                    <div className="absolute inset-0 bg-primary-500 rounded-t-lg" style={{ height: `${height}%` }} />
                  </div>
                  <span className="text-[9px] text-muted">{dateStr.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.topUsers && stats.topUsers.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">{t('admin.topUsersByDocs')}</h3>
          <div className="space-y-2">
            {stats.topUsers.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-center font-bold text-muted">{i + 1}</span>
                <span className="flex-1 truncate">{u.display_name || u.username}</span>
                <span className="text-primary-400 font-medium">{t('admin.documentsCount', { count: u.doc_count })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin Documents Panel ─────────────────────────────
function AdminDocsPanel({ showToast, askConfirm }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const data = await adminGetDocuments({ page, limit: 20, search, filter });
      setDocs(data.documents || []);
      setTotal(data.total || 0);
    } catch { showToast('error', t('admin.docsLoadError')); }
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [page, filter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchDocs();
  };

  const handleDelete = (docId, title) => {
    askConfirm(t('admin.deleteDocumentTitle'), t('admin.deleteDocumentMessage', { title }), 'danger', async () => {
      try {
        await adminDeleteDocument(docId);
        showToast('success', t('admin.documentDeleted'));
        fetchDocs();
      } catch { showToast('error', t('admin.deleteDocumentError')); }
    });
  };

  const handleTogglePublic = async (docId) => {
    try {
      const result = await adminToggleDocPublic(docId);
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, is_public: result.is_public } : d));
      showToast('success', result.is_public ? t('admin.publicSet') : t('admin.hiddenSet'));
    } catch { showToast('error', t('admin.updateError')); }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.searchDocumentPlaceholder')}
            className="w-full bg-surface border border-line rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary-500/50"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          className="bg-surface border border-line rounded-xl px-3 py-2 text-sm focus:outline-none cursor-pointer"
        >
          <option value="all">{t('admin.all')}</option>
          <option value="public">{t('admin.public')}</option>
          <option value="private">{t('admin.private')}</option>
        </select>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">{t('admin.document')}</th>
                <th className="text-left py-3 px-4 hidden sm:table-cell">{t('admin.author')}</th>
                <th className="text-center py-3 px-4">{t('admin.status')}</th>
                <th className="text-left py-3 px-4">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-sm truncate max-w-xs">{d.original_name || d.title || t('admin.unknown')}</p>
                    <p className="text-[11px] text-muted">{new Date(d.created_at).toLocaleDateString(dateLocale)}</p>
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell text-muted text-xs">{d.owner_username || '?'}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleTogglePublic(d.id)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${d.is_public ? 'bg-emerald-500/10 text-emerald-400' : 'bg-surface-2 text-muted'}`}
                    >
                      {d.is_public ? <><Eye size={11} /> {t('admin.public')}</> : <><EyeOff size={11} /> {t('admin.private')}</>}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => handleDelete(d.id, d.original_name || d.title)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs transition-colors"
                    >
                      <Trash2 size={11} /> {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr key="empty-docs-row"><td colSpan={4} className="text-center py-8 text-muted">{t('admin.noDocumentsFound')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40 transition-colors"><ChevronLeft size={16} /></button>
          <span className="text-sm text-muted">{t('admin.pageOf', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40 transition-colors"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ── Admin Announcements Panel ─────────────────────────
function AdminAnnouncementsPanel({ showToast, askConfirm }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | announcementObj
  const [form, setForm] = useState({ 
    title: '', 
    content: '', 
    type: 'info', 
    is_active: 1, 
    expires_at: '',
    target_audience: 'registered',
    dismissible: 1,
    auto_dismiss_days: '',
    link_url: '',
    link_text: '',
    priority: 0
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const data = await getAnnouncements();
      setAnnouncements(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const startNew = () => {
    setForm({ 
      title: '', 
      content: '', 
      type: 'info', 
      is_active: 1, 
      expires_at: '',
      target_audience: 'registered',
      dismissible: 1,
      auto_dismiss_days: '',
      link_url: '',
      link_text: '',
      priority: 0
    });
    setEditing('new');
  };

  const startEdit = (a) => {
    setForm({ 
      title: a.title, 
      content: a.content || '', 
      type: a.type || 'info', 
      is_active: a.is_active, 
      expires_at: a.expires_at || '',
      target_audience: a.target_audience || 'registered',
      dismissible: a.dismissible !== undefined ? a.dismissible : 1,
      auto_dismiss_days: a.auto_dismiss_days || '',
      link_url: a.link_url || '',
      link_text: a.link_text || '',
      priority: a.priority || 0
    });
    setEditing(a);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    try {
      const payload = {
        ...form,
        auto_dismiss_days: form.auto_dismiss_days ? parseInt(form.auto_dismiss_days) : null,
        priority: parseInt(form.priority) || 0
      };
      if (editing === 'new') {
        const a = await createAnnouncement(payload);
        setAnnouncements(prev => [a, ...prev]);
        showToast('success', t('admin.announcementCreated'));
      } else {
        const a = await updateAnnouncement(editing.id, payload);
        setAnnouncements(prev => prev.map(x => x.id === editing.id ? a : x));
        showToast('success', t('admin.updated'));
      }
      setEditing(null);
    } catch { showToast('error', t('admin.saveAnnouncementError')); }
  };

  const handleDelete = (id) => {
    askConfirm(t('admin.deleteAnnouncementTitle'), t('admin.deleteAnnouncementMessage'), 'danger', async () => {
      try {
        await deleteAnnouncement(id);
        setAnnouncements(prev => prev.filter(a => a.id !== id));
        showToast('success', t('admin.deleted'));
      } catch { showToast('error', t('admin.deleteError')); }
    });
  };

  const TARGET_LABELS = {
    all: `🌍 ${t('admin.targetAll')}`,
    registered: `👤 ${t('admin.targetRegistered')}`,
    free: `📦 ${t('admin.targetPlanFree')}`,
    basic: `⭐ ${t('admin.targetPlanBasic')}`,
    pro: `💎 ${t('admin.targetPlanPro')}`,
    unlimited: `👑 ${t('admin.targetPlanUnlimited')}`
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Megaphone size={14} className="text-primary-400" /> {t('admin.manageAnnouncements')}</h3>
        <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} /> {t('admin.createNew')}
        </button>
      </div>

      {editing && (
        <div className="bg-surface border border-primary-500/30 rounded-xl p-4 space-y-3">
          <input
            value={form.title}
            onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder={t('admin.announcementTitlePlaceholder')}
            className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50"
          />
          <textarea
            value={form.content}
            onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
            placeholder={t('admin.announcementContentPlaceholder')}
            rows={3}
            className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary-500/50"
          />
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.announcementType')}</label>
              <select
                value={form.type}
                onChange={(e) => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
              >
                <option value="info">ℹ️ {t('admin.typeInfo')}</option>
                <option value="warning">⚠️ {t('admin.typeWarning')}</option>
                <option value="update">🔔 {t('admin.typeUpdate')}</option>
                <option value="important">📢 {t('admin.typeImportant')}</option>
              </select>
            </div>
            
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.targetAudience')}</label>
              <select
                value={form.target_audience}
                onChange={(e) => setForm(p => ({ ...p, target_audience: e.target.value }))}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none cursor-pointer"
              >
                <option value="all">🌍 {t('admin.targetAllWithGuests')}</option>
                <option value="registered">👤 {t('admin.targetRegisteredUsers')}</option>
                <option value="free">📦 {t('admin.targetPlanFreeFull')}</option>
                <option value="basic">⭐ {t('admin.targetPlanBasicFull')}</option>
                <option value="pro">💎 {t('admin.targetPlanProFull')}</option>
                <option value="unlimited">👑 {t('admin.targetPlanUnlimitedFull')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.expiryOptional')}</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm(p => ({ ...p, expires_at: e.target.value }))}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.autoDismissDays')}</label>
              <input
                type="number"
                value={form.auto_dismiss_days}
                onChange={(e) => setForm(p => ({ ...p, auto_dismiss_days: e.target.value }))}
                placeholder={t('admin.permanentIfEmpty')}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.linkUrlOptional')}</label>
              <input
                type="url"
                value={form.link_url}
                onChange={(e) => setForm(p => ({ ...p, link_url: e.target.value }))}
                placeholder={t('admin.urlPlaceholder')}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.linkText')}</label>
              <input
                type="text"
                value={form.link_text}
                onChange={(e) => setForm(p => ({ ...p, link_text: e.target.value }))}
                placeholder={t('announcement.readMore')}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">{t('admin.priority')}</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm(p => ({ ...p, priority: e.target.value }))}
                className="w-full bg-bg border border-line rounded-lg px-2 py-1.5 text-xs focus:outline-none"
              />
            </div>
            
            <div className="flex flex-col gap-2 pt-5">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked ? 1 : 0 }))} />
                {t('admin.active')}
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={!!form.dismissible} onChange={(e) => setForm(p => ({ ...p, dismissible: e.target.checked ? 1 : 0 }))} />
                {t('admin.allowDismiss')}
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors">
              <Save size={12} /> {t('common.save')}
            </button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-surface-2 hover:bg-line rounded-lg text-xs transition-colors">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <Megaphone size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('admin.noAnnouncements')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map(a => (
            <div key={a.id} className="bg-surface border border-line rounded-xl p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-medium text-sm">{a.title}</p>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-2 text-muted'}`}>
                    {a.is_active ? t('admin.showing') : t('admin.hidden')}
                  </span>
                  <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-400 rounded text-[10px] font-medium">{a.type}</span>
                  <span className="px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded text-[10px] font-medium">
                    {TARGET_LABELS[a.target_audience] || a.target_audience}
                  </span>
                  {a.priority > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded text-[10px] font-medium">
                      ⚡ {t('admin.priorityValue', { value: a.priority })}
                    </span>
                  )}
                </div>
                {a.content && <p className="text-xs text-muted line-clamp-2">{a.content}</p>}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
                  {a.expires_at && <span>⏰ {t('admin.expiredAt')}: {new Date(a.expires_at).toLocaleString(dateLocale)}</span>}
                  {a.auto_dismiss_days && <span>🔄 {t('admin.autoDismissAfterDays', { days: a.auto_dismiss_days })}</span>}
                  {a.link_url && <span>🔗 {t('admin.hasLink')}</span>}
                  {!a.dismissible && <span>🔒 {t('admin.notDismissible')}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => startEdit(a)} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors"><Edit3 size={13} /></button>
                <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Admin Audit Log Panel ─────────────────────────────
function AdminAuditPanel() {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await adminGetAuditLogs(page, 30);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <ScrollText size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('admin.noAuditLogs')}</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">{t('admin.time')}</th>
                <th className="text-left py-3 px-4">{t('admin.admin')}</th>
                <th className="text-left py-3 px-4">{t('admin.actions')}</th>
                <th className="text-left py-3 px-4 hidden sm:table-cell">{t('admin.details')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                  <td className="py-2.5 px-4 text-xs text-muted whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-medium">{log.admin_username || t('admin.system')}</td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 bg-primary-500/10 text-primary-400 rounded text-[11px] font-medium">{log.action}</span>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-muted hidden sm:table-cell truncate max-w-xs">
                    {log.target_type && `[${log.target_type}] `}{log.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40 transition-colors"><ChevronLeft size={16} /></button>
          <span className="text-sm text-muted">{t('admin.pageOf', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40 transition-colors"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 1. REAL-TIME DASHBOARD
// ═══════════════════════════════════════════════════════

function RealtimeDashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const d = await adminGetRealtime();
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;
  if (!data) return <div className="text-center py-8 text-muted">{t('admin.loadDataError')}</div>;

  const uptimeStr = data.uptime ? `${Math.floor(data.uptime / 3600000)}h ${Math.floor((data.uptime % 3600000) / 60000)}m` : '—';
  const sparkMax = Math.max(1, ...(data.sparkline || []));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-muted">
        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
        {t('admin.autoRefresh10s', { uptime: uptimeStr })}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Users size={16} />} label={t('admin.usersToday')} value={data.activeUsersToday} color="#60a5fa" />
        <StatCard icon={<TrendingUp size={16} />} label={t('admin.uploadsPerHour')} value={data.uploadsLastHour} color="#34d399" />
        <StatCard icon={<Brain size={16} />} label={t('admin.aiCallsPerHour')} value={data.aiCallsLastHour} color="#a78bfa" />
        <StatCard icon={<AlertOctagon size={16} />} label={t('admin.aiErrorsPerHour')} value={data.aiErrorsLastHour} color="#f87171" />
        <StatCard icon={<Zap size={16} />} label={t('admin.chatMessagesPerHour')} value={data.chatMsgsLastHour} color="#fbbf24" />
      </div>

      {/* Sparkline — AI calls last 12 hours */}
      {data.sparkline?.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={14} className="text-primary-400" /> {t('admin.aiCallsLast12h')}</h3>
          <div className="flex items-end gap-1 h-20">
            {data.sparkline.map((v, i) => {
              const h = Math.max(4, (v / sparkMax) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={t('admin.callsCount', { count: v })}>
                  <div className="w-full bg-primary-500/60 rounded-t transition-all" style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-muted mt-1">
            <span>{t('admin.minus12h')}</span>
            <span>{t('admin.minus6h')}</span>
            <span>{t('admin.now')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 3. USER DETAIL DRAWER
// ═══════════════════════════════════════════════════════

function UserDetailDrawer({ userId, onClose }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetUserDetail(userId).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-bg border-l border-line h-full overflow-y-auto animate-slide-in-right" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-bg/80 backdrop-blur-md border-b border-line px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold flex items-center gap-2"><Users size={16} className="text-primary-400" /> {t('admin.userDetails')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
        ) : !data ? (
          <div className="text-center py-12 text-muted">{t('admin.noDataFound')}</div>
        ) : (
          <div className="p-5 space-y-6">
            {/* User info */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-xl font-bold text-white">
                {(data.user.display_name || data.user.username || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-lg">{data.user.display_name || data.user.username}</p>
                <p className="text-xs text-muted">@{data.user.username} · {data.user.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-primary-600/15 text-primary-400">{data.user.plan}</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-surface-2 text-muted">{data.user.role}</span>
                  {data.user.is_banned && <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-500/15 text-red-400">{t('admin.bannedUpper')}</span>}
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface border border-line rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-primary-400">{data.totalDocs}</p>
                <p className="text-[10px] text-muted">{t('admin.documents')}</p>
              </div>
              <div className="bg-surface border border-line rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{data.streak?.current_streak || 0}</p>
                <p className="text-[10px] text-muted">{t('admin.streak')}</p>
              </div>
              <div className="bg-surface border border-line rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-purple-400">{data.aiUsage?.count || 0}</p>
                <p className="text-[10px] text-muted">{t('admin.aiCalls')}</p>
              </div>
            </div>

            {/* Account info */}
            <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('admin.info')}</h3>
              <div className="flex justify-between text-xs"><span className="text-muted">{t('admin.registeredAt')}</span><span>{new Date(data.user.created_at).toLocaleDateString(dateLocale)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted">{t('admin.emailVerified')}</span><span>{data.user.email_verified ? '✓' : '✗'}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted">{t('admin.aiTokensUsed')}</span><span>{(data.aiUsage?.tokens || 0).toLocaleString()}</span></div>
              {data.user.plan_expires_at && <div className="flex justify-between text-xs"><span className="text-muted">{t('admin.planExpires')}</span><span>{new Date(data.user.plan_expires_at).toLocaleDateString(dateLocale)}</span></div>}
            </div>

            {/* Recent Documents */}
            {data.documents?.length > 0 && (
              <div className="bg-surface border border-line rounded-xl p-4">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('admin.recentDocumentsCount', { count: data.documents.length })}</h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {data.documents.slice(0, 10).map(d => (
                    <div key={d.id} className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1 mr-2">{d.original_name || t('admin.untitled')}</span>
                      <span className="text-muted shrink-0">{new Date(d.created_at).toLocaleDateString(dateLocale)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Login History */}
            {data.loginHistory?.length > 0 && (
              <div className="bg-surface border border-line rounded-xl p-4">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('admin.loginHistory')}</h3>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {data.loginHistory.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted">{l.ip_address || '?'}</span>
                      <span className="text-muted">{new Date(l.created_at).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity timeline */}
            {data.recentActivity?.length > 0 && (
              <div className="bg-surface border border-line rounded-xl p-4">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{t('admin.recentActivity')}</h3>
                <div className="flex items-end gap-1 h-16">
                  {data.recentActivity.slice(0, 14).reverse().map((a, i) => {
                    const total = (a.flashcards_reviewed || 0) + (a.quizzes_completed || 0) + (a.documents_uploaded || 0) + (a.chat_messages || 0);
                    const max = Math.max(1, ...data.recentActivity.map(x => (x.flashcards_reviewed || 0) + (x.quizzes_completed || 0) + (x.documents_uploaded || 0) + (x.chat_messages || 0)));
                    return <div key={i} className="flex-1 bg-primary-500/60 rounded-t" style={{ height: `${Math.max(4, (total / max) * 100)}%` }} title={`${a.activity_date}: ${total}`} />;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 4. AI USAGE MONITORING
// ═══════════════════════════════════════════════════════

function AiUsagePanel() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminGetAiUsage(days).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;
  if (!data) return <div className="text-center py-8 text-muted">{t('admin.loadDataError')}</div>;

  const dailyMax = Math.max(1, ...(data.daily || []).map(d => d.calls || 0));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Brain size={14} className="text-primary-400" /> {t('admin.aiUsageMonitoring')}</h3>
        <div className="flex gap-1 bg-surface p-1 rounded-xl">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${days === d ? 'bg-primary-600 text-white' : 'text-muted hover:text-txt'}`}>{t('admin.daysShort', { count: d })}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Zap size={16} />} label={t('admin.totalCalls')} value={data.totalCalls} color="#a78bfa" />
        <StatCard icon={<Database size={16} />} label={t('admin.totalTokens')} value={(data.totalTokens || 0).toLocaleString()} color="#60a5fa" />
        <StatCard icon={<Clock size={16} />} label={t('admin.avgLatency')} value={`${data.avgLatency}ms`} color="#34d399" />
        <StatCard icon={<AlertOctagon size={16} />} label={t('admin.errors')} value={data.errorRate} color="#f87171" />
      </div>

      {/* Daily chart */}
      {data.daily?.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-3">{t('admin.callsByDay')}</h4>
          <div className="flex items-end gap-1 h-24">
            {data.daily.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-muted">{d.calls}</span>
                <div className="w-full bg-primary-500/60 rounded-t" style={{ height: `${Math.max(4, (d.calls / dailyMax) * 100)}%` }} />
                <span className="text-[8px] text-muted">{(d.date || '').slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By action */}
      {data.byAction?.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-3">{t('admin.byAction')}</h4>
          <div className="space-y-2">
            {data.byAction.map(a => (
              <div key={a.action} className="flex items-center gap-3 text-xs">
                <span className="w-28 font-medium truncate">{a.action}</span>
                <div className="flex-1 h-2.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500/70 rounded-full" style={{ width: `${data.totalCalls > 0 ? (a.count / data.totalCalls) * 100 : 0}%` }} />
                </div>
                <span className="text-muted w-12 text-right">{a.count}</span>
                <span className="text-muted w-16 text-right">{Math.round(a.avg_latency || 0)}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top users */}
      {data.topUsers?.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-3">{t('admin.topUsersAiCalls')}</h4>
          <div className="space-y-2">
            {data.topUsers.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3 text-xs">
                <span className="w-5 text-center font-bold text-muted">{i + 1}</span>
                <span className="flex-1 truncate">{u.display_name || u.username}</span>
                <span className="text-primary-400 font-medium">{t('admin.callsCount', { count: u.calls })}</span>
                <span className="text-muted">{(u.tokens || 0).toLocaleString()} tokens</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 5. CONTENT MODERATION
// ═══════════════════════════════════════════════════════

function ModerationPanel({ showToast, askConfirm }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await adminGetReports(statusFilter, page);
      setReports(data.reports || []);
      setTotal(data.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, [statusFilter, page]);

  const handleReview = (reportId, status, label) => {
    askConfirm(t('admin.reviewReportTitle'), t('admin.reviewReportMessage', { label }), status === 'approved' ? 'danger' : 'info', async () => {
      try {
        await adminReviewReport(reportId, status);
        showToast('success', t('admin.reviewReportSuccess', { label }));
        fetchReports();
      } catch { showToast('error', t('admin.processError')); }
    });
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Flag size={14} className="text-primary-400" /> {t('admin.contentModeration')}</h3>
        <div className="flex gap-1 bg-surface p-1 rounded-xl">
          {['pending', 'approved', 'rejected'].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${statusFilter === s ? 'bg-primary-600 text-white' : 'text-muted hover:text-txt'}`}>
              {s === 'pending' ? t('admin.pendingReview') : s === 'approved' ? t('admin.approved') : t('admin.rejected')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : reports.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-muted">
          <Flag size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('admin.noReports')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="bg-surface border border-line rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[10px] font-bold">{r.target_type}</span>
                    <span className="text-xs text-muted">{t('admin.by')} {r.reporter_name || r.reporter_username}</span>
                    <span className="text-[10px] text-muted">{new Date(r.created_at).toLocaleDateString(dateLocale)}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{t('admin.reason')}: {r.reason}</p>
                  {r.details && <p className="text-xs text-muted">{r.details}</p>}
                  <p className="text-[10px] text-muted mt-1">{t('admin.targetId')}: {r.target_id}</p>
                </div>
                {r.status === 'pending' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => handleReview(r.id, 'approved', t('admin.approveAndDeleteContent'))} className="px-2.5 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs transition-colors">{t('admin.approve')}</button>
                    <button onClick={() => handleReview(r.id, 'rejected', t('admin.rejected'))} className="px-2.5 py-1.5 bg-surface-2 text-muted hover:text-txt rounded-lg text-xs transition-colors">{t('admin.reject')}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="text-sm text-muted">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 6. SYSTEM HEALTH PANEL
// ═══════════════════════════════════════════════════════

function SystemHealthPanel() {
  const { t } = useLanguage();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try { setHealth(await adminGetSystemHealth()); } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchHealth(); const i = setInterval(fetchHealth, 15000); return () => clearInterval(i); }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;
  if (!health) return <div className="text-center py-8 text-muted">{t('admin.loadFailed')}</div>;

  const fmt = (bytes) => bytes > 1073741824 ? `${(bytes / 1073741824).toFixed(1)} GB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const memPct = Math.round((1 - (health.system?.freeMem || 0) / (health.system?.totalMem || 1)) * 100);
  const uptimeStr = `${Math.floor((health.uptime || 0) / 3600)}h ${Math.floor(((health.uptime || 0) % 3600) / 60)}m`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-muted">
        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> {t('admin.refreshEvery15s')}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Clock size={16} />} label={t('admin.uptime')} value={uptimeStr} color="#34d399" />
        <StatCard icon={<Cpu size={16} />} label={t('admin.cpuCores')} value={health.system?.cpuCount} color="#60a5fa" />
        <StatCard icon={<HardDrive size={16} />} label={t('admin.ramUsed')} value={`${memPct}%`} color={memPct > 85 ? '#f87171' : '#a78bfa'} />
        <StatCard icon={<Database size={16} />} label={t('admin.dbSize')} value={fmt(health.storage?.dbSize || 0)} color="#fbbf24" />
      </div>

      {/* Memory breakdown */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-3">{t('admin.memory')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div><span className="text-muted">RSS</span><p className="font-medium">{fmt(health.memory?.rss || 0)}</p></div>
          <div><span className="text-muted">{t('admin.heapUsed')}</span><p className="font-medium">{fmt(health.memory?.heapUsed || 0)}</p></div>
          <div><span className="text-muted">{t('admin.heapTotal')}</span><p className="font-medium">{fmt(health.memory?.heapTotal || 0)}</p></div>
          <div><span className="text-muted">{t('admin.systemFree')}</span><p className="font-medium">{fmt(health.system?.freeMem || 0)}</p></div>
        </div>
        <div className="mt-3 h-3 bg-surface-2 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${memPct > 85 ? 'bg-red-500' : memPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${memPct}%` }} />
        </div>
        <p className="text-[10px] text-muted mt-1">{fmt((health.system?.totalMem || 0) - (health.system?.freeMem || 0))} / {fmt(health.system?.totalMem || 0)}</p>
      </div>

      {/* System info */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-3">{t('admin.systemInfo')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between"><span className="text-muted">{t('admin.platform')}</span><span>{health.system?.platform}</span></div>
          <div className="flex justify-between"><span className="text-muted">Node.js</span><span>{health.system?.nodeVersion}</span></div>
          <div className="flex justify-between"><span className="text-muted">CPU</span><span className="truncate ml-2">{health.system?.cpuModel}</span></div>
          <div className="flex justify-between"><span className="text-muted">{t('admin.uploads')}</span><span>{fmt(health.storage?.uploadsSize || 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted">{t('admin.loadAvg')}</span><span>{(health.system?.loadAvg || []).map(l => l.toFixed(2)).join(' / ')}</span></div>
        </div>
      </div>

      {/* API errors */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <h4 className="text-xs font-semibold mb-3">{t('admin.apiHealth24h')}</h4>
        <div className="grid grid-cols-3 gap-4 text-xs mb-3">
          <div><span className="text-muted">{t('admin.totalCalls')}</span><p className="font-medium">{health.errors?.totalCalls24h}</p></div>
          <div><span className="text-muted">{t('admin.errors')}</span><p className="font-medium text-red-400">{health.errors?.totalErrors24h}</p></div>
          <div><span className="text-muted">{t('admin.avgResponse')}</span><p className="font-medium">{health.errors?.avgResponseTime}ms</p></div>
        </div>
        {health.errors?.recentErrors?.length > 0 && (
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {health.errors.recentErrors.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-red-400 shrink-0">✗</span>
                <span className="text-muted shrink-0">{e.action}</span>
                <span className="truncate text-muted/70">{e.error_message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 7. EMAIL BLAST
// ═══════════════════════════════════════════════════════

function EmailBlastPanel({ showToast }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [blasts, setBlasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', content: '', targetFilter: 'all' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    adminGetEmailBlasts().then(d => setBlasts(d.blasts || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSend = async () => {
    if (!form.subject.trim() || !form.content.trim()) return;
    setSending(true);
    try {
      const result = await adminSendEmailBlast(form.subject, form.content, form.targetFilter);
      showToast('success', t('admin.sendingToRecipients', { count: result.totalRecipients }));
      setShowForm(false);
      setForm({ subject: '', content: '', targetFilter: 'all' });
      setTimeout(() => adminGetEmailBlasts().then(d => setBlasts(d.blasts || [])).catch(() => {}), 2000);
    } catch { showToast('error', t('admin.sendEmailError')); }
    setSending(false);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Mail size={14} className="text-primary-400" /> {t('admin.emailBlast')}</h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors">
          <Send size={12} /> {t('admin.createNewEmail')}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface border border-primary-500/30 rounded-xl p-4 space-y-3">
          <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder={t('admin.emailSubjectPlaceholder')} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50" />
          <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder={t('admin.emailContentPlaceholder')} rows={4} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary-500/50" />
          <div className="flex items-center gap-3">
            <select value={form.targetFilter} onChange={e => setForm(p => ({ ...p, targetFilter: e.target.value }))} className="bg-bg border border-line rounded-lg px-2 py-1.5 text-xs cursor-pointer">
              <option value="all">{t('admin.targetAllUsers')}</option>
              <option value="active">{t('admin.targetActive7d')}</option>
              <option value="inactive">{t('admin.targetInactive30d')}</option>
              <option value="plan:free">{t('admin.targetFreeUsers')}</option>
              <option value="plan:basic">{t('admin.targetBasicUsers')}</option>
              <option value="plan:pro">{t('admin.targetProUsers')}</option>
              <option value="plan:unlimited">{t('admin.targetUnlimitedUsers')}</option>
            </select>
            <button onClick={handleSend} disabled={sending} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {t('admin.send')}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 bg-surface-2 rounded-lg text-xs hover:bg-line transition-colors">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : blasts.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-muted">
          <Mail size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('admin.noEmailSent')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {blasts.map(b => (
            <div key={b.id} className="bg-surface border border-line rounded-xl p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{b.subject}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                  <span>{b.sender_name || b.sender_username}</span>
                  <span>·</span>
                  <span>{new Date(b.created_at).toLocaleDateString(dateLocale)}</span>
                  <span>·</span>
                  <span>{t('admin.target')}: {b.target_filter}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${b.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' : b.status === 'sending' ? 'bg-amber-500/15 text-amber-400' : 'bg-surface-2 text-muted'}`}>
                  {b.status}
                </span>
                <p className="text-xs text-muted mt-1">{t('admin.sentProgress', { sent: b.sent_count, total: b.total_recipients })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 8. FEATURE FLAGS
// ═══════════════════════════════════════════════════════

function FeatureFlagsPanel({ showToast, askConfirm }) {
  const { t } = useLanguage();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', enabled: true, plans: ['free', 'basic', 'pro', 'unlimited'] });

  const ALL_PLANS = ['free', 'basic', 'pro', 'unlimited'];

  useEffect(() => {
    adminGetFeatureFlags().then(d => setFlags(d.flags || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const startNew = () => { setForm({ name: '', description: '', enabled: true, plans: [...ALL_PLANS] }); setEditing('new'); };
  const startEdit = (f) => {
    let plans = ALL_PLANS;
    try { plans = JSON.parse(f.plans); } catch {}
    setForm({ name: f.name, description: f.description || '', enabled: !!f.enabled, plans });
    setEditing(f);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editing === 'new') {
        const d = await adminCreateFeatureFlag(form);
        setFlags(prev => [...prev, d.flag]);
        showToast('success', t('admin.featureFlagCreated'));
      } else {
        const d = await adminUpdateFeatureFlag(editing.id, form);
        setFlags(prev => prev.map(f => f.id === editing.id ? d.flag : f));
        showToast('success', t('admin.updated'));
      }
      setEditing(null);
    } catch { showToast('error', t('common.error')); }
  };

  const handleToggle = async (flag) => {
    try {
      const d = await adminUpdateFeatureFlag(flag.id, { enabled: !flag.enabled });
      setFlags(prev => prev.map(f => f.id === flag.id ? d.flag : f));
    } catch { showToast('error', t('admin.updateError')); }
  };

  const handleDelete = (id) => {
    askConfirm(t('admin.deleteFeatureFlagTitle'), t('admin.areYouSure'), 'danger', async () => {
      try {
        await adminDeleteFeatureFlag(id);
        setFlags(prev => prev.filter(f => f.id !== id));
        showToast('success', t('admin.deleted'));
      } catch { showToast('error', t('common.error')); }
    });
  };

  const togglePlan = (plan) => {
    setForm(p => ({
      ...p,
      plans: p.plans.includes(plan) ? p.plans.filter(pp => pp !== plan) : [...p.plans, plan]
    }));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><ToggleLeft size={14} className="text-primary-400" /> {t('admin.featureFlags')}</h3>
        <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} /> {t('admin.createNew')}
        </button>
      </div>

      {editing && (
        <div className="bg-surface border border-primary-500/30 rounded-xl p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={t('admin.featureNamePlaceholder')} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50 font-mono" />
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={t('admin.descriptionPlaceholder')} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50" />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} /> {t('admin.enable')}
            </label>
            <span className="text-xs text-muted">{t('admin.plansLabel')}</span>
            {ALL_PLANS.map(p => (
              <label key={p} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={form.plans.includes(p)} onChange={() => togglePlan(p)} /> {p}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium"><Save size={12} /> {t('common.save')}</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-surface-2 rounded-lg text-xs hover:bg-line">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary-400" /></div>
      ) : flags.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-muted">
          <ToggleLeft size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('admin.noFeatureFlags')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map(f => {
            let plans = [];
            try { plans = JSON.parse(f.plans); } catch {}
            return (
              <div key={f.id} className="bg-surface border border-line rounded-xl p-4 flex items-center gap-4">
                <button onClick={() => handleToggle(f)} className="shrink-0">
                  {f.enabled ? <ToggleRight size={28} className="text-emerald-400" /> : <ToggleLeft size={28} className="text-muted" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm font-mono">{f.name}</p>
                  {f.description && <p className="text-xs text-muted mt-0.5">{f.description}</p>}
                  <div className="flex items-center gap-1 mt-1">
                    {plans.map(p => <span key={p} className="px-1.5 py-0.5 bg-surface-2 rounded text-[9px] text-muted">{p}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(f)} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-txt"><Edit3 size={13} /></button>
                  <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 9. EXPORT DATA (CSV)
// ═══════════════════════════════════════════════════════

function ExportDataPanel({ showToast }) {
  const { t } = useLanguage();
  const [exporting, setExporting] = useState('');

  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (type) => {
    setExporting(type);
    try {
      let data;
      if (type === 'users') data = await adminExportUsers();
      else if (type === 'documents') data = await adminExportDocuments();
      else data = await adminExportActivity();
      downloadCSV(data.csv, data.filename);
      showToast('success', t('admin.exportedRecords', { count: data.count }));
    } catch { showToast('error', t('admin.exportDataError')); }
    setExporting('');
  };

  const exports = [
    { type: 'users', label: t('admin.exportUsersLabel'), desc: t('admin.exportUsersDesc'), icon: Users, color: '#60a5fa' },
    { type: 'documents', label: t('admin.exportDocumentsLabel'), desc: t('admin.exportDocumentsDesc'), icon: FileText, color: '#34d399' },
    { type: 'activity', label: t('admin.exportActivityLabel'), desc: t('admin.exportActivityDesc'), icon: Activity, color: '#a78bfa' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Download size={14} className="text-primary-400" /> {t('admin.exportDataCsv')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {exports.map(exp => {
          const Icon = exp.icon;
          const isLoading = exporting === exp.type;
          return (
            <div key={exp.type} className="bg-surface border border-line rounded-xl p-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: `${exp.color}15` }}>
                <Icon size={22} style={{ color: exp.color }} />
              </div>
              <p className="font-medium text-sm mb-1">{exp.label}</p>
              <p className="text-xs text-muted mb-4">{exp.desc}</p>
              <button
                onClick={() => handleExport(exp.type)}
                disabled={!!exporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {t('admin.exportCsv')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 11. LOGIN ACTIVITY
// ═══════════════════════════════════════════════════════

function LoginActivityPanel() {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminGetLoginActivity(page).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;
  if (!data) return <div className="text-center py-8 text-muted">{t('admin.loadFailed')}</div>;

  const totalPages = data.totalPages || 1;

  return (
    <div className="space-y-6 animate-fade-in">
      <h3 className="text-sm font-semibold flex items-center gap-2"><MapPin size={14} className="text-primary-400" /> {t('admin.loginActivity')}</h3>

      {/* IP Summary */}
      {data.ipSummary?.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-xs font-semibold mb-3">{t('admin.topIps')}</h4>
          <div className="space-y-1.5">
            {data.ipSummary.slice(0, 10).map((ip, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-muted w-32 truncate">{ip.ip_address}</span>
                <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500/60 rounded-full" style={{ width: `${Math.min(100, (ip.count / (data.ipSummary[0]?.count || 1)) * 100)}%` }} />
                </div>
                <span className="text-muted w-8 text-right">{ip.count}</span>
                <span className="text-muted w-10 text-right">{t('admin.usersShortCount', { count: ip.unique_users })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Login log table */}
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
              <th className="text-left py-3 px-4">{t('admin.time')}</th>
              <th className="text-left py-3 px-4">{t('admin.user')}</th>
              <th className="text-left py-3 px-4">{t('admin.ip')}</th>
              <th className="text-left py-3 px-4 hidden md:table-cell">{t('admin.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(data.logs || []).map((l, i) => (
              <tr key={i} className="border-b border-line last:border-b-0 hover:bg-surface-2/50">
                <td className="py-2.5 px-4 text-xs text-muted whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2.5 px-4 text-xs font-medium">{l.display_name || l.username}</td>
                <td className="py-2.5 px-4 text-xs font-mono text-muted">{l.ip_address}</td>
                <td className="py-2.5 px-4 hidden md:table-cell">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${l.success ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {l.success ? 'OK' : 'FAIL'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span className="text-sm text-muted">{page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-surface hover:bg-surface-2 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 12. MAINTENANCE MODE
// ═══════════════════════════════════════════════════════

function MaintenanceModePanel({ showToast }) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [maintenanceActive, setMaintenanceActive] = useState(false);

  useEffect(() => {
    getSystemSettings().then(s => {
      setSettings(s);
      setMaintenanceActive(!!s.maintenance_mode);
      setMaintenanceMsg(s.maintenance_message || t('app.defaultMaintenance'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminUpdateSystemSetting('maintenance_mode', maintenanceActive);
      await adminUpdateSystemSetting('maintenance_message', maintenanceMsg);
      showToast('success', maintenanceActive ? t('admin.maintenanceEnabled') : t('admin.maintenanceDisabled'));
    } catch { showToast('error', t('admin.updateError')); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary-400" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Wrench size={14} className="text-primary-400" /> {t('admin.maintenanceModeTitle')}</h3>

      <div className="bg-surface border border-line rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-medium text-sm">{t('admin.maintenanceMode')}</p>
            <p className="text-xs text-muted mt-0.5">{t('admin.maintenanceModeDesc')}</p>
          </div>
          <button onClick={() => setMaintenanceActive(!maintenanceActive)} className="shrink-0">
            {maintenanceActive ? <ToggleRight size={36} className="text-amber-400" /> : <ToggleLeft size={36} className="text-muted" />}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">{t('admin.maintenanceMessage')}</label>
            <textarea
              value={maintenanceMsg}
              onChange={e => setMaintenanceMsg(e.target.value)}
              rows={3}
              className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary-500/50"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {t('admin.saveSettings')}
          </button>
        </div>
      </div>

      {/* Preview */}
      {maintenanceActive && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-2"><AlertOctagon size={14} /> {t('admin.previewUserView')}</p>
          <div className="bg-surface border border-line rounded-xl p-4 mt-2 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-400">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                {t('app.maintenanceMode')}
              </div>
              <Wrench size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t('app.maintenanceTitle')}</p>
              <p className="text-xs text-muted mt-1">{maintenanceMsg}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ADMIN NOTIFICATIONS PANEL
// ═══════════════════════════════════════════════════════

function AdminNotificationsPanel({ showToast, askConfirm }) {
  const { t, language } = useLanguage();
  const dateLocale = language === 'vi' ? 'vi-VN' : 'en-US';
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendForm, setSendForm] = useState({ title: '', message: '', type: 'system', icon: '🔔', targetMode: 'all', userIds: '' });
  const [sending, setSending] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);

  const NOTIF_TYPES = [
    { value: '', label: t('admin.notifAllTypes') },
    { value: 'system', label: t('admin.notifSystem') },
    { value: 'achievement', label: t('admin.notifAchievement') },
    { value: 'feature', label: t('admin.notifFeature') },
    { value: 'social', label: t('admin.notifSocial') },
    { value: 'quiz_ready', label: t('admin.notifQuiz') },
    { value: 'flashcards_ready', label: t('admin.notifFlashcards') },
    { value: 'mindmap_ready', label: t('admin.notifMindmap') },
    { value: 'summary_ready', label: t('admin.notifSummary') },
    { value: 'plan_changed', label: t('admin.notifPlan') },
  ];

  const fetchNotifications = useCallback(async () => {
    try {
      const params = { page, limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (typeFilter) params.type = typeFilter;
      const data = await adminGetNotifications(params);
      setNotifications(data.notifications || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      showToast('error', t('admin.notifFetchError'));
    }
  }, [page, search, typeFilter, showToast, t]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminGetNotificationStats();
      setStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchNotifications(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchNotifications, fetchStats]);

  const handleSend = async () => {
    if (!sendForm.title.trim() || !sendForm.message.trim()) return;
    setSending(true);
    try {
      const payload = {
        title: sendForm.title,
        message: sendForm.message,
        type: sendForm.type,
        icon: sendForm.icon,
      };
      if (sendForm.targetMode === 'specific' && sendForm.userIds.trim()) {
        payload.userIds = sendForm.userIds.split(',').map(id => id.trim()).filter(Boolean);
      }
      const result = await adminSendNotification(payload);
      showToast('success', t('admin.notifSentSuccess', { count: result.count || 0 }));
      setShowSendForm(false);
      setSendForm({ title: '', message: '', type: 'system', icon: '🔔', targetMode: 'all', userIds: '' });
      fetchNotifications();
      fetchStats();
    } catch {
      showToast('error', t('admin.notifSendError'));
    }
    setSending(false);
  };

  const handleDelete = (id) => {
    askConfirm(t('admin.notifDeleteTitle'), t('admin.notifDeleteMsg'), 'danger', async () => {
      try {
        await adminDeleteNotification(id);
        showToast('success', t('admin.notifDeleted'));
        fetchNotifications();
        fetchStats();
      } catch {
        showToast('error', t('admin.notifDeleteError'));
      }
    });
  };

  const handleCleanup = () => {
    askConfirm(t('admin.notifCleanupTitle'), t('admin.notifCleanupMsg', { days: cleanupDays }), 'danger', async () => {
      setCleaning(true);
      try {
        const result = await adminCleanupNotifications(cleanupDays);
        showToast('success', t('admin.notifCleanupSuccess', { count: result.deleted || 0 }));
        fetchNotifications();
        fetchStats();
      } catch {
        showToast('error', t('admin.notifCleanupError'));
      }
      setCleaning(false);
    });
  };

  const ICON_OPTIONS = ['🔔', '🎉', '⭐', '🚀', '📢', '💡', '⚠️', '🎯', '📝', '🏆'];

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-primary-400" /></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface border border-line rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1"><BellRing size={14} className="text-primary-400" /><span className="text-xs text-muted">{t('admin.notifTotal')}</span></div>
            <p className="text-xl font-bold text-primary-400">{stats.total || 0}</p>
          </div>
          <div className="bg-surface border border-line rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1"><Eye size={14} className="text-amber-400" /><span className="text-xs text-muted">{t('admin.notifUnread')}</span></div>
            <p className="text-xl font-bold text-amber-400">{stats.unread || 0}</p>
          </div>
          <div className="bg-surface border border-line rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1"><Clock size={14} className="text-emerald-400" /><span className="text-xs text-muted">{t('admin.notifToday')}</span></div>
            <p className="text-xl font-bold text-emerald-400">{stats.today || 0}</p>
          </div>
          <div className="bg-surface border border-line rounded-xl p-3.5">
            <div className="flex items-center gap-2 mb-1"><TrendingUp size={14} className="text-blue-400" /><span className="text-xs text-muted">{t('admin.notifThisWeek')}</span></div>
            <p className="text-xl font-bold text-blue-400">{stats.thisWeek || 0}</p>
          </div>
        </div>
      )}

      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bell size={14} className="text-primary-400" /> {t('admin.notifications')}
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSendForm(!showSendForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors">
            <Send size={12} /> {t('admin.notifSend')}
          </button>
          <button onClick={() => { fetchNotifications(); fetchStats(); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-line rounded-lg text-xs transition-colors">
            <RefreshCw size={12} /> {t('admin.refresh')}
          </button>
        </div>
      </div>

      {/* Send form */}
      {showSendForm && (
        <div className="bg-surface border border-primary-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Send size={14} className="text-primary-400" />
            <span className="text-sm font-medium">{t('admin.notifSendNew')}</span>
          </div>
          <input value={sendForm.title} onChange={e => setSendForm(p => ({ ...p, title: e.target.value }))}
            placeholder={t('admin.notifTitlePlaceholder')} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500/50" />
          <textarea value={sendForm.message} onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))}
            placeholder={t('admin.notifMessagePlaceholder')} rows={3} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary-500/50" />
          <div className="flex flex-wrap items-center gap-3">
            <select value={sendForm.type} onChange={e => setSendForm(p => ({ ...p, type: e.target.value }))}
              className="bg-bg border border-line rounded-lg px-2 py-1.5 text-xs cursor-pointer">
              {NOTIF_TYPES.filter(t => t.value).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="flex items-center gap-1">
              {ICON_OPTIONS.map(ic => (
                <button key={ic} onClick={() => setSendForm(p => ({ ...p, icon: ic }))}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors ${sendForm.icon === ic ? 'bg-primary-600/30 border border-primary-500/50' : 'hover:bg-surface-2'}`}>
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={sendForm.targetMode === 'all'} onChange={() => setSendForm(p => ({ ...p, targetMode: 'all' }))} className="accent-primary-500" />
              {t('admin.notifTargetAll')}
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" checked={sendForm.targetMode === 'specific'} onChange={() => setSendForm(p => ({ ...p, targetMode: 'specific' }))} className="accent-primary-500" />
              {t('admin.notifTargetSpecific')}
            </label>
          </div>
          {sendForm.targetMode === 'specific' && (
            <input value={sendForm.userIds} onChange={e => setSendForm(p => ({ ...p, userIds: e.target.value }))}
              placeholder={t('admin.notifUserIdsPlaceholder')} className="w-full bg-bg border border-line rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary-500/50" />
          )}
          <div className="flex items-center gap-2">
            <button onClick={handleSend} disabled={sending} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {t('admin.send')}
            </button>
            <button onClick={() => setShowSendForm(false)} className="px-3 py-1.5 bg-surface-2 rounded-lg text-xs hover:bg-line transition-colors">{t('common.cancel')}</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('admin.notifSearchPlaceholder')} className="w-full bg-surface border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-primary-500/50" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-surface border border-line rounded-lg px-2 py-1.5 text-xs cursor-pointer">
          {NOTIF_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center text-muted">
          <Bell size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('admin.notifEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div key={n.id} className={`bg-surface border rounded-xl p-4 flex items-center gap-3 group ${n.is_read ? 'border-line' : 'border-primary-500/30'}`}>
              <span className="text-lg shrink-0">{n.icon || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{n.title}</p>
                  {!n.is_read && <span className="w-1.5 h-1.5 bg-primary-400 rounded-full shrink-0" />}
                </div>
                <p className="text-xs text-muted truncate mt-0.5">{n.message}</p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                  <span className="px-1.5 py-0.5 bg-surface-2 rounded text-[10px]">{n.type}</span>
                  <span>·</span>
                  <span>{n.username || n.user_id}</span>
                  <span>·</span>
                  <span>{new Date(n.created_at).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <button onClick={() => handleDelete(n.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-all" title={t('common.delete')}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="p-1.5 bg-surface border border-line rounded-lg hover:bg-surface-2 disabled:opacity-30 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-muted">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-1.5 bg-surface border border-line rounded-lg hover:bg-surface-2 disabled:opacity-30 transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Cleanup section */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2"><Trash2 size={14} className="text-red-400" /> {t('admin.notifCleanup')}</h4>
            <p className="text-xs text-muted mt-1">{t('admin.notifCleanupDesc')}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={cleanupDays} onChange={e => setCleanupDays(Number(e.target.value))}
              className="bg-bg border border-line rounded-lg px-2 py-1.5 text-xs cursor-pointer">
              <option value={7}>7 {t('admin.notifDays')}</option>
              <option value={14}>14 {t('admin.notifDays')}</option>
              <option value={30}>30 {t('admin.notifDays')}</option>
              <option value={60}>60 {t('admin.notifDays')}</option>
              <option value={90}>90 {t('admin.notifDays')}</option>
            </select>
            <button onClick={handleCleanup} disabled={cleaning}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              {cleaning ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} {t('admin.notifCleanupBtn')}
            </button>
          </div>
        </div>
      </div>

      {/* Type breakdown */}
      {stats?.byType && stats.byType.length > 0 && (
        <div className="bg-surface border border-line rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2"><BarChart3 size={14} className="text-primary-400" /> {t('admin.notifByType')}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {stats.byType.map(item => (
              <div key={item.type} className="bg-bg rounded-lg p-2.5 text-center">
                <p className="text-xs text-muted truncate">{item.type}</p>
                <p className="text-sm font-bold text-primary-400 mt-0.5">{item.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}