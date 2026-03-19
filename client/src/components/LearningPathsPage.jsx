import { useState, useEffect } from 'react';
import { useLanguage } from '../LanguageContext';
import {
    Map, Target, Clock, BookOpen, Layers, CheckCircle2, ChevronRight, Play,
    Trash2, Loader2, Sparkles, Brain, Check, BarChart3, AlertCircle
} from 'lucide-react';
import { getLearningPaths, getLearningPath, updateLearningPathProgress, deleteLearningPath } from '../api';

export default function LearningPathsPage({ onBack, onOpenDocument, currentDocId }) {
    const { t } = useLanguage();
    const [paths, setPaths] = useState([]);
    const [selectedPath, setSelectedPath] = useState(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchPaths();
    }, []);

    const fetchPaths = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getLearningPaths();
            setPaths(data || []);

            // If navigating organically or reloading, try to select one
            if (data && data.length > 0) {
                // If we came from a specific doc, try to find its path
                if (currentDocId) {
                    const matched = data.find(p => p.document_ids && p.document_ids.includes(currentDocId));
                    if (matched) {
                        handleSelectPath(matched);
                        return;
                    }
                }
                // Otherwise select first
                handleSelectPath(data[0]);
            } else {
                setLoading(false);
            }
        } catch (err) {
            setError(err.message || t('learningPaths.loadError'));
            setLoading(false);
        }
    };

    const handleSelectPath = async (pathSummary) => {
        try {
            setDetailLoading(true);
            const fullPath = await getLearningPath(pathSummary.id);
            setSelectedPath(fullPath);
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
            setLoading(false);
        }
    };

    const handleToggleStep = async (stepId, isCompleted) => {
        if (!selectedPath) return;
        try {
            const newProgress = await updateLearningPathProgress(selectedPath.id, stepId, !isCompleted);
            setSelectedPath(prev => ({
                ...prev,
                progress: newProgress.progress
            }));
            // Optional: update overall paths array if we track total progress there
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeletePath = async (id) => {
        if (!window.confirm(t('learningPaths.deleteConfirm'))) return;
        try {
            await deleteLearningPath(id);
            setPaths(paths.filter(p => p.id !== id));
            if (selectedPath?.id === id) {
                if (paths.length > 1) {
                    handleSelectPath(paths.find(p => p.id !== id));
                } else {
                    setSelectedPath(null);
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const calculateProgress = (pathData) => {
        if (!pathData || !pathData.steps || pathData.steps.length === 0) return 0;
        const completedCount = pathData.progress?.length || 0;
        return Math.round((completedCount / pathData.steps.length) * 100);
    };

    // Convert "read_summary", "flashcards" into nice UI
    const getActivityMeta = (activityType) => {
        switch (activityType) {
            case 'read_summary': return { icon: BookOpen, label: t('learningPaths.activityReadSummary'), color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
            case 'flashcards': return { icon: Layers, label: t('learningPaths.activityFlashcards'), color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
            case 'quiz': return { icon: Target, label: t('learningPaths.activityQuiz'), color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
            case 'chat': return { icon: Brain, label: t('learningPaths.activityChat'), color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
            default: return { icon: Play, label: activityType, color: 'text-primary-400', bg: 'bg-primary-500/10', border: 'border-primary-500/20' };
        }
    };

    const handleStartActivity = (activityType, docId) => {
        // Navigate to Dashboard with specific tab based on activity type
        // NoteMind's Dashboard uses query params or state to open specific tabs.
        // Here we will use onOpenDocument which sets the currentDoc and navigates to dashboard.
        // To select the tab, the user will have to click it manually for now, or we can use custom event/localStorage.
        if (docId) {
            localStorage.setItem('notemind_auto_open_tab', activityType);
            onOpenDocument({ id: docId, original_name: t('learningPaths.launchFromPath') });
        }
    };

    if (loading && paths.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 size={32} className="animate-spin text-primary-400" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in flex flex-col md:flex-row gap-8">

            {/* Sidebar: Path Selection */}
            <div className="w-full md:w-80 shrink-0 space-y-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-primary-600/15 border border-primary-500/20 rounded-xl flex items-center justify-center">
                        <Map className="text-primary-400" size={22} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold font-display">{t('learningPaths.pageTitle')}</h1>
                        <p className="text-xs text-muted">{t('learningPaths.pageSubtitle')}</p>
                    </div>
                </div>

                {paths.length === 0 ? (
                    <div className="bg-surface border border-line rounded-2xl p-6 text-center">
                        <Sparkles size={24} className="mx-auto mb-3 text-primary-400 opacity-50" />
                        <p className="text-sm font-medium mb-1">{t('learningPaths.emptyTitle')}</p>
                        <p className="text-xs text-muted mb-4">{t('learningPaths.emptyDesc')}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {paths.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleSelectPath(p)}
                                className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedPath?.id === p.id ? 'border-primary-500 bg-primary-600/5 shadow-md shadow-primary-900/10' : 'border-line bg-surface hover:bg-surface-2'}`}
                            >
                                <h3 className="font-bold text-sm mb-1 truncate">{p.name}</h3>
                                <div className="flex gap-3 text-xs text-muted">
                                    <span className="flex items-center gap-1"><Clock size={12} /> {p.estimated_hours}h</span>
                                    <span>{t('learningPaths.stepsCount').replace('{count}', p.steps?.length || 0)}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Main Area: Path Details & Timeline */}
            <div className="flex-1 min-w-0">
                {!selectedPath ? (
                    <div className="h-full min-h-[400px] border border-line border-dashed rounded-3xl flex items-center justify-center flex-col text-center p-8 bg-surface/30">
                        <Map size={48} className="text-muted/30 mb-4" />
                        <p className="text-muted">{t('learningPaths.selectHint')}</p>
                    </div>
                ) : detailLoading ? (
                    <div className="h-full min-h-[400px] border border-line rounded-3xl flex items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary-400" />
                    </div>
                ) : (
                    <div className="bg-surface border border-line rounded-3xl p-6 md:p-8 animate-fade-in relative overflow-hidden">
                        {/* Background elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                        <div className="flex items-start justify-between gap-4 mb-6 relative z-10">
                            <div>
                                <h2 className="text-2xl font-extrabold mb-2">{selectedPath.name}</h2>
                                <p className="text-muted text-sm leading-relaxed">{selectedPath.description}</p>
                            </div>
                            <button
                                onClick={() => handleDeletePath(selectedPath.id)}
                                className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors shrink-0"
                                title={t('learningPaths.deleteTitle')}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        {/* Progress summary */}
                        <div className="flex items-center gap-4 mb-10 p-4 rounded-2xl bg-bg border border-line relative z-10">
                            <div className="w-12 h-12 shrink-0 rounded-full border-4 border-surface-2 relative flex items-center justify-center">
                                {/* Fake circle progress */}
                                <svg className="absolute inset-0 w-full h-full -rotate-90">
                                    <circle cx="20" cy="20" r="20" fill="none" className="stroke-surface-2" strokeWidth="4" />
                                    <circle cx="20" cy="20" r="20" fill="none" className="stroke-primary-500 transition-all duration-1000" strokeWidth="4" strokeDasharray="125" strokeDashoffset={125 - (125 * calculateProgress(selectedPath) / 100)} />
                                </svg>
                                <span className="text-xs font-bold font-display">{calculateProgress(selectedPath)}%</span>
                            </div>
                            <div>
                                <p className="font-bold text-sm">{t('learningPaths.progressTitle')}</p>
                                <p className="text-xs text-muted flex items-center gap-2">
                                    <CheckCircle2 size={12} className="text-emerald-400" />
                                    {t('learningPaths.progressDone')
                                        .replace('{done}', selectedPath.progress?.length || 0)
                                        .replace('{total}', selectedPath.steps?.length || 0)}
                                </p>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div className="space-y-6 relative z-10 before:absolute before:inset-0 before:ml-[1.4rem] before:w-0.5 before:bg-line before:-z-10">
                            {selectedPath.steps?.map((step, index) => {
                                const isCompleted = selectedPath.progress?.some(p => p.step_id === step.id);
                                const docId = selectedPath.document_ids?.[0]; // Assuming 1 doc for now

                                return (
                                    <div key={step.id} className="relative pl-14 transition-all duration-300 hover:-translate-y-1">
                                        {/* Timeline node */}
                                        <button
                                            onClick={() => handleToggleStep(step.id, isCompleted)}
                                            className={`absolute left-0 top-1 w-11 h-11 rounded-full border-4 border-surface flex items-center justify-center transition-all duration-300 z-10 ${isCompleted ? 'bg-emerald-500 text-bg' : 'bg-surface-2 text-muted hover:border-primary-500/30'
                                                }`}
                                            title={isCompleted ? t('learningPaths.markUnviewed') : t('learningPaths.markCompleted')}
                                        >
                                            {isCompleted ? <Check size={18} strokeWidth={3} /> : <span className="font-bold">{index + 1}</span>}
                                        </button>

                                        {/* Card */}
                                        <div className={`p-5 rounded-2xl border transition-all duration-300 ${isCompleted ? 'bg-surface-2/50 border-line opacity-75' : 'bg-bg border-line shadow-sm hover:border-primary-500/30'}`}>
                                            <div className="flex sm:items-center justify-between gap-4 mb-2 flex-col sm:flex-row">
                                                <h3 className={`font-bold text-lg ${isCompleted ? 'line-through decoration-emerald-500/50 text-muted' : 'text-txt'}`}>
                                                    {step.title}
                                                </h3>
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 text-xs font-medium text-muted shrink-0">
                                                    <Clock size={12} /> {t('learningPaths.minutes').replace('{minutes}', step.estimated_minutes)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted mb-4 leading-relaxed">{step.description}</p>

                                            {/* Recommended Activities */}
                                            {step.recommended_activities?.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {step.recommended_activities.map((act, i) => {
                                                        const meta = getActivityMeta(act);
                                                        const Icon = meta.icon;
                                                        return (
                                                            <button
                                                                key={i}
                                                                onClick={() => handleStartActivity(act, docId)}
                                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${meta.bg} ${meta.border} ${meta.color} hover:brightness-125`}
                                                            >
                                                                <Icon size={12} strokeWidth={2.5} />
                                                                {meta.label}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
