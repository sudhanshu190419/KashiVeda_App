import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  ThemeProvider,
  useTheme,
  primitiveTokens,
  lightColors,
  darkColors,
  typeScale,
  FONT_DISPLAY,
  FONT_UI_LATIN,
  FONT_UI_DEVANAGARI,
  getDevanagariLineHeight,
  getDevanagariTextStyle,
  colors,
  spacing,
  radius,
  shadows,
  typography,
} from '../src/shared/theme';
import {
  GOTRAS,
  GOTRA_FALLBACK,
  PUJA_CATEGORIES,
  BOOKING_MODES,
  BOOKING_STATUSES,
  FULFILLMENT_STAGES,
  PANCHANG_LABELS,
  CREDENTIAL_INSTITUTIONS,
  ONBOARDING_STEPS,
  AVAILABILITY_STATES,
  EMPTY_STATE_MESSAGES,
  ERROR_STATE_MESSAGES,
  DAKSHINA_AMOUNTS,
  CANCELLATION_POLICY,
  ESCROW_CONFIG,
  VARANASI_GHATS,
  RITUAL_CHOICES,
  AUTHENTIC_VEDIC_SAMAGRI,
  CANCELLATION_RULES,
} from '../src/shared/constants';

describe('Territory G — Design Tokens (tokens.ts)', () => {
  it('has valid primitive color palettes for Amber, Vermillion, and Neutrals', () => {
    expect(primitiveTokens.colors.amber[500]).toBe('#F59E0B');
    expect(primitiveTokens.colors.amber[700]).toBe('#B45309');
    expect(primitiveTokens.colors.vermillion[600]).toBe('#DC2626');
    expect(primitiveTokens.colors.neutral[50]).toBe('#FFFDF9'); // Ivory
    expect(primitiveTokens.colors.neutral[950]).toBe('#0B0E14'); // Obsidian
    expect(primitiveTokens.colors.neutral[0]).toBe('#FFFFFF');
  });

  it('defines 4dp grid spacing tokens from 2 to 48', () => {
    expect(primitiveTokens.spacing.xxs).toBe(2);
    expect(primitiveTokens.spacing.xs).toBe(4);
    expect(primitiveTokens.spacing.sm).toBe(8);
    expect(primitiveTokens.spacing.md).toBe(12);
    expect(primitiveTokens.spacing.lg).toBe(16);
    expect(primitiveTokens.spacing.xl).toBe(20);
    expect(primitiveTokens.spacing.xxl).toBe(24);
    expect(primitiveTokens.spacing.xxxl).toBe(32);
    expect(primitiveTokens.spacing.xxxxl).toBe(40);
    expect(primitiveTokens.spacing.touch).toBe(48);
  });

  it('defines corner radii tokens from none (0) to full (999)', () => {
    expect(primitiveTokens.radius.none).toBe(0);
    expect(primitiveTokens.radius.sm).toBe(6);
    expect(primitiveTokens.radius.md).toBe(10);
    expect(primitiveTokens.radius.lg).toBe(12);
    expect(primitiveTokens.radius.xl).toBe(16);
    expect(primitiveTokens.radius.sheet).toBe(24);
    expect(primitiveTokens.radius.full).toBe(999);
  });

  it('defines 5 elevation levels for both light and dark themes', () => {
    // Light theme uses React Native shadow props
    expect(primitiveTokens.elevation.light.elevation0.elevation).toBe(0);
    expect(primitiveTokens.elevation.light.elevation1.elevation).toBe(2);
    expect(primitiveTokens.elevation.light.elevation2.elevation).toBe(4);
    expect(primitiveTokens.elevation.light.elevation3.elevation).toBe(8);
    expect(primitiveTokens.elevation.light.elevation4.elevation).toBe(16);

    // Dark theme uses obsidian border highlights
    expect(primitiveTokens.elevation.dark.elevation0.borderColor).toBe('transparent');
    expect(primitiveTokens.elevation.dark.elevation1.borderColor).toBe('#222D42');
    expect(primitiveTokens.elevation.dark.elevation2.borderColor).toBe('#2B3852');
    expect(primitiveTokens.elevation.dark.elevation3.borderColor).toBe('#334363');
    expect(primitiveTokens.elevation.dark.elevation4.borderColor).toBe('#3E5279');
  });

  it('defines motion tokens for animations and springs', () => {
    expect(primitiveTokens.motion.duration.instant).toBe(100);
    expect(primitiveTokens.motion.duration.fast).toBe(200);
    expect(primitiveTokens.motion.duration.normal).toBe(300);
    expect(primitiveTokens.motion.duration.sheet).toBe(400);
    expect(primitiveTokens.motion.spring.sheet.damping).toBe(24);
    expect(primitiveTokens.motion.spring.sheet.stiffness).toBe(280);
  });
});

