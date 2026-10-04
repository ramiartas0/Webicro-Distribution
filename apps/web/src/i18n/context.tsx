import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Language, TranslationDictionary } from './types.js';
import { tr } from './locales/tr.js';
import { en } from './locales/en.js';

const STORAGE_KEY = 'webicro_language';

const dictionaries: Record<Language, TranslationDictionary> = {
  tr,
  en,
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dictionary: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'tr' || stored === 'en') {
        return stored;
      }
      if (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('en')) {
        return 'en';
      }
    } catch {
      // localStorage may fail in restricted sandboxes
    }
    return 'tr';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage error
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => {
      const nextLang: Language = prev === 'tr' ? 'en' : 'tr';
      try {
        localStorage.setItem(STORAGE_KEY, nextLang);
      } catch {
        // ignore storage error
      }
      return nextLang;
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const dictionary = useMemo(() => dictionaries[language] ?? tr, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const keys = key.split('.');
      let currentVal: unknown = dictionaries[language];

      for (const k of keys) {
        if (currentVal && typeof currentVal === 'object' && k in (currentVal as Record<string, unknown>)) {
          currentVal = (currentVal as Record<string, unknown>)[k];
        } else {
          currentVal = undefined;
          break;
        }
      }

      // Fallback to Turkish if not found in target language
      if (typeof currentVal !== 'string') {
        let fallbackVal: unknown = tr;
        for (const k of keys) {
          if (fallbackVal && typeof fallbackVal === 'object' && k in (fallbackVal as Record<string, unknown>)) {
            fallbackVal = (fallbackVal as Record<string, unknown>)[k];
          } else {
            fallbackVal = undefined;
            break;
          }
        }
        if (typeof fallbackVal === 'string') {
          currentVal = fallbackVal;
        }
      }

      if (typeof currentVal !== 'string') {
        return key;
      }

      let result = currentVal;
      if (params) {
        for (const [paramKey, paramVal] of Object.entries(params)) {
          result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
        }
      }
      return result;
    },
    [language]
  );

  const contextValue = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
      dictionary,
    }),
    [language, setLanguage, toggleLanguage, t, dictionary]
  );

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
};

export const useTranslation = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
