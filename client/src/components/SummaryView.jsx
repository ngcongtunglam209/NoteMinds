import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, FileText, Lock, Sparkles } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { useLanguage } from '../LanguageContext';

function getSummaryContent(data) {
    if (typeof data === 'string') {
        const text = data.trim();
        if (!text) return '';
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed?.summary === 'string') return parsed.summary;
        } catch {
            // not JSON string, use as-is
        }
        return text;
    }

    if (data && typeof data === 'object') {
        if (typeof data.summary === 'string') return data.summary;
        if (typeof data.content === 'string') return data.content;
    }

    return '';
}

export default function SummaryView({ data, loading, error, onGenerate, isLocked }) {
    const { t } = useLanguage();
    const [loadingText, setLoadingText] = useState(t('summary.loadingReadAnalyze'));
    const summaryContent = getSummaryContent(data);

    /* ── Loading text cycle ── */
    useEffect(() => {
        if (!loading) return;
        const texts = [
            t('summary.loadingReadAnalyze'),
            t('summary.loadingFindKeyPoints'),
            t('summary.loadingSynthesize'),
            t('summary.loadingWriteDetailed')
        ];
        let i = 0;
        const interval = setInterval(() => { i = (i + 1) % texts.length; setLoadingText(texts[i]); }, 2500);
        return () => clearInterval(interval);
    }, [loading]);

    /* ── Loading state ── */
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[500px] h-full gap-6 relative overflow-hidden bg-surface">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                    <FileText size={400} />
                </div>
                <div className="relative z-20 flex flex-col items-center bg-surface/90 backdrop-blur-xl px-10 py-8 rounded-3xl border border-line shadow-2xl">
                    <div className="relative">
                        <div className="absolute -inset-4 bg-primary-500/10 rounded-full blur-2xl animate-pulse" />
                        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/20">
                            <FileText size={28} className="text-white animate-pulse" />
                        </div>
                    </div>
                    <p className="mt-5 font-semibold text-sm bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500 text-center min-h-[24px] flex items-center justify-center">
                        {loadingText}
                    </p>
                    <div className="w-56 bg-line/50 h-1.5 rounded-full mt-4 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full animate-[slide_2.5s_ease-in-out_infinite_alternate]" style={{ width: '40%' }} />
                    </div>
                    <p className="text-[11px] text-muted mt-3">{t('summary.generating')}</p>
                </div>
            </div>
        );
    }

    /* ── Error state ── */
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] gap-5">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <AlertCircle size={30} className="text-red-400" />
                </div>
                <div className="text-center">
                    <p className="text-red-400 font-semibold mb-1">{t('summary.errorGenerating')}</p>
                    <p className="text-sm text-muted max-w-md">{error}</p>
                </div>
                <button
                    onClick={onGenerate}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 rounded-xl text-sm font-medium hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20"
                >
                    <RefreshCw size={14} /> {t('common.retry')}
                </button>
            </div>
        );
    }

    /* ── Empty state ── */
    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center h-[500px] gap-6">
                <div className="relative">
                    <div className={`absolute -inset-3 rounded-3xl blur-xl ${isLocked ? 'bg-gray-500/10' : 'bg-primary-500/10 animate-pulse'}`} />
                    <div className={`relative w-20 h-20 rounded-2xl border-2 flex items-center justify-center ${isLocked ? 'bg-gray-500/5 border-gray-500/20' : 'bg-gradient-to-br from-primary-600/10 to-primary-500/5 border-primary-500/20'}`}>
                        {isLocked ? <Lock size={34} className="text-gray-400" /> : <FileText size={34} className="text-primary-400" />}
                    </div>
                </div>
                <div className="text-center space-y-1">
                    <p className="text-txt font-semibold text-base">{isLocked ? t('summary.sourceDeletedTitle') : t('summary.emptyTitle')}</p>
                    <p className="text-sm text-muted max-w-xs">{isLocked ? t('summary.sourceDeletedDesc') : t('summary.emptyDesc')}</p>
                </div>
                <button
                    onClick={onGenerate}
                    disabled={isLocked}
                    className={`group flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-sm font-semibold transition-all shadow-lg ${isLocked
                        ? 'bg-gray-600 cursor-not-allowed opacity-50 shadow-none'
                        : 'bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 shadow-primary-600/25 hover:shadow-xl hover:scale-[1.02]'
                        }`}
                >
                    <Sparkles size={16} className={isLocked ? '' : 'group-hover:animate-spin'} />
                    {t('summary.generateButton')}
                </button>
            </div>
        );
    }

    /* ── Main summary view ── */
    return (
        <div className="w-full flex-1 bg-surface scrollable p-6 md:p-10 lg:px-16 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-primary-600/15 border border-primary-500/20 rounded-xl flex items-center justify-center shrink-0">
                        <FileText className="text-primary-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-extrabold font-display leading-tight">{t('summary.title')}</h2>
                        <p className="text-sm text-muted">{t('summary.subtitle')}</p>
                    </div>
                </div>

                <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-txt leading-relaxed bg-bg border border-line rounded-2xl p-6 md:p-8 shadow-sm">
                    <MarkdownRenderer content={summaryContent} />
                </div>
            </div>
        </div>
    );
}
