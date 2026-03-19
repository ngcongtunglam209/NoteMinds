import { useState, useEffect, useCallback } from 'react';
import {
  Bell, BellRing, ArrowLeft, Check, CheckCheck, Trash2, Search, Filter,
  Loader2, X, Map, BookOpen, HelpCircle, FileText, Share2, Globe, Trophy,
  Flame, Lock, ArrowUpCircle, AlertTriangle, ShieldAlert, Users, Settings,
  ChevronDown, MoreVertical, Inbox
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { getApiBaseUrl, getStoredToken } from '../api';

const API = getApiBaseUrl();

function authHeaders(extra = {}) {
  const token = getStoredToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ─── Icon mapping (mirrors NotificationBell) ─── */
const ICON_MAP = {
  mindmap:   { Icon: Map,            color: 'text-violet-400',  bg: 'bg-violet-500/10'  },
  flashcard: { Icon: BookOpen,       color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
  quiz:      { Icon: HelpCircle,     color: 'text-cyan-400',    bg: 'bg-cyan-500/10'    },
  summary:   { Icon: FileText,       color: 'text-emerald-400', bg: 'bg-emerald-500/10'  },
  share:     { Icon: Share2,         color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
  globe:     { Icon: Globe,          color: 'text-teal-400',    bg: 'bg-teal-500/10'    },
  trophy:    { Icon: Trophy,         color: 'text-yellow-400',  bg: 'bg-yellow-500/10'  },
  flame:     { Icon: Flame,          color: 'text-orange-400',  bg: 'bg-orange-500/10'  },
  lock:      { Icon: Lock,           color: 'text-slate-400',   bg: 'bg-slate-500/10'   },
  upgrade:   { Icon: ArrowUpCircle,  color: 'text-primary-400', bg: 'bg-primary-500/10' },
  alert:     { Icon: AlertTriangle,  color: 'text-red-400',     bg: 'bg-red-500/10'     },
  admin:     { Icon: ShieldAlert,    color: 'text-primary-400', bg: 'bg-primary-500/10' },
  community: { Icon: Users,          color: 'text-indigo-400',  bg: 'bg-indigo-500/10'  },
  check:     { Icon: Check,          color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  settings:  { Icon: Settings,       color: 'text-muted',       bg: 'bg-surface-2'      },
  default:   { Icon: Bell,           color: 'text-muted',       bg: 'bg-surface-2'      },
};

function getIconInfo(icon) {
  return ICON_MAP[icon] || ICON_MAP.default;
}

/* ─── Category config for sidebar ─── */
function getCategories(t) {
  return [
    { id: 'all',       label: t('notifications.categoryAll', 'All'),          icon: Inbox,          matchTypes: null },
    { id: 'documents', label: t('notifications.categoryDocuments', 'Documents'),    icon: FileText,       matchTypes: ['mindmap_ready', 'flashcards_ready', 'quiz_ready', 'summary_ready', 'document_processed', 'document_generated'] },
    { id: 'sharing',   label: t('notifications.categorySharing', 'Sharing'),      icon: Share2,         matchTypes: ['document_shared', 'document_published', 'shared_document_viewed'] },
    { id: 'security',  label: t('notifications.categorySecurity', 'Security'),     icon: Lock,           matchTypes: ['email_verification_needed', 'password_reset_requested', 'password_reset_success', 'new_device_login', 'security_alert', 'email_verified'] },
    { id: 'community', label: t('notifications.categoryCommunity', 'Community'),    icon: Users,          matchTypes: ['profile_viewed', 'leaderboard_achievement', 'learning_goal_achieved', 'streak_milestone', 'community_activity'] },
    { id: 'admin',     label: t('notifications.categoryAdmin', 'Admin'),        icon: ShieldAlert,    matchTypes: ['admin_message', 'plan_changed', 'plan_expiring', 'account_banned'] },
  ];
}

/* ─── Time formatting ─── */
function formatTime(dateStr, t) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return t('notifications.justNow', 'just now');
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}${t('notifications.minutesAgo', 'm ago')}`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}${t('notifications.hoursAgo', 'h ago')}`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}${t('notifications.daysAgo', 'd ago')}`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function formatFullDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ─── Group notifications by date ─── */
function groupByDate(notifications, t) {
  const groups = {};
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  for (const n of notifications) {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
    let label;
    if (d.getTime() === today.getTime()) label = t('notifications.dateToday', 'Today');
    else if (d.getTime() === yesterday.getTime()) label = t('notifications.dateYesterday', 'Yesterday');
    else if (d >= weekAgo) label = t('notifications.dateThisWeek', 'This Week');
    else label = t('notifications.dateOlder', 'Older');

    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
}

/* ─── Notification Manager (Full Page) ─── */
export default function NotificationManager({ onBack }) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [activeCategory, setActiveCategory] = useState('all');
  const [readFilter, setReadFilter] = useState('all'); // 'all' | 'unread' | 'read'
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  // Detail panel
  const [selectedNotification, setSelectedNotification] = useState(null);

  const fetchNotifications = useCallback(async (pageNum = 0, append = false) => {
    try {
      setLoading(!append);
      const unreadOnly = readFilter === 'unread';
      const res = await fetch(
        `${API}/notifications?limit=30&offset=${pageNum * 30}&unreadOnly=${unreadOnly}`,
        { credentials: 'include', headers: authHeaders() }
      );
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();

      if (append) {
        setNotifications(prev => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications);
      }

      setTotalCount(data.total);
      setHasMore(data.notifications.length === 30);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [readFilter]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notifications/unread-count`, { credentials: 'include', headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unread_count);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchNotifications(0); fetchUnreadCount(); }, [readFilter]);

  /* ─── Actions ─── */
  const markAsRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1, read_at: new Date().toISOString() } : n));
    if (selectedNotification?.id === id) setSelectedNotification(prev => ({ ...prev, is_read: 1 }));
    try {
      await fetch(`${API}/notifications/${id}/read`, { method: 'PUT', credentials: 'include', headers: authHeaders() });
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1, read_at: new Date().toISOString() })));
    try {
      await fetch(`${API}/notifications/mark-all-read`, { method: 'POST', credentials: 'include', headers: authHeaders() });
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  const deleteNotification = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (selectedNotification?.id === id) setSelectedNotification(null);
    try {
      await fetch(`${API}/notifications/${id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() });
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  const deleteAll = async () => {
    setNotifications([]);
    setSelectedNotification(null);
    try {
      await fetch(`${API}/notifications`, { method: 'DELETE', credentials: 'include', headers: authHeaders() });
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  const bulkMarkRead = async () => {
    const ids = [...selectedIds];
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, is_read: 1 } : n));
    setSelectedIds(new Set());
    setSelectionMode(false);
    for (const id of ids) {
      try { await fetch(`${API}/notifications/${id}/read`, { method: 'PUT', credentials: 'include', headers: authHeaders() }); } catch { /* */ }
    }
    fetchUnreadCount();
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    setNotifications(prev => prev.filter(n => !ids.includes(n.id)));
    if (selectedNotification && ids.includes(selectedNotification.id)) setSelectedNotification(null);
    setSelectedIds(new Set());
    setSelectionMode(false);
    for (const id of ids) {
      try { await fetch(`${API}/notifications/${id}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() }); } catch { /* */ }
    }
    fetchUnreadCount();
  };

  /* ─── Filtering ─── */
  const CATEGORIES = getCategories(t);
  const categoryFilter = CATEGORIES.find(c => c.id === activeCategory);
  const filtered = notifications.filter(n => {
    // Category filter
    if (categoryFilter?.matchTypes && !categoryFilter.matchTypes.includes(n.type)) return false;
    // Read status filter
    if (readFilter === 'read' && !n.is_read) return false;
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      return (n.title || '').toLowerCase().includes(q) || (n.message || '').toLowerCase().includes(q);
    }
    return true;
  });

  const grouped = groupByDate(filtered, t);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filtered.map(n => n.id)));
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-bg">
      {/* Top bar */}
      <div className="sticky top-14 z-30 glass border-b border-line">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors text-muted hover:text-txt">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <BellRing size={18} className="text-primary-400" />
            <h1 className="text-sm font-semibold text-txt">{t('notifications.manager', 'Notification Center')}</h1>
            {unreadCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-400">
                {unreadCount} {t('notifications.unread', 'unread')}
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Toolbar */}
          <div className="flex items-center gap-1">
            {selectionMode && selectedIds.size > 0 && (
              <>
                <span className="text-xs text-muted mr-1">{selectedIds.size} {t('notifications.selected', 'selected')}</span>
                <button onClick={bulkMarkRead} className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-muted hover:text-emerald-400 transition-colors" title={t('notifications.markSelectedRead', 'Mark selected as read')}>
                  <CheckCheck size={16} />
                </button>
                <button onClick={bulkDelete} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors" title={t('notifications.deleteSelected', 'Delete selected')}>
                  <Trash2 size={16} />
                </button>
                <div className="w-px h-4 bg-line mx-1" />
              </>
            )}
            {selectionMode ? (
              <>
                <button onClick={selectAll} className="px-2 py-1 rounded-lg text-xs font-medium text-muted hover:text-txt hover:bg-surface-2 transition-colors">
                  {t('notifications.selectAll', 'Select all')}
                </button>
                <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="px-2 py-1 rounded-lg text-xs font-medium text-primary-400 hover:bg-primary-600/10 transition-colors">
                  {t('notifications.cancel', 'Cancel')}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setSelectionMode(true)} className="px-2 py-1 rounded-lg text-xs font-medium text-muted hover:text-txt hover:bg-surface-2 transition-colors">
                  {t('notifications.select', 'Select')}
                </button>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="px-2 py-1 rounded-lg text-xs font-medium text-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-1">
                    <CheckCheck size={14} />
                    {t('notifications.markAllRead', 'Mark all read')}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={deleteAll} className="px-2 py-1 rounded-lg text-xs font-medium text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1">
                    <Trash2 size={14} />
                    {t('notifications.deleteAll', 'Delete all')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6 h-[calc(100vh-56px-48px)] overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="hidden md:flex w-56 flex-col gap-4 shrink-0 overflow-y-auto">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('notifications.search', 'Search...')}
              className="w-full pl-8 pr-3 py-2 bg-surface border border-line rounded-xl text-sm text-txt placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50 transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-txt">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-2">{t('notifications.categories', 'Categories')}</h3>
            <div className="space-y-0.5">
              {CATEGORIES.map((cat) => {
                const CatIcon = cat.icon;
                const isActive = activeCategory === cat.id;
                const count = cat.matchTypes
                  ? notifications.filter(n => cat.matchTypes.includes(n.type)).length
                  : notifications.length;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-primary-600/15 text-primary-400'
                        : 'text-muted hover:bg-surface-2 hover:text-txt'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CatIcon size={15} />
                      <span>{cat.label}</span>
                    </div>
                    {count > 0 && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                        isActive ? 'bg-primary-500/20 text-primary-400' : 'bg-surface-2 text-muted/70'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Read status filter */}
          <div>
            <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-2">{t('notifications.status', 'Status')}</h3>
            <div className="space-y-0.5">
              {[
                { id: 'all', label: t('notifications.categoryAll', 'All') },
                { id: 'unread', label: t('notifications.unread', 'Unread') },
                { id: 'read', label: t('notifications.read', 'Read') },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setReadFilter(option.id)}
                  className={`w-full px-3 py-2 rounded-xl text-sm text-left font-medium transition-all ${
                    readFilter === option.id
                      ? 'bg-surface-2 text-txt border border-line'
                      : 'text-muted hover:bg-surface hover:text-txt'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-auto pt-4 border-t border-line space-y-2">
            <div className="flex justify-between text-xs text-muted">
              <span>{t('notifications.total', 'Total')}</span>
              <span className="font-medium text-txt">{totalCount}</span>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{t('notifications.unread', 'Unread')}</span>
              <span className="font-medium text-primary-400">{unreadCount}</span>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile filters */}
          <div className="md:hidden flex gap-2 mb-4 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const CatIcon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    activeCategory === cat.id
                      ? 'bg-primary-600/15 text-primary-400'
                      : 'bg-surface-2 text-muted hover:text-txt'
                  }`}
                >
                  <CatIcon size={13} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Mobile search */}
          <div className="md:hidden relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('notifications.search', 'Search notifications...')}
              className="w-full pl-8 pr-3 py-2 bg-surface border border-line rounded-xl text-sm text-txt placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-all"
            />
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto bg-surface border border-line rounded-xl">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
                  <Inbox size={28} className="text-muted/40" />
                </div>
                <p className="text-sm font-medium text-txt/70">
                  {search ? t('notifications.noResults', 'No matching notifications') : t('notifications.empty', 'No notifications yet')}
                </p>
                <p className="text-xs text-muted/60 mt-1.5">
                  {search
                    ? t('notifications.tryDifferent', 'Try a different search term')
                    : t('notifications.emptyDesc', "We'll notify you when something happens")}
                </p>
              </div>
            ) : (
              <div>
                {Object.entries(grouped).map(([label, items]) => (
                  <div key={label}>
                    {/* Date group header */}
                    <div className="sticky top-0 z-10 px-4 py-2 bg-surface-2/80 backdrop-blur-sm border-b border-line/50">
                      <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{label}</span>
                    </div>

                    {/* Items */}
                    {items.map((n) => {
                      const iconInfo = getIconInfo(n.icon);
                      const IconComp = iconInfo.Icon;
                      const isUnread = !n.is_read;
                      const isSelected = selectedIds.has(n.id);
                      const isActive = selectedNotification?.id === n.id;

                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (selectionMode) { toggleSelect(n.id); return; }
                            setSelectedNotification(n);
                            if (isUnread) markAsRead(n.id);
                          }}
                          className={`group relative flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-all duration-150 border-b border-line/20
                            ${isActive
                              ? 'bg-primary-600/[0.06]'
                              : isUnread
                                ? 'hover:bg-primary-600/[0.04]'
                                : 'hover:bg-surface-2/50'
                            }
                          `}
                        >
                          {/* Selection checkbox */}
                          {selectionMode && (
                            <div className="shrink-0 mt-1">
                              <div className={`w-4 h-4 rounded border-2 transition-colors flex items-center justify-center ${
                                isSelected
                                  ? 'bg-primary-500 border-primary-500'
                                  : 'border-line hover:border-primary-400'
                              }`}>
                                {isSelected && <Check size={10} className="text-white" />}
                              </div>
                            </div>
                          )}

                          {/* Unread indicator */}
                          {isUnread && !selectionMode && (
                            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary-500" />
                          )}

                          {/* Icon */}
                          <div className={`shrink-0 w-9 h-9 rounded-lg ${iconInfo.bg} flex items-center justify-center mt-0.5`}>
                            <IconComp size={17} className={iconInfo.color} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${isUnread ? 'font-semibold text-txt' : 'font-medium text-txt/80'}`}>
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-xs text-muted mt-0.5 line-clamp-1 leading-relaxed">{n.message}</p>
                            )}
                            <p className="text-[11px] text-muted/50 mt-1">{formatTime(n.created_at, t)}</p>
                          </div>

                          {/* Hover actions */}
                          {!selectionMode && (
                            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {isUnread && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                  className="p-1.5 rounded-md hover:bg-surface-2 text-muted hover:text-emerald-400 transition-colors"
                                  title={t('notifications.markAsReadTooltip', 'Mark as read')}
                                >
                                  <Check size={14} />
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                                className="p-1.5 rounded-md hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
                                title={t('notifications.deleteTooltip', 'Delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Load more */}
                {hasMore && (
                  <button
                    onClick={() => fetchNotifications(page + 1, true)}
                    disabled={loading}
                    className="w-full py-3 text-xs font-medium text-muted hover:text-txt hover:bg-surface-2 transition-colors"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : t('notifications.loadMore', 'Load more notifications')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Detail panel ── */}
        {selectedNotification && (
          <div className="hidden lg:flex w-80 flex-col shrink-0 bg-surface border border-line rounded-xl overflow-hidden">
            {/* Detail header */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t('notifications.details', 'Details')}</h3>
              <button
                onClick={() => setSelectedNotification(null)}
                className="p-1 rounded-md hover:bg-surface-2 text-muted hover:text-txt transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Detail content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(() => {
                const iconInfo = getIconInfo(selectedNotification.icon);
                const IconComp = iconInfo.Icon;
                return (
                  <>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${iconInfo.bg} flex items-center justify-center`}>
                        <IconComp size={20} className={iconInfo.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-txt">{selectedNotification.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium ${
                            selectedNotification.is_read
                              ? 'bg-surface-2 text-muted'
                              : 'bg-primary-500/15 text-primary-400'
                          }`}>
                          {selectedNotification.is_read ? t('notifications.statusRead', 'Read') : t('notifications.statusUnread', 'Unread')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedNotification.message && (
                      <div className="bg-surface-2/50 rounded-lg p-3">
                        <p className="text-sm text-txt/90 leading-relaxed">{selectedNotification.message}</p>
                      </div>
                    )}

                    <div className="space-y-3 text-xs">
                      <div className="flex justify-between text-muted">
                        <span>{t('notifications.type', 'Type')}</span>
                        <span className="font-medium text-txt/70 capitalize">{(selectedNotification.type || '').replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>{t('notifications.created', 'Created')}</span>
                        <span className="font-medium text-txt/70">{formatFullDate(selectedNotification.created_at)}</span>
                      </div>
                      {selectedNotification.read_at && (
                        <div className="flex justify-between text-muted">
                          <span>{t('notifications.readAt', 'Read at')}</span>
                          <span className="font-medium text-txt/70">{formatFullDate(selectedNotification.read_at)}</span>
                        </div>
                      )}
                    </div>

                    {selectedNotification.data && (
                      <div>
                        <h4 className="text-xs font-bold text-muted uppercase tracking-widest mb-2">{t('notifications.metadata', 'Metadata')}</h4>
                        <div className="bg-surface-2/50 rounded-lg p-3 space-y-1">
                          {Object.entries(selectedNotification.data).map(([key, val]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-muted capitalize">{key.replace(/_/g, ' ')}</span>
                              <span className="text-txt/70 font-medium max-w-[60%] truncate text-right">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Detail footer */}
            <div className="border-t border-line p-3 flex gap-2">
              {selectedNotification.action_url && (
                <button
                  onClick={() => { window.location.href = selectedNotification.action_url; }}
                  className="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-colors text-center"
                >
                  {t('notifications.open', 'Open')}
                </button>
              )}
              <button
                onClick={() => deleteNotification(selectedNotification.id)}
                className="py-2 px-3 rounded-lg bg-surface-2 hover:bg-red-500/10 text-muted hover:text-red-400 text-xs font-medium transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
