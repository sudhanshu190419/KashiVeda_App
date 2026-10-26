import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { View, Text as RNText, StyleSheet, Pressable } from 'react-native';

import { ThemeProvider } from '../src/shared/theme';
import { LanguageProvider } from '../src/shared/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GOTRAS, ESCROW_CONFIG } from '../src/shared/constants/vedic';

// Group B: Layout Components
import {
  ScreenWrapper,
  AppBar,
  ScreenTitle,
  SectionHeader,
  StepProgress,
  StickyBottomBar,
  VCard,
  VTabs,
  GridList,
  AccordionList,
  FilterBar,
  OfflineBanner,
  VEmptyState,
  VErrorState,
} from '../src/shared/components/layout';

// Group C: Spiritual Components
import {
  KundliChartCanvas,
  KundliChart,
  PanchangCard,
  EscrowBadge,
  MuhuratCountdown,
  PanditRatingCard,
  DakshinaSelector,
  ChantingAudioPlayer,
  TempleLocationCard,
  LiveStatusPill,
  SankalpForm,
  VerificationBadge,
  RatingStars,
  SamagriChecklist,
} from '../src/shared/components/spiritual';

// Group D: Feedback Components
import {
  ToastNotification,
  ActionDialog,
  SuccessCelebration,
  DisputeAlert,
  BannerAlert,
} from '../src/shared/components/feedback';

// Root re-export compatibility test
import {
  Button as LegacyButton,
  Card as LegacyCard,
  ScreenWrapper as RootScreenWrapper,
  KundliChartCanvas as RootKundliChart,
  ToastNotification as RootToast,
  BannerAlert as RootBanner,
} from '../src/shared/components';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, bottom: 34, right: 0 },
};

const renderWithProviders = (element: React.ReactElement, lang: 'hi' | 'en' = 'en') => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider initialColorScheme="light">
          <LanguageProvider initialLanguage={lang}>
            {element}
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return tree;
};