describe('Territory G — Dual Theme Semantics (semantics.ts)', () => {
  it('maps light theme to Ivory background and deep dark text', () => {
    expect(lightColors.surfaceBase).toBe('#FFFDF9');
    expect(lightColors.surfaceCard).toBe('#FFFFFF');
    expect(lightColors.textPrimary).toBe('#1C1917');
    expect(lightColors.brandPrimary).toBe('#B45309');
  });

  it('maps dark theme to Obsidian background and crisp light text', () => {
    expect(darkColors.surfaceBase).toBe('#0B0E14');
    expect(darkColors.surfaceCard).toBe('#121824');
    expect(darkColors.textPrimary).toBe('#F8FAFC');
    expect(darkColors.brandPrimary).toBe('#F59E0B');
  });

  it('provides matching semantic keys between light and dark themes', () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(lightKeys).toEqual(darkKeys);
  });
});

describe('Territory G — Typography System (typography.ts)', () => {
  it('defines font family names for Rozha One, Plus Jakarta Sans, and Noto Sans Devanagari', () => {
    expect(FONT_DISPLAY).toBe('RozhaOne-Regular');
    expect(FONT_UI_LATIN).toBe('PlusJakartaSans');
    expect(FONT_UI_DEVANAGARI).toBe('NotoSansDevanagari');
  });

  it('defines 11-level type scale', () => {
    const variants = Object.keys(typeScale);
    expect(variants).toHaveLength(11);
    expect(variants).toContain('displayHero');
    expect(variants).toContain('headlineLarge');
    expect(variants).toContain('headlineMedium');
    expect(variants).toContain('headlineSmall');
    expect(variants).toContain('titleMedium');
    expect(variants).toContain('titleSmall');
    expect(variants).toContain('bodyLarge');
    expect(variants).toContain('bodyMedium');
    expect(variants).toContain('labelLarge');
    expect(variants).toContain('labelMedium');
    expect(variants).toContain('caption');
  });

  it('calculates Devanagari line-height with adequate vertical clearance', () => {
    const fontSize = 16;
    const lineHeight = getDevanagariLineHeight(fontSize);
    expect(lineHeight).toBeGreaterThanOrEqual(fontSize * 1.5);
    expect(lineHeight).toBe(24);
  });

  it('maps typography styles to Devanagari font families correctly', () => {
    const boldStyle = getDevanagariTextStyle('headlineMedium');
    expect(boldStyle.fontFamily).toBe('NotoSansDevanagari-Bold');

    const semiBoldStyle = getDevanagariTextStyle('titleMedium');
    expect(semiBoldStyle.fontFamily).toBe('NotoSansDevanagari-SemiBold');

    const regularStyle = getDevanagariTextStyle('bodyMedium');
    expect(regularStyle.fontFamily).toBe('NotoSansDevanagari-Regular');
  });

  it('preserves legacy typography scale for backwards compatibility', () => {
    expect(typography.fontSize.xs).toBe(12);
    expect(typography.fontSize.hero).toBe(36);
    expect(typography.lineHeight.md).toBe(24);
    expect(typography.fontWeight.bold).toBe('700');
  });
});

describe('Territory G — Dual Theme Provider (ThemeProvider.tsx)', () => {
  it('provides default light theme if useTheme is called outside ThemeProvider', () => {
    let capturedTheme: any;
    const ConsumerOutside = () => {
      capturedTheme = useTheme();
      return null;
    };
    act(() => {
      ReactTestRenderer.create(<ConsumerOutside />);
    });
    expect(capturedTheme).toBeDefined();
    expect(capturedTheme.colorScheme).toBe('light');
    expect(capturedTheme.colors.surfaceBase).toBe('#FFFDF9');
  });

  it('provides light theme when initialized with light mode', () => {
    let capturedTheme: any;
    const Consumer = () => {
      capturedTheme = useTheme();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <ThemeProvider initialColorScheme="light">
          <Consumer />
        </ThemeProvider>
      );
    });

    expect(capturedTheme.colorScheme).toBe('light');
    expect(capturedTheme.isDark).toBe(false);
    expect(capturedTheme.colors.surfaceBase).toBe('#FFFDF9');
    expect(capturedTheme.spacing.md).toBe(12);
    expect(capturedTheme.radii.sheet).toBe(24);
    expect(capturedTheme.typography.displayHero.fontSize).toBe(28);
    expect(capturedTheme.elevation.elevation1.elevation).toBe(2);
  });

  it('provides dark theme when initialized with dark mode', () => {
    let capturedTheme: any;
    const Consumer = () => {
      capturedTheme = useTheme();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <ThemeProvider initialColorScheme="dark">
          <Consumer />
        </ThemeProvider>
      );
    });

    expect(capturedTheme.colorScheme).toBe('dark');
    expect(capturedTheme.isDark).toBe(true);
    expect(capturedTheme.colors.surfaceBase).toBe('#0B0E14');
    expect(capturedTheme.elevation.elevation1.borderColor).toBe('#222D42');
  });

  it('supports toggling theme between light and dark', () => {
    let capturedTheme: any;
    const Consumer = () => {
      capturedTheme = useTheme();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <ThemeProvider initialColorScheme="light">
          <Consumer />
        </ThemeProvider>
      );
    });

    expect(capturedTheme.colorScheme).toBe('light');

    act(() => {
      capturedTheme.toggleTheme();
    });

    expect(capturedTheme.colorScheme).toBe('dark');
    expect(capturedTheme.isDark).toBe(true);

    act(() => {
      capturedTheme.toggleTheme();
    });

    expect(capturedTheme.colorScheme).toBe('light');
    expect(capturedTheme.isDark).toBe(false);
  });

  it('supports explicit setMode calls', () => {
    let capturedTheme: any;
    const Consumer = () => {
      capturedTheme = useTheme();
      return null;
    };

    act(() => {
      ReactTestRenderer.create(
        <ThemeProvider initialColorScheme="light">
          <Consumer />
        </ThemeProvider>
      );
    });

    act(() => {
      capturedTheme.setMode('dark');
    });

    expect(capturedTheme.mode).toBe('dark');
    expect(capturedTheme.isDark).toBe(true);
    expect(capturedTheme.colors.surfaceBase).toBe('#0B0E14');
  });
});

