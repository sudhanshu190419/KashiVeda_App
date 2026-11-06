import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('react-native-encrypted-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        type: 'success',
        data: { idToken: 'token' },
      })
    ),
    getTokens: jest.fn(() => Promise.resolve({ idToken: 'token' })),
    signOut: jest.fn(() => Promise.resolve(null)),
  },
  isSuccessResponse: jest.fn(() => true),
  isCancelledResponse: jest.fn(() => false),
  isErrorWithCode: jest.fn(() => false),
  statusCodes: {},
}));

import {
  LanguageProvider,
  useLanguage,
  STRINGS,
  getString,
  Language,
  StringKey,
  LanguageContextValue,
} from '../src/shared/i18n';
import {
  LanguageProvider as SharedLanguageProvider,
  useLanguage as sharedUseLanguage,
  STRINGS as sharedSTRINGS,
  getString as sharedGetString,
} from '../src/shared';
import { AppProviders } from '../src/app/AppProviders';
import { useTheme } from '../src/shared/theme';

describe('Bilingual Localization Engine — LanguageProvider & useLanguage', () => {
  it('provides default English context if useLanguage is called outside LanguageProvider', () => {
    let capturedContext!: LanguageContextValue;
    const ProblematicConsumer = () => {
      capturedContext = useLanguage();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(<ProblematicConsumer />);
    });
    expect(capturedContext).toBeDefined();
    expect(capturedContext.language).toBe('en');
  });

  it('defaults to English (en) locale as primary default', () => {
    let capturedContext!: LanguageContextValue;

    const TestConsumer = () => {
      capturedContext = useLanguage();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );
    });

    expect(capturedContext.language).toBe('en');
    expect(capturedContext.t('app.name')).toBe('Kashi Veda');
    expect(capturedContext.t('app.location')).toBe('Varanasi');
  });

  it('supports initialLanguage prop override', () => {
    let capturedContext!: LanguageContextValue;

    const TestConsumer = () => {
      capturedContext = useLanguage();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <LanguageProvider initialLanguage="hi">
          <TestConsumer />
        </LanguageProvider>
      );
    });

    expect(capturedContext.language).toBe('hi');
    expect(capturedContext.t('app.name')).toBe('काशी वेदा');
    expect(capturedContext.t('app.location')).toBe('वाराणसी');
  });

  it('correctly toggles language between English and Hindi', () => {
    let capturedContext!: LanguageContextValue;

    const TestConsumer = () => {
      capturedContext = useLanguage();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <LanguageProvider>
          <TestConsumer />
        </LanguageProvider>
      );
    });

    expect(capturedContext.language).toBe('en');

    // Toggle from English to Hindi
    act(() => {
      capturedContext.toggleLanguage();
    });

    expect(capturedContext.language).toBe('hi');
    expect(capturedContext.t('app.name')).toBe('काशी वेदा');
    expect(capturedContext.t('common.languageCode')).toBe('EN');

    // Toggle back from Hindi to English
    act(() => {
      capturedContext.toggleLanguage();
    });

    expect(capturedContext.language).toBe('en');
    expect(capturedContext.t('app.name')).toBe('Kashi Veda');
    expect(capturedContext.t('common.languageCode')).toBe('हिं');
  });

  it('supports explicit setLanguage calls', () => {
    let capturedContext!: LanguageContextValue;

    const TestConsumer = () => {
      capturedContext = useLanguage();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <LanguageProvider initialLanguage="hi">
          <TestConsumer />
        </LanguageProvider>
      );
    });

    expect(capturedContext.language).toBe('hi');

    act(() => {
      capturedContext.setLanguage('en');
    });
    expect(capturedContext.language).toBe('en');

    act(() => {
      capturedContext.setLanguage('hi');
    });
    expect(capturedContext.language).toBe('hi');
  });

  it('resolves inline bilingual copy via pick(hi, en)', () => {
    let capturedContext!: LanguageContextValue;

    const TestConsumer = () => {
      capturedContext = useLanguage();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <LanguageProvider initialLanguage="hi">
          <TestConsumer />
        </LanguageProvider>
      );
    });

    expect(capturedContext.pick('रुद्राभिषेक अनुष्ठान', 'Rudrabhishek Ritual')).toBe(
      'रुद्राभिषेक अनुष्ठान'
    );

    act(() => {
      capturedContext.setLanguage('en');
    });

    expect(capturedContext.pick('रुद्राभिषेक अनुष्ठान', 'Rudrabhishek Ritual')).toBe(
      'Rudrabhishek Ritual'
    );
  });
});

describe('Bilingual Localization Engine — Authentic String Catalog (strings.ts)', () => {
  it('contains valid Hindi and English translations for every catalog entry', () => {
    const keys = Object.keys(STRINGS) as StringKey[];
    expect(keys.length).toBeGreaterThanOrEqual(15);

    for (const key of keys) {
      const entry = STRINGS[key];
      expect(entry).toBeDefined();
      expect(typeof entry.hi).toBe('string');
      expect(typeof entry.en).toBe('string');
      expect(entry.hi.trim().length).toBeGreaterThan(0);
      expect(entry.en.trim().length).toBeGreaterThan(0);
    }
  });

  it('provides standalone getString function matching catalog entries', () => {
    expect(getString('app.name', 'hi')).toBe('काशी वेदा');
    expect(getString('app.name', 'en')).toBe('Kashi Veda');
    expect(getString('bookings.escrowTitle', 'hi')).toBe('एस्क्रो सुरक्षा');
    expect(getString('bookings.escrowTitle', 'en')).toBe('Escrow protection');
  });

  it('contains authentic Vedic terminology and escrow protection messaging', () => {
    expect(STRINGS['bookings.escrowNote'].hi).toBe(
      '50% अग्रिम राशि पूर्णाहुति तक एस्क्रो में सुरक्षित रहती है।'
    );
    expect(STRINGS['bookings.escrowNote'].en).toBe(
      'Your 50% advance stays in escrow until Purnahuti.'
    );

    expect(STRINGS['bookings.tabActive'].hi).toBe('सक्रिय');
    expect(STRINGS['bookings.tabUpcoming'].hi).toBe('आगामी');
    expect(STRINGS['bookings.tabPast'].hi).toBe('पूर्ण');

    expect(STRINGS['bookings.emptyTitle'].hi).toBe('कोई बुकिंग नहीं मिली');
    expect(STRINGS['bookings.emptyTitle'].en).toBe('No bookings yet');
  });
});

describe('Bilingual Localization Engine — Re-exports and AppProviders Integration', () => {
  it('correctly re-exports i18n symbols from src/shared', () => {
    expect(SharedLanguageProvider).toBe(LanguageProvider);
    expect(sharedUseLanguage).toBe(useLanguage);
    expect(sharedSTRINGS).toBe(STRINGS);
    expect(sharedGetString).toBe(getString);
  });

  it('allows child components inside AppProviders to consume both Theme and Language', async () => {
    let capturedTheme: any;
    let capturedLanguage: any;

    const ChildConsumer = () => {
      capturedTheme = useTheme();
      capturedLanguage = useLanguage();
      return null;
    };

    await act(async () => {
      ReactTestRenderer.create(
        <AppProviders>
          <ChildConsumer />
        </AppProviders>
      );
    });

    expect(capturedTheme).toBeDefined();
    expect(capturedTheme.colorScheme).toBe('light');
    expect(capturedLanguage).toBeDefined();
    expect(capturedLanguage.language).toBe('en');
    expect(capturedLanguage.t('app.name')).toBe('Kashi Veda');
  });
});
