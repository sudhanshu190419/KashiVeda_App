// __tests__/muhurat_proposal_wizard.test.tsx
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/shared/theme';
import { LanguageProvider } from '../src/shared/i18n';
import { MuhuratProposalCard } from '../src/features/booking/components/MuhuratProposalCard';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, bottom: 34, right: 0 },
};

function renderWithProviders(element: React.ReactElement, lang: 'hi' | 'en' = 'en') {
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
}

function extractAllText(node: any): string {
  function collect(n: any): string {
    if (!n) return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(collect).join('');
    if (n.children) return collect(n.children);
    if (n.props && n.props.children) return collect(n.props.children);
    return '';
  }
  return collect(node).replace(/\s+/g, ' ').trim();
}

describe('MuhuratProposalCard Component', () => {
  it('renders pandit information, comparison box, and shastric rationale without emojis', () => {
    const onAccept = jest.fn();
    const onRequestAnotherDate = jest.fn();
    const onCancelWithRefund = jest.fn();
    const onCallPandit = jest.fn();

    const renderer = renderWithProviders(
      <MuhuratProposalCard
        panditName="Pt. Ramkrishna Shastri"
        specialization="Shukla Yajurveda • Shukla Paksha Specialist"
        requestedDateText="Saturday, 18 Nov (Morning)"
        recommendedMuhuratText="Mon, 20 Nov • 08:30 AM"
        astrologicalReason="On Saturday 18th Nov, Bhadra is active with Rahu Kaal overlap for Kashyap Gotra. Monday 20th Nov Somwar Pradosh coincides with Rohini Nakshatra, which brings tenfold planetary blessings."
        advanceDepositAmount={738}
        panditPhone="+919876543210"
        onAccept={onAccept}
        onRequestAnotherDate={onRequestAnotherDate}
        onCancelWithRefund={onCancelWithRefund}
        onCallPandit={onCallPandit}
        testID="muhurat-proposal-card"
      />
    );

    const allText = extractAllText(renderer.toJSON());

    // Header & Pandit details
    expect(allText).toContain('MUHURAT RECOMMENDATION');
    expect(allText).toContain('Pt. Ramkrishna Shastri');
    expect(allText).toContain('Shukla Yajurveda • Shukla Paksha Specialist');

    // Comparison details
    expect(allText).toContain('Your Requested Date:');
    expect(allText).toContain('Saturday, 18 Nov (Morning)');
    expect(allText).toContain('Recommended Shubh Muhurat:');
    expect(allText).toContain('Mon, 20 Nov • 08:30 AM');

    // Astrological rationale
    expect(allText).toContain('Shastra Reason for Adjustment');
    expect(allText).toContain('Bhadra is active with Rahu Kaal overlap');

    // 3 Decisive Actions
    expect(allText).toContain('Accept Recommended Muhurat');
    expect(allText).toContain('Request Another Date');
    expect(allText).toContain('Call Pandit Ji');
    expect(allText).toContain('100% Refund Cancel');

    // Escrow & Zero penalty guarantee
    expect(allText).toContain('Zero Penalty Guarantee');
    expect(allText).toContain('₹738');

    // Ensure zero emojis
    expect(allText).not.toMatch(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/);
  });

  it('triggers onAccept callback when Accept Recommended Muhurat is pressed', () => {
    const onAccept = jest.fn();
    const renderer = renderWithProviders(
      <MuhuratProposalCard
        panditName="Pt. Ramkrishna Shastri"
        requestedDateText="Sat, 18 Nov"
        recommendedMuhuratText="Mon, 20 Nov • 08:30 AM"
        astrologicalReason="Auspicious tithi alignment."
        onAccept={onAccept}
        onRequestAnotherDate={jest.fn()}
        onCancelWithRefund={jest.fn()}
      />
    );

    const root = renderer.root;
    const acceptBtn = root.findByProps({ testID: 'accept-muhurat-btn' });
    act(() => {
      acceptBtn.props.onPress();
    });

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('triggers onRequestAnotherDate callback when Request Another Date is pressed', () => {
    const onRequestAnotherDate = jest.fn();
    const renderer = renderWithProviders(
      <MuhuratProposalCard
        panditName="Pt. Ramkrishna Shastri"
        requestedDateText="Sat, 18 Nov"
        recommendedMuhuratText="Mon, 20 Nov • 08:30 AM"
        astrologicalReason="Auspicious tithi alignment."
        onAccept={jest.fn()}
        onRequestAnotherDate={onRequestAnotherDate}
        onCancelWithRefund={jest.fn()}
      />
    );

    const root = renderer.root;
    const requestDateBtn = root.findByProps({ testID: 'request-another-date-btn' });
    act(() => {
      requestDateBtn.props.onPress();
    });

    expect(onRequestAnotherDate).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancelWithRefund callback when 100% Refund Cancel is pressed', () => {
    const onCancelWithRefund = jest.fn();
    const renderer = renderWithProviders(
      <MuhuratProposalCard
        panditName="Pt. Ramkrishna Shastri"
        requestedDateText="Sat, 18 Nov"
        recommendedMuhuratText="Mon, 20 Nov • 08:30 AM"
        astrologicalReason="Auspicious tithi alignment."
        onAccept={jest.fn()}
        onRequestAnotherDate={jest.fn()}
        onCancelWithRefund={onCancelWithRefund}
      />
    );

    const root = renderer.root;
    const cancelBtn = root.findByProps({ testID: 'cancel-refund-btn' });
    act(() => {
      cancelBtn.props.onPress();
    });

    expect(onCancelWithRefund).toHaveBeenCalledTimes(1);
  });

  it('triggers onCallPandit callback when Call Pandit Ji is pressed', () => {
    const onCallPandit = jest.fn();
    const renderer = renderWithProviders(
      <MuhuratProposalCard
        panditName="Pt. Ramkrishna Shastri"
        requestedDateText="Sat, 18 Nov"
        recommendedMuhuratText="Mon, 20 Nov • 08:30 AM"
        astrologicalReason="Auspicious tithi alignment."
        onAccept={jest.fn()}
        onRequestAnotherDate={jest.fn()}
        onCancelWithRefund={jest.fn()}
        onCallPandit={onCallPandit}
      />
    );

    const root = renderer.root;
    const callBtn = root.findByProps({ testID: 'call-pandit-btn' });
    act(() => {
      callBtn.props.onPress();
    });

    expect(onCallPandit).toHaveBeenCalledTimes(1);
  });
});
