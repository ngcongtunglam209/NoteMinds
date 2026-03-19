import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, X, Focus, SkipForward, Settings, Coffee, Brain, Zap, ChevronUp, ChevronDown, Volume2, VolumeX, Minimize2 } from 'lucide-react';
import { trackActivity } from '../api';
import { useLanguage } from '../LanguageContext';

export default function PomodoroTimer({ onClose }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState('focus');
  const [isActive, setIsActive] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [totalFocusSeconds, setTotalFocusSeconds] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const quotes = useMemo(() => [
    t('pomodoro.quote1'),
    t('pomodoro.quote2'),
    t('pomodoro.quote3'),
    t('pomodoro.quote4'),
    t('pomodoro.quote5'),
    t('pomodoro.quote6'),
    t('pomodoro.quote7'),
    t('pomodoro.quote8'),
  ], [t]);
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);
  const [autoStart, setAutoStart] = useState(true);

  const [durations, setDurations] = useState(() => {
    try {
      const saved = localStorage.getItem('notemind_pomodoro_durations');
      return saved ? JSON.parse(saved) : { focus: 25, shortBreak: 5, longBreak: 15 };
    } catch { return { focus: 25, shortBreak: 5, longBreak: 15 }; }
  });

  const [timeLeft, setTimeLeft] = useState(durations.focus * 60);
  const timerRef = useRef(null);
  const focusTrackerRef = useRef(null);

  const MODES = {
    focus: {
      label: t('pomodoro.focusTime'),
      time: durations.focus * 60,
      color: 'text-primary-400',
      ringColor: 'stroke-primary-500',
      bg: 'bg-primary-500/10',
      icon: Brain,
    },
    shortBreak: {
      label: t('pomodoro.shortBreak'),
      time: durations.shortBreak * 60,
      color: 'text-emerald-400',
      ringColor: 'stroke-emerald-500',
      bg: 'bg-emerald-500/10',
      icon: Coffee,
    },
    longBreak: {
      label: t('pomodoro.longBreak'),
      time: durations.longBreak * 60,
      color: 'text-blue-400',
      ringColor: 'stroke-blue-500',
      bg: 'bg-blue-500/10',
      icon: Zap,
    },
  };

  useEffect(() => {
    localStorage.setItem('notemind_pomodoro_durations', JSON.stringify(durations));
  }, [durations]);

  // Track focus minutes every 60s
  useEffect(() => {
    if (isActive && mode === 'focus') {
      focusTrackerRef.current = setInterval(() => {
        setTotalFocusSeconds(prev => prev + 60);
        trackActivity('study_minutes').catch(() => { });
      }, 60000);
    }
    return () => clearInterval(focusTrackerRef.current);
  }, [isActive, mode]);

  // Main timer
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      handleComplete();
    }
    return () => clearInterval(timerRef.current);
  }, [isActive, timeLeft]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space' && !showSettings && !e.target.closest('input')) {
        e.preventDefault();
        setIsActive(prev => !prev);
      }
      if (e.code === 'Escape') {
        if (showSettings) setShowSettings(false);
        else if (!minimized) setMinimized(true);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showSettings, minimized, onClose]);

  const playNotification = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, start, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(523, 0, 0.15);
      playTone(659, 0.2, 0.15);
      playTone(784, 0.4, 0.3);
    } catch { /* no audio context */ }
  }, [soundEnabled]);

  const handleComplete = useCallback(() => {
    setIsActive(false);
    clearInterval(timerRef.current);
    playNotification();

    if (mode === 'focus') {
      const newCycles = cycles + 1;
      setCycles(newCycles);
      if (newCycles % 4 === 0) {
        switchMode('longBreak', true);
      } else {
        switchMode('shortBreak', true);
      }
    } else {
      switchMode('focus', true);
    }
  }, [mode, cycles, playNotification]);

  const switchMode = (newMode, fromAuto = false) => {
    setMode(newMode);
    setTimeLeft(MODES[newMode].time);
    if (fromAuto && autoStart) {
      setTimeout(() => setIsActive(true), 500);
    } else {
      setIsActive(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatMinutes = (seconds) => {
    const m = Math.floor(seconds / 60);
    return m < 1 ? t('pomodoro.lessThanOneMinute') : t('pomodoro.minutesCount', { count: m });
  };

  const currentMode = MODES[mode];
  const progress = ((currentMode.time - timeLeft) / currentMode.time) * 100;
  const circumference = 2 * Math.PI * 140;

  // ── Minimized floating widget ──
  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
        <div className="relative group">
          {isActive && (
            <div className={`absolute inset-0 rounded-2xl blur-xl opacity-30 ${mode === 'focus' ? 'bg-primary-500' : mode === 'shortBreak' ? 'bg-emerald-500' : 'bg-blue-500'} animate-pulse`} />
          )}
          <div className="relative bg-surface border border-line rounded-2xl shadow-2xl shadow-black/40 p-3 flex items-center gap-3 cursor-pointer hover:border-primary-500/30 transition-all"
            onClick={() => setMinimized(false)}>
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 44 44" className="w-10 h-10 -rotate-90">
                <circle cx="22" cy="22" r="18" fill="none" className="stroke-line" strokeWidth="3" />
                <circle cx="22" cy="22" r="18" fill="none" className={currentMode.ringColor} strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={2 * Math.PI * 18 - (2 * Math.PI * 18 * progress) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {isActive ? (
                  <div className={`w-2 h-2 rounded-full ${mode === 'focus' ? 'bg-primary-400' : mode === 'shortBreak' ? 'bg-emerald-400' : 'bg-blue-400'} animate-pulse`} />
                ) : (
                  <Play size={12} className="text-muted ml-0.5" />
                )}
              </div>
            </div>
            <div>
              <div className={`text-sm font-bold font-mono ${currentMode.color}`}>{formatTime(timeLeft)}</div>
              <div className="text-[10px] text-muted">{currentMode.label}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors opacity-0 group-hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Full-screen Focus Mode ──
  return (
    <div className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-2xl flex flex-col items-center justify-center animate-fade-in">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.03] blur-3xl pointer-events-none"
        style={{ background: mode === 'focus' ? 'var(--color-primary-500)' : mode === 'shortBreak' ? '#10b981' : '#3b82f6' }} />

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Focus size={18} className={currentMode.color} />
          <span className="text-sm font-bold">{t('pomodoro.focusMode')}</span>
          {cycles > 0 && (
            <span className="text-[11px] text-muted bg-surface border border-line rounded-lg px-2 py-0.5 ml-2">
              {t('pomodoro.cyclesCount', { count: cycles })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl hover:bg-surface-2 text-muted hover:text-txt transition-all" title={soundEnabled ? t('pomodoro.soundOff') : t('pomodoro.soundOn')}>
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-xl hover:bg-surface-2 transition-all ${showSettings ? 'text-primary-400 bg-primary-500/10' : 'text-muted hover:text-txt'}`}
            title={t('pomodoro.settings')}>
            <Settings size={16} />
          </button>
          <button onClick={() => setMinimized(true)}
            className="p-2 rounded-xl hover:bg-surface-2 text-muted hover:text-txt transition-all" title={t('pomodoro.minimize')}>
            <Minimize2 size={16} />
          </button>
          <button onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-2 text-muted hover:text-txt transition-all" title={t('pomodoro.close')}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-16 right-6 w-72 bg-surface border border-line rounded-2xl shadow-2xl shadow-black/30 p-5 animate-fade-in z-10">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Settings size={14} className="text-primary-400" /> {t('pomodoro.customizeTime')}
          </h3>
          {[
            { key: 'focus', label: t('pomodoro.focusLabel'), min: 1, max: 90, icon: Brain },
            { key: 'shortBreak', label: t('pomodoro.shortBreakLabel'), min: 1, max: 30, icon: Coffee },
            { key: 'longBreak', label: t('pomodoro.longBreakLabel'), min: 1, max: 60, icon: Zap },
          ].map(({ key, label, min, max, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between py-2.5 border-b border-line/50 last:border-0">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-muted" />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setDurations(prev => ({ ...prev, [key]: Math.max(min, prev[key] - 5) }))}
                  className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors">
                  <ChevronDown size={14} />
                </button>
                <span className="text-sm font-bold w-10 text-center font-mono">{durations[key]}</span>
                <button
                  onClick={() => setDurations(prev => ({ ...prev, [key]: Math.min(max, prev[key] + 5) }))}
                  className="p-1 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors">
                  <ChevronUp size={14} />
                </button>
                <span className="text-[10px] text-muted w-8">{t('pomodoro.minutes')}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/50">
            <span className="text-xs font-medium">{t('pomodoro.autoStart')}</span>
            <button
              onClick={() => setAutoStart(!autoStart)}
              className={`w-10 h-5 rounded-full transition-all relative ${autoStart ? 'bg-primary-600' : 'bg-surface-2 border border-line'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${autoStart ? 'left-5 bg-white' : 'left-0.5 bg-muted'}`} />
            </button>
          </div>
          <button
            onClick={() => { switchMode(mode); setShowSettings(false); }}
            className="w-full mt-4 py-2 rounded-xl bg-primary-600/10 border border-primary-500/20 text-primary-400 text-xs font-semibold hover:bg-primary-600/20 transition-colors"
          >
            {t('pomodoro.applyReset')}
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="relative flex flex-col items-center">
        {/* Mode switcher */}
        <div className="flex gap-1.5 mb-10 bg-surface/60 backdrop-blur-sm p-1.5 rounded-2xl border border-line/50">
          {Object.entries(MODES).map(([key, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={key}
                onClick={() => switchMode(key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${mode === key
                    ? `${m.bg} ${m.color} border border-current/20 shadow-sm`
                    : 'text-muted hover:text-txt hover:bg-surface-2'
                  }`}
              >
                <Icon size={13} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Timer ring */}
        <div className="relative w-72 h-72 sm:w-80 sm:h-80 mb-8">
          <svg viewBox="0 0 300 300" className="w-full h-full -rotate-90 drop-shadow-lg">
            <circle cx="150" cy="150" r="140" fill="none" className="stroke-line/30" strokeWidth="6" />
            <circle cx="150" cy="150" r="140" fill="none" className={currentMode.ringColor} strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * progress) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear', filter: `drop-shadow(0 0 8px ${mode === 'focus' ? 'var(--color-primary-500)' : mode === 'shortBreak' ? '#10b981' : '#3b82f6'}40)` }}
            />
            {progress > 0 && progress < 100 && (
              <circle
                cx={150 + 140 * Math.cos(((2 * Math.PI * progress) / 100) - Math.PI / 2)}
                cy={150 + 140 * Math.sin(((2 * Math.PI * progress) / 100) - Math.PI / 2)}
                r="5" className={`${mode === 'focus' ? 'fill-primary-400' : mode === 'shortBreak' ? 'fill-emerald-400' : 'fill-blue-400'}`}
                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
              />
            )}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-6xl sm:text-7xl font-bold font-mono tracking-tight ${currentMode.color}`}
              style={{ textShadow: `0 0 40px ${mode === 'focus' ? 'var(--color-primary-500)' : mode === 'shortBreak' ? '#10b981' : '#3b82f6'}15` }}>
              {formatTime(timeLeft)}
            </div>
            <p className="text-xs text-muted mt-2 font-medium">{currentMode.label}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-5 mb-10">
          <button
            onClick={() => { setIsActive(false); setTimeLeft(currentMode.time); }}
            className="p-3 rounded-2xl bg-surface border border-line hover:bg-surface-2 text-muted hover:text-txt transition-all active:scale-95"
            title={t('pomodoro.reset')}
          >
            <RotateCcw size={20} />
          </button>

          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative flex items-center justify-center w-20 h-20 rounded-[28px] shadow-xl transition-all active:scale-95 ${isActive
                ? 'bg-surface border-2 border-line hover:bg-surface-2 text-txt'
                : `bg-gradient-to-br ${mode === 'focus' ? 'from-primary-600 to-primary-500 shadow-primary-600/30' : mode === 'shortBreak' ? 'from-emerald-600 to-emerald-500 shadow-emerald-600/30' : 'from-blue-600 to-blue-500 shadow-blue-600/30'} text-white`
              }`}
          >
            {isActive && (
              <div className="absolute inset-0 rounded-[28px] animate-ping opacity-10 border-2"
                style={{ borderColor: mode === 'focus' ? 'var(--color-primary-500)' : mode === 'shortBreak' ? '#10b981' : '#3b82f6' }} />
            )}
            {isActive ? <Pause size={30} /> : <Play size={30} className="ml-1" />}
          </button>

          <button
            onClick={() => handleComplete()}
            className="p-3 rounded-2xl bg-surface border border-line hover:bg-surface-2 text-muted hover:text-txt transition-all active:scale-95"
            title={t('pomodoro.skip')}
          >
            <SkipForward size={20} />
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-[11px] text-muted/50 mb-6">
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[10px] font-mono">Space</kbd> {t('pomodoro.spaceStartPause')}
          &nbsp;·&nbsp;
          <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[10px] font-mono">Esc</kbd> {t('pomodoro.escMinimize')}
        </p>
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-line/30 bg-surface/30 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold mb-0.5">{t('pomodoro.today')}</p>
              <p className="text-sm font-bold">{formatMinutes(totalFocusSeconds)}</p>
            </div>
            <div className="w-px h-8 bg-line/50" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted/60 font-semibold mb-0.5">{t('pomodoro.cycles')}</p>
              <p className="text-sm font-bold">{cycles} <span className="text-xs text-muted font-normal">/ 4</span></p>
            </div>
            <div className="w-px h-8 bg-line/50" />
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${i < (cycles % 4) ? 'bg-primary-400 scale-110' : 'bg-line'
                  }`} />
              ))}
            </div>
          </div>
          <p className="text-xs text-muted/40 italic max-w-xs text-right hidden sm:block leading-relaxed">
            "{quote}"
          </p>
        </div>
      </div>
    </div>
  );
}
