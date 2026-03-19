import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, MessageSquare, ArrowLeft, Volume2, FileText } from 'lucide-react';
import { chatWithMultipleDocuments } from '../api';
import MarkdownRenderer from './MarkdownRenderer';
import { useLanguage } from '../LanguageContext';

export default function MultiChatView({ selectedDocs, onBack }) {
    const { t } = useLanguage();
    const [messages, setMessages] = useState([{
        role: 'assistant',
        content: t('multiChat.welcome').replace('{count}', selectedDocs.length)
    }]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = { role: 'user', content: input.trim() };
        const newMessages = [...messages, userMsg];

        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const history = newMessages.slice(0, -1);
            const docIds = selectedDocs.map(d => d.id);

            const { reply } = await chatWithMultipleDocuments(docIds, userMsg.content, history);
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: `❌ **${t('common.error')}:** ${err.response?.data?.error || err.message}` }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const speakText = (text) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        } else {
            alert(t('multiChat.speechUnsupported'));
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] max-w-5xl mx-auto bg-surface border border-line rounded-2xl overflow-hidden shadow-lg shadow-black/20 m-4">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-line bg-bg/50 shrink-0">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-surface-2 rounded-xl text-muted hover:text-txt transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-lg font-bold text-txt flex items-center gap-2">
                        <MessageSquare size={20} className="text-primary-400" />
                        {t('multiChat.title')}
                    </h2>
                    <p className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                        {t('multiChat.analyzingDocs').replace('{count}', selectedDocs.length)}
                        <span className="text-txt truncate max-w-md" title={selectedDocs.map(d => d.original_name).join(', ')}>
                            {selectedDocs.map(d => d.original_name).join(', ')}
                        </span>
                    </p>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary-600/20 text-primary-400' : 'bg-txt text-bg'
                            }`}>
                            {msg.role === 'user' ? <User size={16} /> : <Bot size={18} />}
                        </div>

                        <div className={`
              max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed relative group shadow-sm
              ${msg.role === 'user'
                                ? 'bg-primary-600/10 text-txt border border-primary-500/20 rounded-tr-sm whitespace-pre-wrap'
                                : 'bg-surface-2 text-txt border border-line rounded-tl-sm pr-12'
                            }
            `}>
                            {msg.role === 'assistant' && (
                                <button
                                    onClick={() => speakText(msg.content)}
                                    className="absolute top-2 right-2 p-1.5 text-muted/60 hover:text-primary-400 bg-surface rounded-md opacity-0 group-hover:opacity-100 transition-all border border-line shadow-md"
                                    title={t('multiChat.readText')}
                                >
                                    <Volume2 size={14} />
                                </button>
                            )}
                            {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : msg.content}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-xl bg-txt text-bg flex items-center justify-center shrink-0">
                            <Bot size={18} />
                        </div>
                        <div className="bg-surface-2 border border-line rounded-2xl rounded-tl-sm px-6 py-4 flex items-center gap-2">
                            <Loader2 size={16} className="animate-spin text-primary-400" />
                            <span className="text-sm font-medium text-muted">{t('multiChat.synthesizing').replace('{count}', selectedDocs.length)}</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-bg/80 border-t border-line shrink-0">
                <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-surface border border-line rounded-2xl p-2 focus-within:border-primary-500/50 focus-within:ring-1 focus-within:ring-primary-500/50 transition-all shadow-inner">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('multiChat.placeholder')}
                        className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none text-sm text-txt placeholder-muted/60 p-3 focus:outline-none"
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="mb-1 mr-1 p-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
                    </button>
                </div>
                <p className="text-center text-[10px] text-muted/60 mt-2 font-medium">
                    {t('multiChat.disclaimer')}
                </p>
            </div>
        </div>
    );
}
