import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import vi from './locales/vi.json';

// Try to read persisted language from localStorage (settingsStore persists there)
function getInitialLanguage(): string {
  try {
    const raw = localStorage.getItem('tablepro-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.settings?.language) {
        return parsed.state.settings.language;
      }
    }
  } catch {
    // ignore
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