describe('Territory G — Authentic Vedic Domain Constants (vedic.ts)', () => {
  it('contains authentic 15 Gotras with Pravara', () => {
    expect(GOTRAS).toHaveLength(15);
    const kashyapa = GOTRAS.find((g) => g.id === 'kashyapa');
    expect(kashyapa).toBeDefined();
    expect(kashyapa?.nameHi).toBe('कश्यप');
    expect(kashyapa?.pravara).toContain('कश्यप');
  });

  it('provides Shastra-prescribed Kashyapa fallback for unknown lineage', () => {
    expect(GOTRA_FALLBACK.id).toBe('kashyapa');
    expect(GOTRA_FALLBACK.nameHi).toContain('अज्ञात गोत्र हेतु शास्त्रीय विधान');
  });

  it('contains authentic Puja categories and booking modes', () => {
    expect(PUJA_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    const rudrabhishek = PUJA_CATEGORIES.find((p) => p.id === 'rudrabhishek');
    expect(rudrabhishek?.nameHi).toBe('रुद्राभिषेक');

    expect(BOOKING_MODES).toHaveLength(3);
    expect(BOOKING_MODES.map((m) => m.id)).toEqual(['remote', 'temple', 'home']);
  });

  it('contains decoupled Macro BookingStatus and day-of-puja FulfillmentStages', () => {
    expect(BOOKING_STATUSES).toContain('in_progress');
    expect(BOOKING_STATUSES).toContain('confirmed');
    expect(BOOKING_STATUSES).toContain('completed');

    expect(FULFILLMENT_STAGES).toEqual([
      'samagri_dispatched',
      'pandit_en_route',
      'ritual_started',
      'purnahuti',
    ]);
  });

  it('contains authentic credential institutions in Varanasi', () => {
    const ssu = CREDENTIAL_INSTITUTIONS.find((i) => i.id === 'ssu');
    expect(ssu?.nameEn).toBe('Sampurnanand Sanskrit Vishwavidyalaya');
    const bhu = CREDENTIAL_INSTITUTIONS.find((i) => i.id === 'bhu_svdv');
    expect(bhu?.nameEn).toContain('BHU SVDV');
  });

  it('contains authentic Varanasi Ghats and Samagri with real measurements', () => {
    expect(VARANASI_GHATS.length).toBeGreaterThanOrEqual(5);
    const assi = VARANASI_GHATS.find((g) => g.id === 'assi');
    expect(assi?.nameHi).toBe('अस्सी घाट');

    expect(AUTHENTIC_VEDIC_SAMAGRI.length).toBeGreaterThanOrEqual(5);
    const gangajal = AUTHENTIC_VEDIC_SAMAGRI.find((s) => s.id === 'gangajal');
    expect(gangajal?.quantity).toBe('500 ml');
    expect(gangajal?.priceInr).toBe(90);
  });

  it('defines authentic cancellation policy tiers and rules', () => {
    expect(CANCELLATION_POLICY.fullRefundWindowHours).toBe(24);
    expect(CANCELLATION_POLICY.panditCancellationRefund).toBe(100);
    expect(CANCELLATION_RULES).toHaveLength(3);
    expect(CANCELLATION_RULES[0].refundPercent).toBe(100);
    expect(CANCELLATION_RULES[1].refundPercent).toBe(50);
    expect(CANCELLATION_RULES[2].refundPercent).toBe(0);
  });

  it('enforces zero mock data and honest bilingual empty states', () => {
    expect(EMPTY_STATE_MESSAGES.noBookings.en).toBe('No upcoming pujas found');
    expect(EMPTY_STATE_MESSAGES.noBookings.hi).toBe('कोई आगामी पूजा नहीं मिली');
    expect(ERROR_STATE_MESSAGES.loadFailed.en).toBe('Could not load data');
  });
});

describe('Territory G — Backwards Compatibility Layer (index.ts)', () => {
  it('re-exports colors, spacing, radius, and shadows for legacy screens', () => {
    expect(colors.primary).toBe('#E05A1B');
    expect(colors.secondary).toBe('#D97706');
    expect(spacing.base).toBe(16);
    expect(radius.full).toBe(9999);
    expect(shadows.md.elevation).toBe(3);
  });
});
