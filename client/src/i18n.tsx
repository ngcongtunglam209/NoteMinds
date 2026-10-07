import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ErrorCode } from '../../shared/types.ts';
import vi from './locales/vi.json';
import en from './locales/en.json';
import { load, save } from './storage.ts';

// vi is the source of truth: en must have every vi key, and every server error code needs a message.
const messages = {
  vi: vi satisfies Record<`error.${ErrorCode}`, string>,
  en,
} satisfies Record<string, typeof vi>;

export type Lang = keyof typeof messages;
export type MessageKey = keyof typeof vi;

const STORAGE_KEY = 'nm.lang';

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (load(STORAGE_KEY) === 'en' ? 'en' : 'vi'));

  useEffect(() => {
    document.documentElement.lang = lang;
    save(STORAGE_KEY, lang);
  }, [lang]);

  // `?? key` covers runtime keys the types can't see, e.g. an error code the server added later.
  const t = useCallback((key: MessageKey) => messages[lang][key] ?? key, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}

export const useT = () => useI18n().t;
export const useLang = () => {
  const { lang, setLang } = useI18n();
  return { lang, setLang };
};
