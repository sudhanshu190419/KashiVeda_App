// src/shared/i18n/LanguageProvider.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { getString, Language, StringKey } from './strings';

export interface LanguageContextValue {
  /** Active locale. Hindi is the default for Kashi Veda. */
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  /** Resolve a catalog key in the active language. */
  t: (key: StringKey) => string;
  /** Resolve inline copy without adding it to the catalog. */
  pick: (hi: string, en: string) => string;
}

export interface LanguageProviderProps {
  children: React.ReactNode;
  initialLanguage?: Language;
}

export const defaultLanguageContext: LanguageContextValue = {
  language: 'hi',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: StringKey) => getString(key, 'hi'),
  pick: (hi: string, en: string) => hi,
};

export const LanguageContext = createContext<LanguageContextValue>(defaultLanguageContext);

export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
  initialLanguage = 'hi',
}) => {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === 'hi' ? 'en' : 'hi'));
  }, []);

  const t = useCallback((key: StringKey) => getString(key, language), [language]);

  const pick = useCallback(
    (hi: string, en: string) => (language === 'hi' ? hi : en),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, toggleLanguage, t, pick }),
    [language, toggleLanguage, t, pick]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  return context || defaultLanguageContext;
};
