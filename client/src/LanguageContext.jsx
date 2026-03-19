import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import vi from './locales/vi.json';
import en from './locales/en.json';

const LOCALES = { vi, en };
const STORAGE_KEY = 'notemind-language';

// Detect browser language
function detectLanguage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && LOCALES[stored]) return stored;
    } catch { /* ignore */ }

    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage || '';
    return browserLang.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(detectLanguage);

    const setLanguage = useCallback((lang) => {
        if (LOCALES[lang]) {
            setLanguageState(lang);
            try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
            // Update document lang attribute
            document.documentElement.lang = lang;
        }
    }, []);

    // Set initial document lang
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    // Translation function — supports nested keys like 'nav.features'
    const t = useCallback((key, params) => {
        const keys = key.split('.');
        let value = LOCALES[language];
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                // Fallback to English, then return the key itself
                let fallback = LOCALES.en;
                for (const fk of keys) {
                    if (fallback && typeof fallback === 'object' && fk in fallback) {
                        fallback = fallback[fk];
                    } else {
                        return key; // Key not found at all
                    }
                }
                value = fallback;
                break;
            }
        }

        // Handle parameter substitution like {count}, {limit}
        if (typeof value === 'string' && params) {
            return value.replace(/\{(\w+)\}/g, (_, param) =>
                params[param] !== undefined ? params[param] : `{${param}}`
            );
        }

        return typeof value === 'string' ? value : key;
    }, [language]);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
    return ctx;
}
