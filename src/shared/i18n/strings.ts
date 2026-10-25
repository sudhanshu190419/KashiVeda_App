/**
 * Kashi Veda — Bilingual String Catalog
 *
 * True language switching: the active language renders alone, with no
 * simultaneous dual-label text. Screens read strings through `useLanguage()`.
 *
 * Copy stays authentic Vedic terminology in both scripts; English is a
 * respectful translation, never a transliteration of ritual names.
 */

export type Language = 'hi' | 'en';

export interface LocalizedString {
  readonly hi: string;
  readonly en: string;
}

export const STRINGS = {
  'app.name': { hi: 'काशी वेदा', en: 'Kashi Veda' },
  'app.location': { hi: 'वाराणसी', en: 'Varanasi' },

  'nav.home': { hi: 'होम', en: 'Home' },
  'nav.astrology': { hi: 'ज्योतिष', en: 'Astrology' },
  'nav.bookings': { hi: 'बुकिंग्स', en: 'Bookings' },
  'nav.profile': { hi: 'प्रोफ़ाइल', en: 'Profile' },

  'common.back': { hi: 'वापस जाएं', en: 'Go back' },
  'common.share': { hi: 'साझा करें', en: 'Share' },
  'common.languageToggle': { hi: 'भाषा बदलें', en: 'Change language' },
  'common.languageCode': { hi: 'EN', en: 'हिं' },

  'bookings.title': { hi: 'मेरी बुकिंग्स', en: 'My Bookings' },
  'bookings.subtitle': {
    hi: 'आगामी, सक्रिय एवं पूर्ण अनुष्ठान',
    en: 'Upcoming, active and completed rituals',
  },
  'bookings.tabActive': { hi: 'सक्रिय', en: 'Active' },
  'bookings.tabUpcoming': { hi: 'आगामी', en: 'Upcoming' },
  'bookings.tabPast': { hi: 'पूर्ण', en: 'Past' },
  'bookings.emptyTitle': { hi: 'कोई बुकिंग नहीं मिली', en: 'No bookings yet' },
  'bookings.emptySubtitle': {
    hi: 'जब आप कोई अनुष्ठान बुक करेंगे, उसका विवरण यहाँ दिखाई देगा।',
    en: 'Once you book a ritual, its details will appear here.',
  },
  'bookings.emptyAction': { hi: 'अनुष्ठान खोजें', en: 'Browse rituals' },
  'bookings.escrowTitle': { hi: 'एस्क्रो सुरक्षा', en: 'Escrow protection' },
  'bookings.escrowNote': {
    hi: '50% अग्रिम राशि पूर्णाहुति तक एस्क्रो में सुरक्षित रहती है।',
    en: 'Your 50% advance stays in escrow until Purnahuti.',
  },
  'bookings.privacyNote': {
    hi: 'बुकिंग विवरण केवल आपके खाते में सुरक्षित रहते हैं।',
    en: 'Booking details stay private to your account.',
  },
} as const satisfies Record<string, LocalizedString>;

export type StringKey = keyof typeof STRINGS;

/** Returns the string for the given language. */
export const getString = (key: StringKey, language: Language): string =>
  STRINGS[key][language];