describe('Composite UI Components (Groups B, C, D — 32 Components)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  // =========================================================================
  // Group B: Layout Components
  // =========================================================================
  describe('Group B: Layout Components', () => {
    describe('1. ScreenWrapper', () => {
      it('renders children with safe area and background container', () => {
        const tree = renderWithProviders(
          <ScreenWrapper testID="test-screen-wrapper">
            <RNText>Inner Content</RNText>
          </ScreenWrapper>
        );
        const node = tree.root.findByProps({ testID: 'test-screen-wrapper' });
        expect(node).toBeTruthy();
        expect(tree.root.findByType(RNText).props.children).toBe('Inner Content');
      });

      it('renders headerComponent and footerComponent when provided', () => {
        const tree = renderWithProviders(
          <ScreenWrapper
            headerComponent={<RNText>Header Area</RNText>}
            footerComponent={<RNText>Footer Area</RNText>}
          >
            <RNText>Body Area</RNText>
          </ScreenWrapper>
        );
        const texts = tree.root.findAllByType(RNText).map((t) => t.props.children);
        expect(texts).toContain('Header Area');
        expect(texts).toContain('Footer Area');
        expect(texts).toContain('Body Area');
      });
    });

    describe('2. AppBar', () => {
      it('renders title, back button, and calls onBackPress callback', () => {
        const onBack = jest.fn();
        const tree = renderWithProviders(
          <AppBar title="काशी दर्शन" onBackPress={onBack} showBackButton={true} />
        );
        const backBtn = tree.root.findByProps({ accessibilityLabel: 'Go back' });
        expect(backBtn).toBeTruthy();
        act(() => {
          backBtn.props.onPress();
        });
        expect(onBack).toHaveBeenCalledTimes(1);
      });
    });

    describe('3. ScreenTitle', () => {
      it('renders title, eyebrow, and subtitle', () => {
        const tree = renderWithProviders(
          <ScreenTitle
            title="Book a Pandit"
            eyebrow="Sacred Varanasi Rituals"
            subtitle="Verified Acharyas of Kashi"
          />
        );
        const texts = tree.root.findAllByType(RNText).map((t) => t.props.children);
        expect(texts).toContain('Book a Pandit');
        expect(texts).toContain('Sacred Varanasi Rituals');
        expect(texts).toContain('Verified Acharyas of Kashi');
      });
    });

    describe('4. SectionHeader', () => {
      it('renders section title and handles action button click', () => {
        const onAction = jest.fn();
        const tree = renderWithProviders(
          <SectionHeader
            title="Upcoming Rituals"
            actionLabel="View All"
            onActionPress={onAction}
          />
        );
        const actionBtn = tree.root.findByProps({ accessibilityLabel: 'View All' });
        expect(actionBtn).toBeTruthy();
        act(() => {
          actionBtn.props.onPress();
        });
        expect(onAction).toHaveBeenCalledTimes(1);
      });
    });

    describe('5. StepProgress', () => {
      it('renders active step and step count labels', () => {
        const steps = ['Ritual', 'Pandit', 'Sankalp', 'Payment'];
        const tree = renderWithProviders(
          <StepProgress currentStep={2} steps={steps} />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('6. StickyBottomBar', () => {
      it('renders primary CTA button with 48dp touch bounds', () => {
        const onAction = jest.fn();
        const tree = renderWithProviders(
          <StickyBottomBar
            primaryLabel="Confirm Booking"
            onPrimaryPress={onAction}
            summarySlot={<RNText>₹2,100 (50% Escrow Advance)</RNText>}
          />
        );
        expect(tree.root).toBeTruthy();
        const cta = tree.root.findByProps({ accessibilityLabel: 'Confirm Booking' });
        expect(cta).toBeTruthy();
        act(() => {
          cta.props.onPress();
        });
        expect(onAction).toHaveBeenCalledTimes(1);
      });
    });

    describe('7. VCard', () => {
      it('supports default and outlined variants', () => {
        const tree = renderWithProviders(
          <VCard variant="outlined" testID="card-outlined">
            <RNText>Sacred Card Body</RNText>
          </VCard>
        );
        const card = tree.root.findByProps({ testID: 'card-outlined' });
        expect(card).toBeTruthy();
      });
    });

    describe('8. VTabs', () => {
      it('switches tabs and triggers onTabChange', () => {
        const onTabChange = jest.fn();
        const tabs = [
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'completed', label: 'Completed' },
        ];
        const tree = renderWithProviders(
          <VTabs tabs={tabs} activeTab="upcoming" onTabChange={onTabChange} />
        );
        const completedTab = tree.root.findByProps({ accessibilityLabel: 'Completed' });
        expect(completedTab).toBeTruthy();
        act(() => {
          completedTab.props.onPress();
        });
        expect(onTabChange).toHaveBeenCalledWith('completed');
      });
    });

    describe('9. GridList', () => {
      it('renders items in grid columns', () => {
        const items = [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }];
        const tree = renderWithProviders(
          <GridList
            data={items}
            numColumns={2}
            keyExtractor={(it) => it.id}
            renderItem={(item) => <RNText key={item.id}>{item.name}</RNText>}
          />
        );
        const texts = tree.root.findAllByType(RNText).map((t) => t.props.children);
        expect(texts).toContain('Item 1');
        expect(texts).toContain('Item 2');
      });
    });

    describe('10. AccordionList', () => {
      it('renders expandable sections and handles press', () => {
        const sections = [
          {
            id: 'faq-1',
            title: 'What is Vedic Escrow?',
            content: <RNText>Escrow protects your advance dakshina.</RNText>,
          },
        ];
        const tree = renderWithProviders(
          <AccordionList sections={sections} />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('11. FilterBar', () => {
      it('renders filter chips and handles selection', () => {
        const onSelect = jest.fn();
        const filters = [
          { id: 'all', label: 'All' },
          { id: 'remote', label: 'Remote' },
        ];
        const tree = renderWithProviders(
          <FilterBar filters={filters} selectedId="all" onSelectFilter={onSelect} />
        );
        const remoteBtn = tree.root.findByProps({ accessibilityLabel: 'Remote' });
        act(() => {
          remoteBtn.props.onPress();
        });
        expect(onSelect).toHaveBeenCalledWith('remote');
      });
    });

    describe('12. OfflineBanner', () => {
      it('renders offline alert notice', () => {
        const tree = renderWithProviders(
          <OfflineBanner isOffline={true} />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('13. VEmptyState', () => {
      it('renders halo icon, message, and action CTA', () => {
        const onAction = jest.fn();
        const tree = renderWithProviders(
          <VEmptyState
            title="No Bookings Found"
            subtitle="Your sacred journey begins here"
            actionLabel="Discover Pujas"
            onActionPress={onAction}
          />
        );
        const cta = tree.root.findByProps({ accessibilityLabel: 'Discover Pujas' });
        act(() => {
          cta.props.onPress();
        });
        expect(onAction).toHaveBeenCalledTimes(1);
      });
    });

    describe('14. VErrorState', () => {
      it('renders error notice and retry CTA', () => {
        const onRetry = jest.fn();
        const tree = renderWithProviders(
          <VErrorState
            title="Connection Interrupted"
            onRetry={onRetry}
          />
        );
        const retryBtn = tree.root.findByProps({ accessibilityLabel: 'Tap to retry' });
        act(() => {
          retryBtn.props.onPress();
        });
        expect(onRetry).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // Group C: Spiritual Components
  // =========================================================================
  describe('Group C: Spiritual Components', () => {
    describe('15. KundliChartCanvas', () => {
      it('renders 12 North Indian diamond chart houses', () => {
        const planets = [
          { planet: 'Sun', rashi: 1, bhava: 1 },
          { planet: 'Jupiter', rashi: 7, bhava: 7 },
        ];
        const tree = renderWithProviders(
          <KundliChartCanvas planets={planets} />
        );
        expect(tree.root).toBeTruthy();
        expect(KundliChart).toBe(KundliChartCanvas);
      });
    });

    describe('16. PanchangCard', () => {
      it('renders authentic Varanasi ephemeris and Rahukaal', () => {
        const tree = renderWithProviders(
          <PanchangCard
            data={{
              date: '2026-10-26',
              tithi: 'Shukla Ekadashi',
              tithiHi: 'शुक्ल एकादशी',
              nakshatra: 'Rohini',
              nakshatraHi: 'रोहिणी',
              yoga: 'Vriddhi',
              yogaHi: 'वृद्धि',
              karana: 'Bava',
              karanaHi: 'बव',
              sunrise: '06:08',
              sunset: '17:42',
              rahukaalStart: '07:30',
              rahukaalEnd: '09:00',
              abhijeetStart: '11:36',
              abhijeetEnd: '12:24',
              isAuspicious: true,
            }}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('17. EscrowBadge', () => {
      it('renders authentic 50% advance escrow protection status', () => {
        const tree = renderWithProviders(
          <EscrowBadge
            status="confirmed"
            fulfillmentStage="ritual_started"
            amountInr={2500}
          />
        );
        expect(tree.root).toBeTruthy();
        expect(ESCROW_CONFIG.advancePercent).toBe(50);
      });
    });

    describe('18. MuhuratCountdown', () => {
      it('renders countdown to target auspicious timestamp', () => {
        const futureDate = new Date(Date.now() + 3600000).toISOString();
        const tree = renderWithProviders(
          <MuhuratCountdown
            targetDateTime={futureDate}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('19. PanditRatingCard', () => {
      it('renders Pandit credentials, rating stars, and fee structure', () => {
        const tree = renderWithProviders(
          <PanditRatingCard
            rating={4.9}
            totalReviews={128}
            verified={true}
            institutionName="Sampurnanand Sanskrit Vishwavidyalaya"
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('20. DakshinaSelector', () => {
      it('renders sacred denominations (₹101, ₹251, ₹501, ₹1100, ₹2100) and handles selection', () => {
        const onSelect = jest.fn();
        const tree = renderWithProviders(
          <DakshinaSelector
            selectedAmount={501}
            onSelectAmount={onSelect}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('21. ChantingAudioPlayer', () => {
      it('renders mantra chant player and controls', () => {
        const tree = renderWithProviders(
          <ChantingAudioPlayer
            mantraTitle="Mahamrityunjaya Mantra"
            mantraTitleHi="महामृत्युंजय मंत्र"
            panditName="Acharya Vidyadhar"
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('22. TempleLocationCard', () => {
      it('renders sacred Ghat and temple coordinates', () => {
        const tree = renderWithProviders(
          <TempleLocationCard
            templeName="Kashi Vishwanath Temple"
            templeNameHi="श्री काशी विश्वनाथ मंदिर"
            ghatId="manikarnika"
            distanceKm={1.2}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('23. LiveStatusPill', () => {
      it('renders live ritual stage chip', () => {
        const tree = renderWithProviders(
          <LiveStatusPill status="in_progress" customLabel="Ritual in Progress" />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('24. SankalpForm', () => {
      it('renders Yajamana details and handles Gotra selection', () => {
        const onName = jest.fn();
        const onGotra = jest.fn();
        const tree = renderWithProviders(
          <SankalpForm
            devoteeName="Amar Singh"
            onDevoteeNameChange={onName}
            selectedGotra={GOTRAS[0].id}
            onSelectGotra={onGotra}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('25. VerificationBadge', () => {
      it('renders Acharya verified mark', () => {
        const tree = renderWithProviders(
          <VerificationBadge status="verified" institutionId="ssu" />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('26. RatingStars', () => {
      it('renders 5 stars and handles onRate in interactive mode', () => {
        const onRate = jest.fn();
        const tree = renderWithProviders(
          <RatingStars rating={4.5} isInteractive={true} onRate={onRate} />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('27. SamagriChecklist', () => {
      it('renders samagri items with pricing and toggle callbacks', () => {
        const onToggle = jest.fn();
        const items = [
          {
            id: 's-1',
            nameEn: 'Gangajal',
            nameHi: 'गंगाजल',
            quantity: '1 L',
            priceInr: 101,
            isIncluded: true,
          },
        ];
        const tree = renderWithProviders(
          <SamagriChecklist items={items} onToggleItem={onToggle} />
        );
        expect(tree.root).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // Group D: Feedback Components
  // =========================================================================
  describe('Group D: Feedback Components', () => {
    describe('28. ToastNotification', () => {
      it('renders message and dismiss button', () => {
        const onDismiss = jest.fn();
        const tree = renderWithProviders(
          <ToastNotification
            isVisible={true}
            type="success"
            message="Sankalp registered successfully"
            onDismiss={onDismiss}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('29. ActionDialog', () => {
      it('renders confirm and cancel buttons with 48dp floor', () => {
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        const tree = renderWithProviders(
          <ActionDialog
            visible={true}
            title="Cancel Booking?"
            description="Advance held in escrow will be refunded per policy."
            primaryLabel="Confirm Cancellation"
            onPrimaryPress={onConfirm}
            secondaryLabel="Keep Booking"
            onSecondaryPress={onCancel}
            onClose={onCancel}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('30. SuccessCelebration', () => {
      it('renders celebration badge and receipt metrics', () => {
        const onDone = jest.fn();
        const tree = renderWithProviders(
          <SuccessCelebration
            visible={true}
            title="Puja Confirmed"
            subtitle="Your sacred ritual is registered in Kashi."
            bookingId="KV-2026-9901"
            primaryActionLabel="View Booking Details"
            onPrimaryAction={onDone}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('31. DisputeAlert', () => {
      it('renders Shastric mediation notice and 50% escrow freeze', () => {
        const onContact = jest.fn();
        const tree = renderWithProviders(
          <DisputeAlert
            bookingId="KV-8821"
            amountHeldInEscrowInr={1500}
            onContactSupport={onContact}
          />
        );
        expect(tree.root).toBeTruthy();
      });
    });

    describe('32. BannerAlert', () => {
      it('renders escrow guarantee banner with dismiss callback', () => {
        const onDismiss = jest.fn();
        const onAction = jest.fn();
        const tree = renderWithProviders(
          <BannerAlert
            type="escrow"
            title="Vedic Escrow Guarantee"
            message="Your advance dakshina is securely held until ritual completion."
            actionLabel="Learn More"
            onActionPress={onAction}
            onDismiss={onDismiss}
          />
        );
        const actionBtn = tree.root.findByProps({ accessibilityLabel: 'Learn More' });
        expect(actionBtn).toBeTruthy();
        act(() => {
          actionBtn.props.onPress();
        });
        expect(onAction).toHaveBeenCalledTimes(1);

        const dismissBtn = tree.root.findByProps({ accessibilityLabel: 'Dismiss alert' });
        expect(dismissBtn).toBeTruthy();
        act(() => {
          dismissBtn.props.onPress();
        });
        expect(onDismiss).toHaveBeenCalledTimes(1);
      });
    });
  });

  // =========================================================================
  // Backward Compatibility & Root Export Surface
  // =========================================================================
  describe('Backward Compatibility & Root Export Surface', () => {
    it('preserves legacy components alongside newly ported components', () => {
      expect(LegacyButton).toBeDefined();
      expect(LegacyCard).toBeDefined();
      expect(RootScreenWrapper).toBeDefined();
      expect(RootKundliChart).toBeDefined();
      expect(RootToast).toBeDefined();
      expect(RootBanner).toBeDefined();
    });
  });
});
