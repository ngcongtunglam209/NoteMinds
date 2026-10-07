import { Sparkles, Brain, CreditCard, MessageCircle, Zap } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import FileUpload from './FileUpload';

export default function Hero({ onUploadComplete, user, onAuthRequired }) {
  const { t } = useLanguage();

  return (
    <section className="relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-primary-600/8 rounded-full blur-[100px] animate-float" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-accent-500/8 rounded-full blur-[100px] animate-float" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Split Layout Container */}
      <div className="relative max-w-7xl mx-auto px-4 pt-20 pb-12 z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          
          {/* Left Column - Content */}
          <div className="text-left space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2.5 bg-surface/60 backdrop-blur-xl border border-line/50 rounded-full px-5 py-2.5 shadow-xl shadow-primary-900/10 hover:shadow-primary-900/20 transition-shadow">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-primary-400" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-primary-400 animate-ping" />
              </div>
              <span className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">{t('hero.badge')}</span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold font-display leading-[1.1] tracking-tight">
              {t('hero.heading1')}{' '}
              <span className="relative inline-block">
                <span className="absolute -inset-2 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 opacity-20 blur-2xl animate-pulse"></span>
                <span className="relative gradient-text">{t('hero.heading2')}</span>
              </span>
              <br />{t('hero.heading3')}
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-muted leading-relaxed max-w-xl">
              {t('hero.subtitle1')}
              <strong className="text-txt font-medium"> {t('hero.subtitleMindmap')}</strong>,{' '}
              <strong className="text-txt font-medium">{t('hero.subtitleFlashcard')}</strong> {t('common.and')}{' '}
              <strong className="text-txt font-medium">{t('hero.subtitleChat')}</strong>{' '}
              {t('hero.subtitleEnd')}
            </p>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted">
                <Sparkles size={16} className="text-primary-400" />
                <span className="font-medium text-txt">{t('hero.freePlan', 'Free Forever')}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-line"></div>
              <div className="flex items-center gap-2 text-muted">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{t('hero.privacyFirst') || 'Privacy First'}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-line"></div>
              <div className="flex items-center gap-2 text-muted">
                <Zap size={16} className="text-accent-400" />
                <span className="font-medium">{t('hero.instantResults') || 'Instant Results'}</span>
              </div>
            </div>

            {/* Feature Pills */}
            <div className="flex flex-wrap items-center gap-3">
              {[
                { icon: Brain, label: t('hero.pill1'), color: 'primary' },
                { icon: CreditCard, label: t('hero.pill2'), color: 'accent' },
                { icon: MessageCircle, label: t('hero.pill3'), color: 'primary' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-surface/50 backdrop-blur-sm border border-line/50 rounded-xl px-4 py-2.5 text-sm text-muted hover:text-txt hover:border-primary-500/30 transition-all"
                >
                  <item.icon size={16} className={item.color === 'primary' ? 'text-primary-400' : 'text-accent-400'} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Upload Area */}
          <div className="relative">
            <FileUpload 
              onUploadComplete={onUploadComplete}
              user={user}
              onAuthRequired={onAuthRequired}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
