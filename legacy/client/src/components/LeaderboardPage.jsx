import { useState, useEffect } from 'react';
import { Trophy, Medal, Flame, ArrowLeft, Loader2, Crown, Star, TrendingUp } from 'lucide-react';
import { getLeaderboard } from '../api';
import { useLanguage } from '../LanguageContext';

const PERIODS = [
  { value: 'week', labelKey: 'leaderboard.thisWeek' },
  { value: 'month', labelKey: 'leaderboard.thisMonth' },
  { value: 'all', labelKey: 'leaderboard.allTime' },
];

const RANK_STYLES = [
  { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', icon: Crown },
  { bg: 'bg-gray-400/15', border: 'border-gray-400/30', text: 'text-gray-300', icon: Medal },
  { bg: 'bg-orange-500/15', border: 'border-orange-500/30', text: 'text-orange-400', icon: Medal },
];

const DEFAULT_RANK_STYLE = { bg: 'bg-surface-2/60', border: 'border-line', text: 'text-txt', icon: Star };

export default function LeaderboardPage({ onBack }) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await getLeaderboard(period);
      setData(result || []);
    } catch { setData([]); }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-xl bg-surface hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-3xl font-extrabold flex items-center gap-3 font-display">
            <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/20 rounded-xl flex items-center justify-center">
              <Trophy className="text-amber-400" size={22} />
            </div>
            {t('leaderboard.title')}
          </h1>
          <p className="text-muted mt-1">{t('leaderboard.subtitle')}</p>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex gap-1 mb-6 bg-surface p-1 rounded-xl w-fit">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === p.value
              ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
              : 'text-muted hover:text-txt hover:bg-surface-2'
              }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-12 text-center">
          <Trophy size={48} className="mx-auto mb-4 text-line" />
          <h3 className="text-lg font-medium mb-1">{t('leaderboard.noData')}</h3>
          <p className="text-muted text-sm">{t('leaderboard.noDataDesc')}</p>
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {data.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[1, 0, 2].map(idx => {
                const entry = data[idx];
                if (!entry) return null;
                const rank = idx;
                const style = RANK_STYLES[rank] || DEFAULT_RANK_STYLE;
                const Icon = style.icon || Star;
                return (
                  <div
                    key={`${entry.user_id || entry.username || 'user'}-${idx}`}
                    className={`${style.bg} border ${style.border} rounded-2xl p-5 text-center ${rank === 0 ? 'transform -translate-y-3' : ''} transition-all`}
                  >
                    <div className={`w-12 h-12 mx-auto rounded-full ${style.bg} border ${style.border} flex items-center justify-center mb-3`}>
                      <Icon size={20} className={style.text} />
                    </div>
                    <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-xl font-bold text-white mb-2 shadow-lg">
                      {(entry.display_name || entry.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-sm truncate">{entry.display_name || entry.username}</p>
                    <p className={`text-2xl font-extrabold mt-1 ${style.text}`}>{entry.score}</p>
                    <p className="text-xs text-muted mt-1">{t('leaderboard.score')}</p>
                    {entry.current_streak > 0 && (
                      <div className="flex items-center justify-center gap-1 mt-2 text-xs text-orange-400">
                        <Flame size={12} /> {entry.current_streak}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Full ranking table */}
          <div className="bg-surface border border-line rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-muted text-xs uppercase tracking-wider">
                  <th className="text-left py-3 px-5 w-12">#</th>
                  <th className="text-left py-3 px-5">{t('leaderboard.user')}</th>
                  <th className="text-center py-3 px-5">{t('leaderboard.score')}</th>
                  <th className="text-center py-3 px-5 hidden sm:table-cell">{t('leaderboard.streak')}</th>
                  <th className="text-center py-3 px-5 hidden md:table-cell">{t('leaderboard.flashcards')}</th>
                  <th className="text-center py-3 px-5 hidden md:table-cell">{t('leaderboard.quiz')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry, idx) => {
                  const isTop3 = idx < 3;
                  const style = RANK_STYLES[idx] || DEFAULT_RANK_STYLE;
                  return (
                    <tr key={`${entry.user_id || entry.username || 'user'}-${idx}`} className={`border-b border-line last:border-b-0 transition-colors ${isTop3 ? style.bg : 'hover:bg-surface-2/50'}`}>
                      <td className="py-3 px-5">
                        {isTop3 ? (
                          <span className={`w-7 h-7 inline-flex items-center justify-center rounded-full font-bold text-xs ${style.bg} ${style.text}`}>
                            {idx + 1}
                          </span>
                        ) : (
                          <span className="text-muted font-medium">{idx + 1}</span>
                        )}
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {(entry.display_name || entry.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium truncate">{entry.display_name || entry.username}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-center">
                        <span className={`font-bold ${isTop3 ? style.text : 'text-primary-400'}`}>
                          {entry.score}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-center hidden sm:table-cell">
                        {entry.current_streak > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-400 font-medium">
                            <Flame size={12} /> {entry.current_streak}
                          </span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-center hidden md:table-cell text-muted">{entry.total_flashcards || 0}</td>
                      <td className="py-3 px-5 text-center hidden md:table-cell text-muted">{entry.total_quizzes || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
