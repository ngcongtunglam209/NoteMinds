import { useState, useEffect } from 'react';
import {
  BarChart3, ArrowLeft, Loader2, Flame, Target, BookOpen,
  CreditCard, FileText, MessageCircle, Clock, TrendingUp,
  Check, Edit3, Save
} from 'lucide-react';
import { getGoals, updateGoals, getActivityHistory } from '../api';
import { useLanguage } from '../LanguageContext';

export default function StatsPage({ onBack, user }) {
  const { t } = useLanguage();
  const [goals, setGoals] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalForm, setGoalForm] = useState({ daily_flashcards: 20, daily_quizzes: 3, daily_documents: 2 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [goalsData, activityData] = await Promise.all([
        getGoals(),
        getActivityHistory(30)
      ]);
      setGoals(goalsData);
      setGoalForm({
        daily_flashcards: goalsData?.goals?.daily_flashcards || 20,
        daily_quizzes: goalsData?.goals?.daily_quizzes || 3,
        daily_documents: goalsData?.goals?.daily_documents || 2,
      });
      setActivity(activityData || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleSaveGoals = async () => {
    try {
      const data = await updateGoals(goalForm);
      setGoals(prev => ({ ...prev, goals: data.goals }));
      setEditingGoals(false);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 size={32} className="animate-spin text-primary-400" />
      </div>
    );
  }

  const streak = goals?.streak || { current_streak: 0, longest_streak: 0 };
  const todayActivity = goals?.today || { flashcards_reviewed: 0, quizzes_completed: 0, documents_uploaded: 0, chat_messages: 0, study_minutes: 0 };
  const userGoals = goals?.goals || { daily_flashcards: 20, daily_quizzes: 3, daily_documents: 2 };

  // Calculate goal progress percentages
  const flashcardProgress = Math.min(100, Math.round((todayActivity.flashcards_reviewed / userGoals.daily_flashcards) * 100));
  const quizProgress = Math.min(100, Math.round((todayActivity.quizzes_completed / userGoals.daily_quizzes) * 100));
  const docProgress = Math.min(100, Math.round((todayActivity.documents_uploaded / userGoals.daily_documents) * 100));

  // Activity heatmap (last 30 days)
  const maxActivity = Math.max(1, ...activity.map(a => (a.flashcards_reviewed || 0) + (a.quizzes_completed || 0) + (a.documents_uploaded || 0)));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-xl bg-surface hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 font-display">
            <div className="w-10 h-10 bg-primary-600/15 border border-primary-500/20 rounded-xl flex items-center justify-center">
              <BarChart3 className="text-primary-400" size={22} />
            </div>
            {t('stats.title')}
          </h1>
          <p className="text-muted mt-1">{t('stats.subtitle')}</p>
        </div>
      </div>

      {/* Streak + Today stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-orange-500/15 to-orange-600/5 border border-orange-500/20 rounded-2xl p-5 text-center">
          <Flame size={28} className="mx-auto mb-2 text-orange-400" />
          <p className="text-3xl font-extrabold text-orange-400">{streak.current_streak}</p>
          <p className="text-xs text-muted mt-1">{t('stats.currentStreak')}</p>
        </div>
        <div className="bg-gradient-to-br from-primary-500/15 to-primary-600/5 border border-primary-500/20 rounded-2xl p-5 text-center">
          <TrendingUp size={28} className="mx-auto mb-2 text-primary-400" />
          <p className="text-3xl font-extrabold text-primary-400">{streak.longest_streak}</p>
          <p className="text-xs text-muted mt-1">{t('stats.longestStreak')}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-600/5 border border-emerald-500/20 rounded-2xl p-5 text-center">
          <CreditCard size={28} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-3xl font-extrabold text-emerald-400">{todayActivity.flashcards_reviewed}</p>
          <p className="text-xs text-muted mt-1">{t('stats.flashcardsToday')}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500/15 to-purple-600/5 border border-purple-500/20 rounded-2xl p-5 text-center">
          <FileText size={28} className="mx-auto mb-2 text-purple-400" />
          <p className="text-3xl font-extrabold text-purple-400">{todayActivity.quizzes_completed}</p>
          <p className="text-xs text-muted mt-1">{t('stats.quizzesToday')}</p>
        </div>
      </div>

      {/* Daily Goals */}
      <div className="bg-surface border border-line rounded-2xl p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Target size={18} className="text-primary-400" />
            {t('stats.dailyGoals')}
          </h2>
          <button
            onClick={() => editingGoals ? handleSaveGoals() : setEditingGoals(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600/10 border border-primary-500/20 rounded-lg text-primary-400 hover:bg-primary-600/20 transition-all"
          >
            {editingGoals ? <><Save size={12} /> {t('stats.save')}</> : <><Edit3 size={12} /> {t('stats.edit')}</>}
          </button>
        </div>

        <div className="space-y-4">
          <GoalBar
            icon={<CreditCard size={15} />}
            label={t('stats.flashcards')}
            current={todayActivity.flashcards_reviewed}
            target={editingGoals ? goalForm.daily_flashcards : userGoals.daily_flashcards}
            progress={flashcardProgress}
            color="emerald"
            editing={editingGoals}
            onChangeTarget={(v) => setGoalForm(p => ({ ...p, daily_flashcards: v }))}
          />
          <GoalBar
            icon={<FileText size={15} />}
            label={t('stats.quiz')}
            current={todayActivity.quizzes_completed}
            target={editingGoals ? goalForm.daily_quizzes : userGoals.daily_quizzes}
            progress={quizProgress}
            color="purple"
            editing={editingGoals}
            onChangeTarget={(v) => setGoalForm(p => ({ ...p, daily_quizzes: v }))}
          />
          <GoalBar
            icon={<BookOpen size={15} />}
            label={t('stats.documents')}
            current={todayActivity.documents_uploaded}
            target={editingGoals ? goalForm.daily_documents : userGoals.daily_documents}
            progress={docProgress}
            color="blue"
            editing={editingGoals}
            onChangeTarget={(v) => setGoalForm(p => ({ ...p, daily_documents: v }))}
          />
        </div>
      </div>

      {/* Activity heatmap (last 30 days) */}
      <div className="bg-surface border border-line rounded-2xl p-6">
        <h2 className="text-lg font-bold flex items-center gap-2 mb-5">
          <Clock size={18} className="text-primary-400" />
          {t('stats.activity30Days')}
        </h2>

        {activity.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t('stats.noActivityData')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {Array.from({ length: 30 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (29 - i));
                const dateStr = date.toISOString().split('T')[0];
                const dayData = activity.find(a => a.activity_date === dateStr);
                const total = dayData ? (dayData.flashcards_reviewed || 0) + (dayData.quizzes_completed || 0) + (dayData.documents_uploaded || 0) : 0;
                const intensity = total / maxActivity;
                const bg = total === 0
                  ? 'bg-surface-2'
                  : intensity < 0.25 ? 'bg-primary-600 opacity-20'
                    : intensity < 0.5 ? 'bg-primary-600 opacity-40'
                      : intensity < 0.75 ? 'bg-primary-600 opacity-60'
                        : 'bg-primary-600 opacity-90';
                return (
                  <div
                    key={dateStr}
                    className={`w-7 h-7 rounded-md ${bg} transition-all hover:scale-110 cursor-default`}
                    title={`${date.toLocaleDateString()}: ${total} ${t('stats.activityLabel')}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>{t('stats.less')}</span>
              <div className="w-4 h-4 rounded bg-surface-2" />
              <div className="w-4 h-4 rounded bg-primary-600 opacity-20" />
              <div className="w-4 h-4 rounded bg-primary-600 opacity-40" />
              <div className="w-4 h-4 rounded bg-primary-600 opacity-60" />
              <div className="w-4 h-4 rounded bg-primary-600 opacity-90" />
              <span>{t('stats.more')}</span>
            </div>

            {/* Activity summary table */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Flashcards', value: activity.reduce((s, a) => s + (a.flashcards_reviewed || 0), 0), icon: CreditCard, color: 'text-emerald-400' },
                { label: 'Quiz', value: activity.reduce((s, a) => s + (a.quizzes_completed || 0), 0), icon: FileText, color: 'text-purple-400' },
                { label: t('stats.documents'), value: activity.reduce((s, a) => s + (a.documents_uploaded || 0), 0), icon: BookOpen, color: 'text-blue-400' },
                { label: t('stats.messages'), value: activity.reduce((s, a) => s + (a.chat_messages || 0), 0), icon: MessageCircle, color: 'text-amber-400' },
                { label: t('stats.studyMinutes'), value: activity.reduce((s, a) => s + (a.study_minutes || 0), 0), icon: Clock, color: 'text-primary-400' },
              ].map(s => (
                <div key={s.label} className="bg-bg border border-line rounded-xl p-3 text-center">
                  <s.icon size={16} className={`mx-auto mb-1 ${s.color}`} />
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted">{s.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GoalBar({ icon, label, current, target, progress, color, editing, onChangeTarget }) {
  const colorMap = {
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
    purple: { bar: 'bg-purple-500', text: 'text-purple-400' },
    blue: { bar: 'bg-blue-500', text: 'text-blue-400' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={c.text}>{icon}</span>
          {label}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-bold ${c.text}`}>{current}</span>
          <span className="text-muted">/</span>
          {editing ? (
            <input
              type="number"
              min={1}
              max={999}
              value={target}
              onChange={(e) => onChangeTarget(parseInt(e.target.value) || 1)}
              className="w-14 bg-bg border border-line rounded-lg px-2 py-0.5 text-sm text-center focus:outline-none focus:border-primary-500/50"
            />
          ) : (
            <span className="text-muted">{target}</span>
          )}
          {progress >= 100 && <Check size={14} className="text-emerald-400" />}
        </div>
      </div>
      <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
