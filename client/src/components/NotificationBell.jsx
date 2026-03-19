import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, BellRing, X, Check, CheckCheck, Trash2, ExternalLink, Loader2,
  Map, BookOpen, HelpCircle, FileText, Share2, Globe, Trophy, Flame,
  Lock, ArrowUpCircle, AlertTriangle, ShieldAlert, Users, Settings
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { getApiBaseUrl, getStoredToken } from '../api';

const API = getApiBaseUrl();

function authHeaders(extra = {}) {
  const token = getStoredToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/* ─── Icon mapping: lucide icons with themed colors ─── */
const ICON_MAP = {
  mindmap:   { Icon: Map,            color: 'text-violet-400', bg: 'bg-violet-500/10' },
  flashcard: { Icon: BookOpen,       color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
  quiz:      { Icon: HelpCircle,     color: 'text-cyan-400',   bg: 'bg-cyan-500/10'   },
  summary:   { Icon: FileText,       color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
  share:     { Icon: Share2,         color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
  globe:     { Icon: Globe,          color: 'text-teal-400',   bg: 'bg-teal-500/10'   },
  trophy:    { Icon: Trophy,         color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  flame:     { Icon: Flame,          color: 'text-orange-400', bg: 'bg-orange-500/10' },
  lock:      { Icon: Lock,           color: 'text-slate-400',  bg: 'bg-slate-500/10'  },
  upgrade:   { Icon: ArrowUpCircle,  color: 'text-primary-400',bg: 'bg-primary-500/10'},
  alert:     { Icon: AlertTriangle,  color: 'text-red-400',    bg: 'bg-red-500/10'    },
  admin:     { Icon: ShieldAlert,    color: 'text-primary-400',bg: 'bg-primary-500/10'},
  community: { Icon: Users,          color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  check:     { Icon: Check,          color: 'text-emerald-400',bg: 'bg-emerald-500/10'},
  settings:  { Icon: Settings,       color: 'text-muted',      bg: 'bg-surface-2'     },
  default:   { Icon: Bell,           color: 'text-muted',      bg: 'bg-surface-2'     },
};

function getIconInfo(icon) {
  return ICON_MAP[icon] || ICON_MAP.default;
}

/* ─── Time formatting ─── */
function timeAgo(dateStr, t) {
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
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ─── Single notification item ─── */
export function NotificationItem({ notification, onRead, onDelete, compact = false, t }) {
  const iconInfo = getIconInfo(notification.icon);
  const IconComp = iconInfo.Icon;
  const isUnread = !notification.is_read;

  const handleClick = () => {
    if (isUnread) onRead(notification.id);
    if (notification.action_url) {
      window.location.href = notification.action_url;
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-all duration-150
        ${isUnread
          ? 'bg-primary-600/[0.04] hover:bg-primary-600/[0.08]'
          : 'hover:bg-surface-2'
        }
      `}
    >
      {/* Unread dot */}
      {isUnread && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary-500" />
      )}

      {/* Icon */}
      <div className={`shrink-0 w-8 h-8 rounded-lg ${iconInfo.bg} flex items-center justify-center mt-0.5`}>
        <IconComp size={16} className={iconInfo.color} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm leading-snug ${isUnread ? 'font-semibold text-txt' : 'font-medium text-txt/80'}`}>
            {notification.title}
          </p>
        </div>
        {!compact && notification.message && (
          <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
            {notification.message}
          </p>
        )}
        <p className="text-[11px] text-muted/60 mt-1">{timeAgo(notification.created_at, t)}</p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isUnread && (
          <button
            onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
            className="p-1 rounded-md hover:bg-surface-2 text-muted hover:text-emerald-400 transition-colors"
            title={t('notifications.markAsReadTooltip', 'Mark as read')}
          >
            <Check size={14} />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          className="p-1 rounded-md hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors"
          title={t('notifications.deleteTooltip', 'Delete')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Notification bell with dropdown menu ─── */
export function NotificationBell({ userId, className = '', onOpenManager }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const ref = useRef(null);
  const { t } = useLanguage();

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotifications = useCallback(async (pageNum = 0) => {
    if (!userId) return;
    try {
      setIsLoading(true);
      const unreadOnly = selectedFilter === 'unread';
      const response = await fetch(
        `${API}/notifications?limit=10&offset=${pageNum * 10}&unreadOnly=${unreadOnly}`,
        { credentials: 'include', headers: authHeaders() }
      );
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();

      if (pageNum === 0) setNotifications(data.notifications);
      else setNotifications((prev) => [...prev, ...data.notifications]);

      setHasMore(data.notifications.length === 10);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, selectedFilter]);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API}/notifications/unread-count`, { credentials: 'include', headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadCount(data.unread_count);
    } catch { /* silent */ }
  }, [userId]);

  useEffect(() => { if (isOpen) fetchNotifications(0); }, [isOpen, selectedFilter]);
  
  // SSE real-time updates + fallback polling
  useEffect(() => {
    fetchUnreadCount();
    const token = getStoredToken();
    let es = null;
    let fallbackInterval = null;
    
    if (token && userId) {
      try {
        es = new EventSource(`${API}/notifications/stream?token=${encodeURIComponent(token)}`);
        
        es.addEventListener('new_notification', () => {
          fetchUnreadCount();
          if (isOpen) fetchNotifications(0);
        });
        
        es.onerror = () => {
          // On SSE failure, fall back to polling
          if (es) { es.close(); es = null; }
          if (!fallbackInterval) {
            fallbackInterval = setInterval(fetchUnreadCount, 15000);
          }
        };
      } catch {
        // SSE not available, use polling
        fallbackInterval = setInterval(fetchUnreadCount, 15000);
      }
    }
    
    // Always have a slow fallback poll
    if (!es) {
      fallbackInterval = setInterval(fetchUnreadCount, 15000);
    }
    
    return () => {
      if (es) es.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [fetchUnreadCount, userId]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await fetch(`${API}/notifications/${notificationId}/read`, { method: 'PUT', credentials: 'include', headers: authHeaders() });
      setNotifications((prev) =>
        prev.map((n) => n.id === notificationId ? { ...n, is_read: 1, read_at: new Date().toISOString() } : n)
      );
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  const handleDelete = async (notificationId) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    try {
      await fetch(`${API}/notifications/${notificationId}`, { method: 'DELETE', credentials: 'include', headers: authHeaders() });
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1, read_at: new Date().toISOString() })));
    try {
      await fetch(`${API}/notifications/mark-all-read`, { method: 'POST', credentials: 'include', headers: authHeaders() });
      fetchUnreadCount();
    } catch { /* silent */ }
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg transition-colors ${
          isOpen
            ? 'bg-primary-600/10 text-primary-400'
            : 'text-muted hover:text-txt hover:bg-surface-2'
        }`}
        title={t('notifications.title', 'Notifications')}
      >
        {unreadCount > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-primary-500 rounded-full ring-2 ring-surface">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-surface border border-line rounded-xl shadow-2xl z-50 flex flex-col max-h-[480px] animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-txt">{t('notifications.title', 'Notifications')}</h3>
              {unreadCount > 0 && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-primary-500/10 text-primary-400">
                  {unreadCount} {t('notifications.new', 'new')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="p-1.5 rounded-lg text-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title={t('notifications.markAllRead', 'Mark all as read')}
                >
                  <CheckCheck size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-3 py-2 border-b border-line/50 flex gap-1">
            {['all', 'unread'].map((filter) => (
              <button
                key={filter}
                onClick={() => setSelectedFilter(filter)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                  selectedFilter === filter
                    ? 'bg-primary-600/15 text-primary-400'
                    : 'text-muted hover:text-txt hover:bg-surface-2'
                }`}
              >
                {filter === 'all' ? t('notifications.categoryAll', 'All') : t('notifications.unread', 'Unread')}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1 overscroll-contain">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
                  <Bell size={20} className="text-muted/50" />
                </div>
                <p className="text-sm text-muted">{t('notifications.empty', 'No notifications yet')}</p>
                <p className="text-xs text-muted/60 mt-1">{t('notifications.emptyDesc', "We'll notify you when something happens")}</p>
              </div>
            ) : (
              <div className="divide-y divide-line/30">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onRead={handleMarkAsRead}
                    onDelete={handleDelete}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-line flex">
            {hasMore && notifications.length > 0 && (
              <button
                onClick={() => !isLoading && fetchNotifications(page + 1)}
                disabled={isLoading}
                className="flex-1 py-2.5 text-xs font-medium text-muted hover:text-txt hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin mx-auto" /> : t('notifications.loadMore', 'Load more')}
              </button>
            )}
            {onOpenManager && (
              <button
                onClick={() => { setIsOpen(false); onOpenManager(); }}
                className="flex-1 py-2.5 text-xs font-medium text-primary-400 hover:bg-primary-600/10 transition-colors flex items-center justify-center gap-1.5"
              >
                {t('notifications.viewAll', 'View all')}
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
