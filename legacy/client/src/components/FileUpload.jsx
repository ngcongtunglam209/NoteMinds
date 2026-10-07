import { useState, useRef } from 'react';
import { Upload, FileText, Mic, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadFile, getDocumentStatus, getRateLimit } from '../api';
import { useLanguage } from '../LanguageContext';

export default function FileUpload({ onUploadComplete, user, onAuthRequired }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState(null); // 'uploading' | 'processing' | 'ready' | 'error'
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const { t } = useLanguage();

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file) => {
    // Check upload quota before uploading
    try {
      const rl = await getRateLimit();
      if (rl.uploadsRemaining <= 0) {
        if (rl.isGuest) {
          // Guest hit limit — prompt to register
          setStatus('error');
          setError(t('upload.guestLimitReached'));
          setUploading(false);
          return;
        }
        setStatus('error');
        setError(t('upload.dailyLimitReached', { limit: rl.uploadLimit }));
        return;
      }
    } catch { /* proceed anyway */ }

    setUploading(true);
    setStatus('uploading');
    setError('');
    setUploadProgress(0);

    try {
      // Upload file
      const result = await uploadFile(file, (progress) => {
        setUploadProgress(progress);
      });

      setStatus('processing');

      // Poll for processing status
      const docId = result.docId;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max

      const pollStatus = async () => {
        attempts++;
        try {
          const statusResult = await getDocumentStatus(docId);
          if (statusResult.status === 'ready') {
            setStatus('ready');
            setUploading(false);
            onUploadComplete({
              docId,
              fileName: result.fileName,
              textLength: statusResult.textLength
            });
          } else if (statusResult.status === 'error') {
            setStatus('error');
            setError(statusResult.error || t('upload.processingFailed'));
            setUploading(false);
          } else if (attempts < maxAttempts) {
            setTimeout(pollStatus, 1000);
          } else {
            setStatus('error');
            setError(t('upload.processingTimeout'));
            setUploading(false);
          }
        } catch (err) {
          if (attempts < maxAttempts) {
            setTimeout(pollStatus, 1000);
          } else {
            setStatus('error');
            setError(t('upload.connectionError'));
            setUploading(false);
          }
        }
      };

      setTimeout(pollStatus, 1000);
    } catch (err) {
      setStatus('error');
      // If server says auth required, show register prompt
      if (err.response?.status === 429 && err.response?.data?.requireAuth) {
        setError(t('upload.guestLimitReached'));
      } else {
        setError(err.response?.data?.error || err.message);
      }
      setUploading(false);
    }
  };

  return (
    <section className="max-w-2xl mx-auto px-4 pb-16 animate-slide-up" style={{ animationDelay: '0.2s' }}>
      <div
        className={`
          relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-500 cursor-pointer overflow-hidden
          ${dragActive
            ? 'border-primary-400 bg-primary-600/20 scale-[1.02] shadow-[0_0_40px_rgba(99,102,241,0.2)]'
            : 'border-line bg-surface/80 backdrop-blur-md hover:border-primary-500/50 hover:bg-surface hover:shadow-2xl'
          }
          ${uploading ? 'pointer-events-none border-transparent bg-surface' : ''}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        {/* Animated Background Glow on active/upload */}
        {(dragActive || uploading) && (
          <div className="absolute inset-0 bg-primary-600/10 opacity-50 animate-pulse pointer-events-none" />
        )}

        {/* Glowing border effect when uploading/processing */}
        {uploading && (
          <div className={`absolute inset-0 rounded-3xl pointer-events-none border-2 animate-pulse ${status === 'processing' ? 'border-accent-500/50 shadow-[inset_0_0_20px_rgba(236,72,153,0.1)]' : 'border-primary-500/50 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]'}`} />
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.doc,.pptx,.xlsx,.csv,.txt,.md,.mp3,.wav,.m4a,.ogg,.webm"
          onChange={handleFileInput}
        />

        {!uploading && !status && (
          <div className="relative z-10 transition-transform duration-300 group">
            <div className="w-20 h-20 mx-auto mb-6 bg-primary-600/20 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all duration-500 relative">
              <div className="absolute inset-0 rounded-2xl border border-white/5" />
              <Upload size={32} className={`text-primary-400 transition-transform duration-300 ${dragActive ? '-translate-y-2 animate-pulse' : ''}`} />
            </div>
            <h3 className="text-xl font-bold mb-3 text-txt">
              {t('upload.dragDrop')} <span className="text-primary-400">{t('upload.selectFile')}</span>
            </h3>
            <p className="text-sm text-muted mb-6 font-medium">
              {t('upload.supportedFormats')}
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-muted">
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-line">
                <FileText size={14} className="text-primary-400" /> {t('upload.textDocPdf')}
              </span>
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-line">
                <Mic size={14} className="text-accent-400" /> {t('upload.audioLecture')}
              </span>
            </div>
          </div>
        )}

        {status === 'uploading' && (
          <div className="space-y-6 relative z-10 animate-in zoom-in-95 duration-500">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary-600/20 flex items-center justify-center relative">
              <Loader2 size={32} className="text-primary-400 animate-spin relative z-10" />
              <div className="absolute inset-0 bg-primary-500/30 blur-xl rounded-full animate-pulse" />
            </div>
            <p className="font-medium text-lg text-txt">{t('upload.uploading')} {uploadProgress}%</p>
            <div className="w-full max-w-sm mx-auto bg-surface-2 border border-line rounded-full h-3 p-0.5 overflow-hidden">
              <div
                className="bg-primary-600 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)] relative"
                style={{ width: `${uploadProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 w-full h-full animate-[slide_1s_ease-in-out_infinite]" />
              </div>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-700 relative z-10">
            <div className="relative w-24 h-24 mx-auto mb-4 perspective-1000">
              <div className="absolute inset-0 bg-accent-500/20 border border-accent-500/40 rounded-2xl transform rotate-6 translate-y-2 opacity-50" />
              <div className="absolute inset-0 bg-surface border border-line shadow-2xl rounded-2xl flex items-center justify-center p-4 animate-[flip_3s_ease-in-out_infinite_alternate]">
                <Loader2 size={32} className="text-accent-400 animate-spin" />
              </div>
            </div>
            <p className="font-medium text-lg text-accent-400">
              {t('upload.processing')}<span className="loading-dots"></span>
            </p>
            <p className="text-sm text-muted">{t('upload.aiAnalyzing')}</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-4 animate-in zoom-in scale-in duration-500 relative z-10">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center relative">
              <CheckCircle2 size={40} className="text-green-400 relative z-10" />
              <div className="absolute inset-0 bg-green-500/30 blur-xl rounded-full animate-pulse" />
            </div>
            <p className="font-bold text-xl text-green-400">{t('upload.ready')}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <AlertCircle size={32} className="mx-auto text-red-400" />
            <p className="font-medium text-red-400">{t('upload.error')}</p>
            <p className="text-sm text-muted">{error}</p>
            <div className="flex items-center justify-center gap-3">
              {!user && error.includes(t('upload.registerNow').split(' ')[0]) && onAuthRequired && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAuthRequired();
                  }}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-primary-600/25"
                >
                  {t('upload.registerNow')}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus(null);
                  setUploading(false);
                  setError('');
                }}
                className="text-sm text-primary-400 underline"
              >
                {t('upload.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
