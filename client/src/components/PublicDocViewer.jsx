import { useState, useEffect } from 'react';
import {
    FileText, Loader2, AlertCircle, Eye,
    BrainCircuit, ArrowLeft, Map, CreditCard, MessageCircle, Lock
} from 'lucide-react';
import { getPublicDocumentContent } from '../api';
import MindmapView from './MindmapView';
import FlashcardView from './FlashcardView';
import ChatView from './ChatView';
import { useLanguage } from '../LanguageContext';

const TABS = [
    { id: 'mindmap', labelKey: 'publicDoc.tabMindmap', icon: Map },
    { id: 'flashcard', labelKey: 'publicDoc.tabFlashcard', icon: CreditCard },
    { id: 'chat', labelKey: 'publicDoc.tabChat', icon: MessageCircle },
];

export default function PublicDocViewer({ documentId, onBack }) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [content, setContent] = useState(null);

    const [activeTab, setActiveTab] = useState('mindmap');
    const [mindmapData, setMindmapData] = useState(null);
    const [flashcardData, setFlashcardData] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);

    useEffect(() => {
        if (!documentId) return;
        setLoading(true);
        setError(null);

        getPublicDocumentContent(documentId)
            .then(data => {
                setContent(data);
                if (data.sessions) {
                    if (data.sessions.mindmap) setMindmapData(data.sessions.mindmap);
                    if (data.sessions.flashcards) setFlashcardData(data.sessions.flashcards);
                    if (data.sessions.chat && data.sessions.chat.length > 0) {
                        setChatMessages(data.sessions.chat.map(m => ({ role: m.role, content: m.content })));
                    }
                }
            })
            .catch(err => {
                setError(err.response?.data?.error || err.message || t('publicDoc.invalidOrPrivate'));
            })
            .finally(() => {
                setLoading(false);
            });
    }, [documentId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center">
                <div className="text-center">
                    <Loader2 size={32} className="text-primary-400 animate-spin mx-auto mb-4" />
                    <p className="text-muted text-sm">{t('publicDoc.loading')}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-bg flex items-center justify-center p-4">
                <div className="max-w-md mx-auto text-center">
                    <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <AlertCircle size={32} className="text-red-400" />
                    </div>
                    <h2 className="text-xl font-bold mb-2">{t('publicDoc.cannotLoad')}</h2>
                    <p className="text-muted text-sm mb-6">{error}</p>
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 mx-auto px-5 py-2.5 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-medium transition-colors"
                    >
                        <ArrowLeft size={16} />
                        {t('common.back')}
                    </button>
                </div>
            </div>
        );
    }

    const ViewOnlyEmpty = ({ icon: Icon, label }) => (
        <div className="flex flex-col items-center justify-center h-[500px] gap-4">
            <div className="relative">
                <Icon size={48} className="text-line" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-surface border border-line rounded-full flex items-center justify-center">
                    <Lock size={12} className="text-muted" />
                </div>
            </div>
            <p className="text-muted">{label}</p>
            <p className="text-xs text-muted/60 max-w-xs text-center">
                {t('publicDoc.emptyDesc')}
            </p>
        </div>
    );

    return (
        <div className="min-h-screen bg-bg animate-fade-in">
            <header className="sticky top-0 z-50 glass border-b border-line">
                <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="p-2 rounded-lg hover:bg-surface-2 transition-colors" title={t('common.back')}>
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                                <BrainCircuit size={16} className="text-white" />
                            </div>
                            <span className="text-sm font-bold font-display">
                                Note<span className="text-primary-400">Minds</span>
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border text-blue-400 bg-blue-500/10 border-blue-500/30">
                            <Eye size={12} />
                            {t('publicDoc.publicViewMode')}
                        </span>
                    </div>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex items-center gap-3 mb-6 bg-surface border border-line rounded-xl px-5 py-4">
                    <FileText size={24} className="text-primary-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold truncate text-txt">
                            {content?.fileName || t('publicDoc.publicDocument')}
                        </p>
                        <p className="text-sm text-muted mt-1">
                            {t('publicDoc.sharedOnCommunity')}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 mb-6 bg-surface border border-line rounded-xl p-1.5 overflow-x-auto hide-scrollbar">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        const hasData = (tab.id === 'mindmap' && mindmapData) ||
                            (tab.id === 'flashcard' && flashcardData) ||
                            (tab.id === 'chat' && chatMessages.length > 0);
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                  flex-1 flex items-center justify-center gap-2 min-w-[140px] px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 relative
                  ${isActive
                                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25'
                                        : 'text-muted hover:text-txt hover:bg-surface-2'
                                    }
                `}
                            >
                                <Icon size={18} />
                                <span>{t(tab.labelKey)}</span>
                                {hasData && !isActive && (
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full absolute top-2 right-2 animate-pulse" />
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="bg-surface border border-line rounded-2xl min-h-[500px] overflow-hidden">
                    {activeTab === 'mindmap' && (
                        !mindmapData ? (
                            <ViewOnlyEmpty icon={Map} label={t('publicDoc.emptyMindmap')} />
                        ) : (
                            <MindmapView
                                data={mindmapData}
                                loading={false}
                                error={null}
                            />
                        )
                    )}
                    {activeTab === 'flashcard' && (
                        !flashcardData ? (
                            <ViewOnlyEmpty icon={CreditCard} label={t('publicDoc.emptyFlashcard')} />
                        ) : (
                            <FlashcardView
                                data={flashcardData}
                                loading={false}
                                error={null}
                                docId={null}
                            />
                        )
                    )}
                    {activeTab === 'chat' && (
                        chatMessages.length > 0 ? (
                            <ChatView
                                docId={null}
                                messages={chatMessages}
                                setMessages={setChatMessages}
                                chatLimit={0}
                                shareMode
                                readOnly
                            />
                        ) : (
                            <ViewOnlyEmpty icon={MessageCircle} label={t('publicDoc.emptyChat')} />
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
