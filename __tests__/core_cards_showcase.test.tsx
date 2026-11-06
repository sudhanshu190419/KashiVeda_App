import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ThemeProvider } from '../src/shared/theme';
import { LanguageProvider } from '../src/shared/i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  UpcomingPujaCard,
  PujaKitCard,
} from '../src/shared/components/spiritual';
import { PanditCard } from '../src/features/discovery/components/PanditCard';
import { PujaCard } from '../src/features/discovery/components/PujaCard';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, bottom: 34, right: 0 },
};

const renderWithProviders = (children: React.ReactElement) => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <ThemeProvider initialColorScheme="light">
          <LanguageProvider initialLanguage="en">{children}</LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  });
  return renderer;
};

// Recursively extract and normalize all text content from React test instance
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

describe('Core Cards Showcase', () => {
  describe('UpcomingPujaCard', () => {
    it('renders puja name, location, and date correctly without emojis', () => {
      const handleAction = jest.fn();
      const renderer = renderWithProviders(
        <UpcomingPujaCard
          pujaName="Rudrabhishek Puja"
          location="Shri Kashi Vishwanath Temple, Varanasi"
          dateString="Kartik Purnima"
          timeString="06:30 PM"
          serviceMode="temple"
          status="confirmed"
          sankalpName="Sharma Parivar (Kashyap Gotra)"
          panditName="Pt. Ramkrishna Shastri"
          onActionPress={handleAction}
          testID="test-upcoming-card"
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Rudrabhishek Puja');
      expect(allText).toContain('Shri Kashi Vishwanath Temple, Varanasi');
      expect(allText).toContain('Kartik Purnima • 06:30 PM');
      expect(allText).toContain('Sharma Parivar (Kashyap Gotra)');
      expect(allText).toContain('Pt. Ramkrishna Shastri');
    });

    it('renders live video mode with appropriate default action label', () => {
      const handleAction = jest.fn();
      const renderer = renderWithProviders(
        <UpcomingPujaCard
          pujaName="Mahamrityunjaya Jaap"
          serviceMode="remote"
          status="in_progress"
          onActionPress={handleAction}
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Mahamrityunjaya Jaap');
      expect(allText).toContain('Join Live Stream');
    });
  });

  describe('PujaKitCard', () => {
    it('renders standard package name, item breakdown, and price total', () => {
      const handleToggle = jest.fn();
      const renderer = renderWithProviders(
        <PujaKitCard
          packageName="Rudrabhishek Standard Kit"
          subtitle="Essential ritual items arranged by Kashi Veda"
          price={850}
          isSelected={true}
          onToggleSelect={handleToggle}
          testID="test-kit-card"
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Rudrabhishek Standard Kit');
      expect(allText).toContain('Pure Haridwar Ganga Jal');
      expect(allText).toContain('Desi Gir Cow Bilona Ghee');
      expect(allText).toContain('₹850.00');
    });

    it('displays unselected state and allows custom action label', () => {
      const renderer = renderWithProviders(
        <PujaKitCard
          packageName="Custom Puja Kit"
          price={1200}
          isSelected={false}
          actionLabel="Select Package"
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Custom Puja Kit');
      expect(allText).toContain('Select Package');
    });
  });

  describe('PanditCard (Dakshina removed from general card)', () => {
    it('renders pandit profile without static Dakshina amount', () => {
      const handlePress = jest.fn();
      const renderer = renderWithProviders(
        <PanditCard
          pandit={{
            id: 'pandit-1',
            user_id: 'user-1',
            display_name: 'Pt. Ramkrishna Shastri',
            avatar_url: null,
            bio: 'Vedic priest from Varanasi',
            years_experience: 22,
            rating_avg: 4.9,
            rating_count: 184,
            languages: ['Sanskrit', 'Hindi'],
            offering_names: ['Rudrabhishek', 'Mahamrityunjaya'],
            puja_price: 2100,
            public_status: 'available',
            distance_km: null,
            kundli_enabled: false,
            kundli_price: null,
          }}
          onPress={handlePress}
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Pt. Ramkrishna Shastri');
      expect(allText).toContain('22 yrs exp');
      expect(allText).toContain('View Profile');
      // Verify Dakshina label is NOT on the card
      expect(allText).not.toContain('Dakshina');
    });
  });

  describe('PujaCard (Design A - Horizontal Banner)', () => {
    it('renders ritual card with top banner, category badge, duration and 48dp CTA without emojis or static price', () => {
      const handlePress = jest.fn();
      const renderer = renderWithProviders(
        <PujaCard
          puja={{
            id: 'puja-1',
            name: 'Rudrabhishek Puja',
            description: 'Holy bath ritual of Lord Shiva',
            category_id: 'cat-1',
            category: { id: 'cat-1', name: 'Shiva Pujas' },
            default_duration_minutes: 90,
            allowed_modes: ['home', 'temple', 'remote'],
            starting_price: 2100,
            is_active: true,
            created_at: new Date().toISOString(),
          }}
          onPress={handlePress}
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Rudrabhishek Puja');
      expect(allText).toContain('SHIVA PUJAS');
      expect(allText).toContain('90 mins');
      expect(allText).toContain('1 Pandit');
      expect(allText).toContain('Book Puja');
      // Verify static price is NOT rendered on the card (deferred to booking flow)
      expect(allText).not.toContain('₹2,100');
      // No clock emoji
      expect(allText).not.toContain('⏱');
    });

    it('renders HOME ONLY badge when ritual is restricted to home visit', () => {
      const handlePress = jest.fn();
      const renderer = renderWithProviders(
        <PujaCard
          puja={{
            id: 'puja-2',
            name: 'Griha Pravesh Puja',
            description: 'Home consecration ceremony',
            category_id: 'cat-2',
            category: { id: 'cat-2', name: 'Vastu' },
            default_duration_minutes: 180,
            allowed_modes: ['home'],
            is_active: true,
            created_at: new Date().toISOString(),
          }}
          onPress={handlePress}
        />
      );

      const allText = extractAllText(renderer.toJSON());
      expect(allText).toContain('Griha Pravesh Puja');
      expect(allText).toContain('HOME ONLY');
      expect(allText).toContain('180 mins');
      expect(allText).toContain('Book Puja');
    });
  });
});
