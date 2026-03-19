import { useState, useEffect } from 'react';
import { Megaphone, X, Info, AlertTriangle, Bell, ExternalLink, ArrowRight } from 'lucide-react';
import { getAnnouncements, markAnnouncementRead } from '../api';
import { useLanguage } from '../LanguageContext';

const TYPE_STYLES = {
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', icon: Info },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', icon: AlertTriangle },
  update: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', icon: Bell },
  important: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: Megaphone },
};

// ==== SECURITY: URL validation helper ====
function isValidUrl(url) {
  if (!url) return true; // Optional field
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export default function AnnouncementBanner({ user }) {
  const { t } = useLanguage();
  const [announcements, setAnnouncements] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dismissed_announcements') || '{}');
      // Clean up old entries (older than 90 days)
      const now = Date.now();
      const cleaned = Object.entries(stored).reduce((acc, [id, timestamp]) => {
        if (now - timestamp < 90 * 24 * 60 * 60 * 1000) {
          acc[id] = timestamp;
        }
        return acc;
      }, {});
      return cleaned;
    } catch { return {}; }
  });

  useEffect(() => {
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [user]);

  const fetchAnnouncements = async () => {
    try {
      const data = await getAnnouncements();
      setAnnouncements(data || []);
    } catch { /* ignore */ }
  };

  const handleDismiss = async (id) => {
    const now = Date.now();
    const newDismissed = { ...dismissedIds, [id]: now };
    setDismissedIds(newDismissed);
    localStorage.setItem('dismissed_announcements', JSON.stringify(newDismissed));
    if (user) {
      try {
        await markAnnouncementRead(id);
      } catch { /* ignore */ }
    }
  };

  const shouldShowAnnouncement = (announcement) => {
    // Check if dismissed
    const dismissedTime = dismissedIds[announcement.id];
    if (dismissedTime) {
      // Check auto-dismiss duration
      if (announcement.auto_dismiss_days) {
        const daysSinceDismiss = (Date.now() - dismissedTime) / (24 * 60 * 60 * 1000);
        if (daysSinceDismiss < announcement.auto_dismiss_days) {
          return false; // Still within auto-dismiss period
        }
      } else {
        return false; // Dismissed permanently
      }
    }
    return true;
  };

  const visibleAnnouncements = announcements.filter(shouldShowAnnouncement);

  if (visibleAnnouncements.length === 0) return null;

  return (
    <div className="space-y-2 mb-2">
      {visibleAnnouncements.slice(0, 3).map(announcement => {
        const style = TYPE_STYLES[announcement.type] || TYPE_STYLES.info;
        const Icon = style.icon;
        const isDismissible = announcement.dismissible !== 0;
        
        return (
          <div
            key={announcement.id}
            className={`${style.bg} border ${style.border} rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in`}
          >
            <Icon size={16} className={`${style.text} mt-0.5 shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${style.text}`}>{announcement.title}</p>
              {announcement.content && (
                <p className="text-xs text-muted mt-0.5 line-clamp-2">{announcement.content}</p>
              )}
              {announcement.link_url && isValidUrl(announcement.link_url) && (
                <a
                  href={announcement.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 mt-2 text-xs ${style.text} hover:underline font-medium`}
                >
                  {announcement.link_text || t('announcement.readMore')}
                  <ArrowRight size={12} />
                </a>
              )}
            </div>
            {isDismissible && (
              <button
                onClick={() => handleDismiss(announcement.id)}
                className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors shrink-0"
                title={t('announcement.hide')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
