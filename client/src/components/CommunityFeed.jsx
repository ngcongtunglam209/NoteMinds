import { useState, useEffect, useRef } from 'react';
import { getCommunityDocuments, likeDocument, unlikeDocument, getComments, postComment, deleteComment, submitReport, getApiBaseUrl } from '../api';
import { Globe, FileText, Search, Loader2, Calendar, Heart, MessageCircle, Send, Trash2, ChevronDown, ChevronUp, Flag, X } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

export default function CommunityFeed({ user }) {
    const { t } = useLanguage();
    const reportReasons = [
        t('community.reasonInappropriate'),
        t('community.reasonCopyright'),
        t('community.reasonSpam'),
        t('community.reasonMisinformation'),
        t('community.reasonOther'),
    ];
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedComments, setExpandedComments] = useState({});
    const [commentsData, setCommentsData] = useState({});
    const [newComment, setNewComment] = useState({});
    const [likesState, setLikesState] = useState({}); // { docId: { liked, count } }
    const [reportModal, setReportModal] = useState(null); // { docId, title }
    const [reportReason, setReportReason] = useState('');
    const [reportDetails, setReportDetails] = useState('');
    const [reportLoading, setReportLoading] = useState(false);
    const [reportSuccess, setReportSuccess] = useState(false);

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        setLoading(true);
        try {
            const data = await getCommunityDocuments(1, 50);
            setDocuments(data.documents || []);
            // Initialize likes state from documents
            const initialLikes = {};
            (data.documents || []).forEach(doc => {
                initialLikes[doc.id] = { liked: !!doc.user_liked, count: doc.likes_count || 0 };
            });
            setLikesState(initialLikes);
        } catch (err) {
            setError(err.response?.data?.error || 'Lỗi khi tải dữ liệu cộng đồng');
        } finally {
            setLoading(false);
        }
    };

    const handleLike = async (e, docId) => {
        e.stopPropagation();
        if (!user) return;
        const current = likesState[docId] || { liked: false, count: 0 };
        // Optimistic update
        setLikesState(prev => ({
            ...prev,
            [docId]: { liked: !current.liked, count: current.liked ? current.count - 1 : current.count + 1 }
        }));
        try {
            if (current.liked) {
                await unlikeDocument(docId);
            } else {
                await likeDocument(docId);
            }
        } catch {
            // Revert
            setLikesState(prev => ({ ...prev, [docId]: current }));
        }
    };

    const toggleComments = async (e, docId) => {
        e.stopPropagation();
        if (expandedComments[docId]) {
            setExpandedComments(prev => ({ ...prev, [docId]: false }));
            return;
        }
        setExpandedComments(prev => ({ ...prev, [docId]: true }));
        if (!commentsData[docId]) {
            try {
                const comments = await getComments(docId);
                setCommentsData(prev => ({ ...prev, [docId]: comments }));
            } catch { /* ignore */ }
        }
    };

    const handlePostComment = async (e, docId) => {
        e.stopPropagation();
        const content = (newComment[docId] || '').trim();
        if (!content || !user) return;
        try {
            const comment = await postComment(docId, content);
            setCommentsData(prev => ({
                ...prev,
                [docId]: [...(prev[docId] || []), comment]
            }));
            setNewComment(prev => ({ ...prev, [docId]: '' }));
        } catch { /* ignore */ }
    };

    const handleDeleteComment = async (e, docId, commentId) => {
        e.stopPropagation();
        try {
            await deleteComment(commentId);
            setCommentsData(prev => ({
                ...prev,
                [docId]: (prev[docId] || []).filter(c => c.id !== commentId)
            }));
        } catch { /* ignore */ }
    };

    const handleReport = async () => {
        if (!reportModal || !reportReason) return;
        setReportLoading(true);
        try {
            await submitReport('document', reportModal.docId, reportReason, reportDetails);
            setReportSuccess(true);
            setTimeout(() => {
                setReportModal(null);
                setReportReason('');
                setReportDetails('');
                setReportSuccess(false);
            }, 1500);
        } catch {
            // silently fail
        } finally {
            setReportLoading(false);
        }
    };

    const filteredDocs = documents.filter(doc =>
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.author.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
                <div>
                    <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2 font-display">
                        <div className="w-10 h-10 bg-primary-600/15 border border-primary-500/20 rounded-xl flex items-center justify-center">
                            <Globe className="text-primary-400" size={22} />
                        </div>
                        {t('community.title')}
                    </h1>
                    <p className="text-muted">{t('community.subtitle')}</p>
                </div>

                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={17} />
                    <input
                        type="text"
                        placeholder={t('community.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-surface border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary-500/50 transition-all"
                    />
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted">
                    <Loader2 size={32} className="animate-spin mb-4 text-primary-500" />
                    <p>{t('community.loading')}</p>
                </div>
            ) : filteredDocs.length === 0 ? (
                <div className="bg-surface border border-line rounded-xl p-12 text-center flex flex-col items-center">
                    <Globe size={48} className="text-line mb-4" />
                    <h3 className="text-lg font-medium mb-1">{t('community.noDocuments')}</h3>
                    <p className="text-muted text-sm">{t('community.noDocumentsDesc')}</p>
                </div>
            ) : (
                <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6">
                    {filteredDocs.map(doc => {
                        const likeState = likesState[doc.id] || { liked: false, count: 0 };
                        const comments = commentsData[doc.id] || [];
                        const isExpanded = expandedComments[doc.id];
                        return (
                            <div
                                key={doc.id}
                                className="bg-surface border border-line rounded-2xl hover:border-primary-500/50 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-primary-500/10 transition-all cursor-pointer group flex flex-col break-inside-avoid mb-6"
                            >
                                <div
                                    className="p-6 pb-3"
                                    onClick={() => {
                                        window.location.href = `/public/${doc.id}`;
                                    }}
                                >
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="p-3 bg-primary-500/10 rounded-xl text-primary-400 mt-0.5 group-hover:scale-110 group-hover:bg-primary-500 group-hover:text-txt transition-all shadow-sm">
                                            <FileText size={22} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-[16px] leading-tight mb-1.5 group-hover:text-primary-400 transition-colors" title={doc.title}>
                                                {doc.title}
                                            </h3>
                                            <p className="text-xs text-muted flex items-center gap-1.5">
                                                {doc.author_username ? (
                                                    <span
                                                        className="cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.location.href = `/profile/@${doc.author_username}`;
                                                        }}
                                                    >
                                                        {doc.author_avatar ? (
                                                            <img
                                                                src={doc.author_avatar.startsWith('http') ? doc.author_avatar : `${getApiBaseUrl()}${doc.author_avatar}`}
                                                                alt=""
                                                                className="w-5 h-5 rounded-full object-cover ring-1 ring-primary-500/30 hover:ring-primary-400 transition-all"
                                                            />
                                                        ) : (
                                                            <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center text-[10px] text-white font-bold opacity-90 shadow-sm hover:opacity-100 transition-all">
                                                                {doc.author.charAt(0).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    doc.author_avatar ? (
                                                        <img
                                                            src={doc.author_avatar.startsWith('http') ? doc.author_avatar : `${getApiBaseUrl()}${doc.author_avatar}`}
                                                            alt=""
                                                            className="w-5 h-5 rounded-full object-cover ring-1 ring-primary-500/30"
                                                        />
                                                    ) : (
                                                        <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center text-[10px] text-white font-bold opacity-90 shadow-sm">
                                                            {doc.author.charAt(0).toUpperCase()}
                                                        </span>
                                                    )
                                                )}
                                                {doc.author_username ? (
                                                    <span
                                                        className="truncate hover:text-primary-400 hover:underline cursor-pointer transition-colors"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.location.href = `/profile/@${doc.author_username}`;
                                                        }}
                                                    >{doc.author}</span>
                                                ) : (
                                                    <span className="truncate">{doc.author}</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Like + Comment bar */}
                                <div className="px-6 pb-3 flex items-center gap-4 border-t border-line/50 pt-3">
                                    <button
                                        onClick={(e) => handleLike(e, doc.id)}
                                        className={`flex items-center gap-1.5 text-xs font-medium transition-all ${likeState.liked ? 'text-red-400' : 'text-muted hover:text-red-400'}`}
                                    >
                                        <Heart size={15} className={likeState.liked ? 'fill-red-400' : ''} />
                                        <span>{likeState.count}</span>
                                    </button>
                                    <button
                                        onClick={(e) => toggleComments(e, doc.id)}
                                        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary-400 transition-colors"
                                    >
                                        <MessageCircle size={15} />
                                        <span>{comments.length || doc.comments_count || 0}</span>
                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    </button>
                                    {user && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReportModal({ docId: doc.id, title: doc.title });
                                            }}
                                            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-amber-400 transition-colors"
                                            title={t('community.reportTitle')}
                                        >
                                            <Flag size={13} />
                                        </button>
                                    )}
                                    <div className="flex-1" />
                                    <div className="flex items-center gap-1.5 text-xs text-muted font-medium">
                                        <Calendar size={12} />
                                        {new Date(doc.created_at).toLocaleDateString('vi-VN')}
                                    </div>
                                </div>

                                {/* Comments section */}
                                {isExpanded && (
                                    <div className="px-6 pb-4 border-t border-line/50 pt-3 space-y-2" onClick={e => e.stopPropagation()}>
                                        {comments.length === 0 && (
                                            <p className="text-xs text-muted py-2 text-center">{t('community.noComments')}</p>
                                        )}
                                        {comments.map(c => (
                                            <div key={c.id} className="flex items-start gap-2 group/comment">
                                                <span
                                                    className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center text-[9px] text-white font-bold shrink-0 mt-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => c.username && (window.location.href = `/profile/@${c.username}`)}
                                                >
                                                    {(c.username || '?').charAt(0).toUpperCase()}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={`text-xs font-semibold ${c.username ? 'cursor-pointer hover:text-primary-400 transition-colors' : ''}`}
                                                            onClick={() => c.username && (window.location.href = `/profile/@${c.username}`)}
                                                        >{c.display_name || c.username}</span>
                                                        <span className="text-[10px] text-muted">{new Date(c.created_at).toLocaleDateString('vi-VN')}</span>
                                                    </div>
                                                    <p className="text-xs text-muted mt-0.5">{c.content}</p>
                                                </div>
                                                {user && (user.id === c.user_id || user.role === 'admin') && (
                                                    <button
                                                        onClick={(e) => handleDeleteComment(e, doc.id, c.id)}
                                                        className="p-1 rounded hover:bg-red-500/10 text-muted hover:text-red-400 opacity-0 group-hover/comment:opacity-100 transition-all"
                                                    >
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {user && (
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-line/30">
                                                <input
                                                    value={newComment[doc.id] || ''}
                                                    onChange={(e) => setNewComment(prev => ({ ...prev, [doc.id]: e.target.value }))}
                                                    placeholder={t('community.writeComment')}
                                                    className="flex-1 bg-bg border border-line rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary-500/50"
                                                    onKeyDown={(e) => e.key === 'Enter' && handlePostComment(e, doc.id)}
                                                />
                                                <button
                                                    onClick={(e) => handlePostComment(e, doc.id)}
                                                    className="p-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 transition-colors"
                                                >
                                                    <Send size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {/* Report Modal */}
            {reportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !reportLoading && setReportModal(null)}>
                    <div className="bg-surface border border-line rounded-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
                        {reportSuccess ? (
                            <div className="text-center py-4">
                                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                                    <Flag size={24} className="text-green-400" />
                                </div>
                                <h3 className="text-lg font-bold mb-1">{t('community.reportSent')}</h3>
                                <p className="text-sm text-muted">{t('community.reportSentDesc')}</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <Flag size={18} className="text-amber-400" />
                                        {t('community.reportTitle')}
                                    </h3>
                                    <button onClick={() => setReportModal(null)} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-txt transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>
                                <p className="text-xs text-muted mb-4 truncate">{t('community.reportDocument')} <strong className="text-txt">{reportModal.title}</strong></p>

                                <div className="space-y-2 mb-4">
                                    {reportReasons.map(reason => (
                                        <button
                                            key={reason}
                                            onClick={() => setReportReason(reason)}
                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border transition-all ${reportReason === reason
                                                    ? 'border-primary-500/50 bg-primary-500/10 text-primary-400 font-medium'
                                                    : 'border-line hover:border-primary-500/30 text-muted hover:text-txt'
                                                }`}
                                        >
                                            {reason}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    value={reportDetails}
                                    onChange={e => setReportDetails(e.target.value)}
                                    placeholder={t('community.reportReasonPlaceholder')}
                                    rows={2}
                                    className="w-full bg-bg border border-line rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-primary-500/50 mb-4 placeholder:text-muted/50"
                                />

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setReportModal(null)}
                                        className="flex-1 py-2.5 rounded-xl bg-surface-2 hover:bg-line text-sm font-medium transition-colors"
                                    >
                                        {t('community.reportCancel')}
                                    </button>
                                    <button
                                        onClick={handleReport}
                                        disabled={!reportReason || reportLoading}
                                        className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {reportLoading ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                                        {t('community.reportSubmit')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}        </div>
    );
}
