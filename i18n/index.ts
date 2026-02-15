import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';
import es from '../locales/es.json';
import fr from '../locales/fr.json';

export const LANGUAGE_KEY = 'appLanguage';
export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Gets the best matching language from the device locale.
 * Falls back to 'en' if the device language isn't supported.
 */
function getDeviceLanguage(): SupportedLanguage {
  const locale = Localization.getLocales?.()?.[0]?.languageCode ?? 'en';
  const lang = locale.split('-')[0].toLowerCase();
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    return lang as SupportedLanguage;
  }
  return 'en';
}

/**
 * Reads the user's saved language preference from AsyncStorage.
 * Returns null if nothing has been saved yet.
 */
export async function getSavedLanguage(): Promise<SupportedLanguage | null> {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && (SUPPORTED_LANGUAGES as readonly string[]).includes(saved)) {
      return saved as SupportedLanguage;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Saves the user's language choice and switches the active language.
 */
export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // ignore
  }
  await i18n.changeLanguage(lang);
}

/**
 * Initialises i18next.
 * Call this once at app startup (e.g. in your root _layout.tsx) and
 * await it before rendering anything language-dependent.
 */
export async function initI18n(): Promise<void> {
  const saved = await getSavedLanguage();
  const lng = saved ?? getDeviceLanguage();

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
    },
    lng,
    fallbackLng: 'en',
    interpolation: {
      // React already escapes values, no need to double-escape
      escapeValue: false,
    },
  });
}

export default i18n;