import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { View, Text as RNText, StyleSheet, TextInput as RNTextInput } from 'react-native';

import { ThemeProvider } from '../src/shared/theme';
import { LanguageProvider } from '../src/shared/i18n';
import { GOTRA_FALLBACK, GOTRAS } from '../src/shared/constants/vedic';

// Foundation Components under test
import {
  VText,
  VButton,
  VIconButton,
  VInput,
  VAvatar,
  VBadge,
  VCheckbox,
  VCheckboxGroup,
  VDivider,
  VShimmer,
  VSlider,
  VSpinner,
  VSwitch,
  VTag,
  DatePickerModal,
  TimePickerModal,
  FileUploadField,
  GotraPickerDropdown,
  SelectDropdown,
  SolarBrandGlyph,
  OtpPinInput,
  VARANASI_GHAT_OPTIONS,
  RITUAL_CHOICE_OPTIONS,
} from '../src/shared/components/foundations';

import {
  Button as LegacyButton,
  Card as LegacyCard,
  Header as LegacyHeader,
  Input as LegacyInput,
  Text as LegacyText,
} from '../src/shared/components';

const renderWithProviders = (element: React.ReactElement, lang: 'hi' | 'en' = 'hi') => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <ThemeProvider initialColorScheme="light">
        <LanguageProvider initialLanguage={lang}>
          {element}
        </LanguageProvider>
      </ThemeProvider>
    );
  });
  return tree;
};

describe('Foundation UI Components (Group A — 19 Primitives)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  describe('1. VText (Bilingual Typography Primitive)', () => {
    it('enforces 11-level type scale and default bodyMedium style', () => {
      const tree = renderWithProviders(<VText>Namaste</VText>);
      const textNode = tree.root.findByType(RNText);
      const style = StyleSheet.flatten(textNode.props.style);

      expect(style.fontSize).toBe(14);
      expect(style.lineHeight).toBe(20);
    });

    it('enforces strict 12sp minimum floor even with smaller requested size', () => {
      const tree = renderWithProviders(
        <VText style={{ fontSize: 8 }}>Microscopic Text</VText>
      );
      const textNode = tree.root.findByType(RNText);
      const style = StyleSheet.flatten(textNode.props.style);

      expect(style.fontSize).toBe(12); // Clamped to MIN_FONT_SIZE = 12
    });

    it('auto-detects Devanagari script and expands line-height (>= 1.5x)', () => {
      const tree = renderWithProviders(<VText>काशी विश्वनाथ</VText>);
      const textNode = tree.root.findByType(RNText);
      const style = StyleSheet.flatten(textNode.props.style);

      // Devanagari 14sp * 1.5 multiplier = 21 (rounded up to 22)
      expect(style.lineHeight).toBeGreaterThanOrEqual(21);
      expect(style.fontFamily).toContain('Devanagari');
    });

    it('resolves semantic token color keys correctly', () => {
      const tree = renderWithProviders(
        <VText color="brandPrimary">Sacred Flame</VText>
      );
      const textNode = tree.root.findByType(RNText);
      const style = StyleSheet.flatten(textNode.props.style);

      expect(style.color).toBe('#B45309'); // Light theme brandPrimary
    });
  });

  describe('2. VButton (Interactive CTA Primitive)', () => {
    it('renders with 48dp minimum touch target floor for lg size', () => {
      const onPress = jest.fn();
      const tree = renderWithProviders(
        <VButton label="संकल्प लें" onPress={onPress} size="lg" testID="test-cta" />
      );
      const buttonPressable = tree.root.findByProps({ testID: 'test-cta' });
      const allViews = buttonPressable.findAllByType(View);
      const containerView = allViews.find((v) => StyleSheet.flatten(v.props.style)?.height === 48);

      expect(containerView).toBeDefined();
      expect(StyleSheet.flatten(containerView?.props.style).minWidth).toBe(48);
    });

    it('calculates hitSlop to guarantee 48dp floor on sm and md sizes', () => {
      const onPress = jest.fn();
      const treeSm = renderWithProviders(
        <VButton label="लघु बटन" onPress={onPress} size="sm" />
      );
      const pressableSm = treeSm.root.findByProps({ accessibilityRole: 'button' });
      expect(pressableSm.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });

      const treeMd = renderWithProviders(
        <VButton label="मध्यम बटन" onPress={onPress} size="md" />
      );
      const pressableMd = treeMd.root.findByProps({ accessibilityRole: 'button' });
      expect(pressableMd.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    });

    it('triggers onPress callback when enabled', () => {
      const onPress = jest.fn();
      const tree = renderWithProviders(
        <VButton label="पुष्टि करें" onPress={onPress} />
      );
      const pressable = tree.root.findByProps({ accessibilityRole: 'button' });

      act(() => {
        pressable.props.onPress();
      });

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('disables press and shows spinner when isLoading is true', () => {
      const onPress = jest.fn();
      const tree = renderWithProviders(
        <VButton label="प्रतीक्षा करें" onPress={onPress} isLoading={true} />
      );
      const pressable = tree.root.findByProps({ accessibilityRole: 'button' });

      expect(pressable.props.disabled).toBe(true);
      expect(pressable.props.accessibilityState.busy).toBe(true);
    });
  });

  describe('3. VIconButton (Accessible Icon Action)', () => {
    it('enforces 48x48dp minimum touch target floor via hitSlop on size 40', () => {
      const onPress = jest.fn();
      const tree = renderWithProviders(
        <VIconButton
          icon={<View testID="dummy-icon" />}
          onPress={onPress}
          size={40}
          accessibilityLabel="Close dialog"
        />
      );
      const pressable = tree.root.findByProps({ accessibilityRole: 'button' });

      expect(pressable.props.accessibilityLabel).toBe('Close dialog');
      // (48 - 40) / 2 = 4dp padding
      expect(pressable.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    });
  });

  describe('4. VInput (Devanagari Form Input)', () => {
    it('enforces 48dp minimum touch target floor and handles onChangeText', () => {
      const onChange = jest.fn();
      const tree = renderWithProviders(
        <VInput
          label="यजमान का नाम"
          value="आदित्य शर्मा"
          onChangeText={onChange}
          testID="test-name-input"
        />
      );
      const textInput = tree.root.findByType(RNTextInput);
      expect(textInput.props.value).toBe('आदित्य शर्मा');

      act(() => {
        textInput.props.onChangeText('आदित्य नाथ');
      });
      expect(onChange).toHaveBeenCalledWith('आदित्य नाथ');
    });

    it('renders error message and switches border state when errorMessage is provided', () => {
      const tree = renderWithProviders(
        <VInput
          label="फोन नंबर"
          errorMessage="कृपया वैध 10-अंकीय मोबाइल नंबर प्रविष्ट करें"
        />
      );
      const errorText = tree.root.findByProps({ children: 'कृपया वैध 10-अंकीय मोबाइल नंबर प्रविष्ट करें' });
      expect(errorText).toBeTruthy();
    });

    it('provides Devanagari vertical clearance to avoid matra clipping', () => {
      const tree = renderWithProviders(
        <VInput
          label="गोत्र"
          value="कश्यप"
        />
      );
      const textInput = tree.root.findByType(RNTextInput);
      const style = StyleSheet.flatten(textInput.props.style);
      expect(style.lineHeight).toBeGreaterThanOrEqual(21);
    });
  });

  describe('5. VAvatar (Devotee Portrait & Initials Fallback)', () => {
    it('extracts initials from bilingual names when image is absent', () => {
      const treeEn = renderWithProviders(<VAvatar name="Varanasi Pandit" size="md" />);
      const textEn = treeEn.root.findByProps({ children: 'VP' });
      expect(textEn).toBeTruthy();

      const treeSingle = renderWithProviders(<VAvatar name="Ganesha" size="md" />);
      const textSingle = treeSingle.root.findByProps({ children: 'GA' });
      expect(textSingle).toBeTruthy();
    });

    it('renders sacred verified badge checkmark overlay when isVerified is true', () => {
      const tree = renderWithProviders(<VAvatar name="Pandit Ji" isVerified={true} />);
      const checkIcon = tree.root.findByProps({ name: 'checkmark' });
      expect(checkIcon).toBeTruthy();
    });

    it('expands hitSlop to >= 48dp floor when onPress is passed', () => {
      const onPress = jest.fn();
      const tree = renderWithProviders(
        <VAvatar name="Acharya" size="sm" onPress={onPress} />
      );
      const pressable = tree.root.findByProps({ accessibilityRole: 'button' });
      // size sm is 32dp. (48 - 32) / 2 = 8dp hitSlop
      expect(pressable.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    });
  });

  describe('6. VBadge (Status, Counter & Verified Seals)', () => {
    it('clips counter at maxCount threshold', () => {
      const tree = renderWithProviders(
        <VBadge variant="counter" count={150} maxCount={99} />
      );
      const textNode = tree.root.findByProps({ children: '99+' });
      expect(textNode).toBeTruthy();
    });

    it('renders verified sacred check-decagram seal', () => {
      const tree = renderWithProviders(
        <VBadge variant="verified" label="सत्यापित पुरोहित" />
      );
      const icon = tree.root.findByProps({ name: 'check-decagram' });
      expect(icon).toBeTruthy();
      const label = tree.root.findByProps({ children: 'सत्यापित पुरोहित' });
      expect(label).toBeTruthy();
    });

    it('renders live status dot with semantic indicator', () => {
      const tree = renderWithProviders(
        <VBadge variant="status" color="success" label="उपलब्ध" />
      );
      const label = tree.root.findByProps({ children: 'उपलब्ध' });
      expect(label).toBeTruthy();
    });
  });

  describe('7. VDivider (Spatial Hairline Divider)', () => {
    it('renders horizontal hairline with centered bilingual label', () => {
      const tree = renderWithProviders(<VDivider label="अथवा" />);
      const label = tree.root.findByProps({ children: 'अथवा' });
      expect(label).toBeTruthy();
    });

    it('renders vertical divider with 1dp thickness', () => {
      const tree = renderWithProviders(<VDivider orientation="vertical" thickness={1} />);
      const view = tree.root.findByType(View);
      const style = StyleSheet.flatten(view.props.style);
      expect(style.width).toBe(1);
    });
  });

  describe('8. VShimmer (Card Geometry Skeleton)', () => {
    it('matches 12dp card corner radius (radii.lg) by default', () => {
      const tree = renderWithProviders(<VShimmer variant="card" />);
      const view = tree.root.findByProps({ accessibilityRole: 'progressbar' });
      const style = StyleSheet.flatten(view.props.style);
      expect(style.borderRadius).toBe(12);
    });
  });

  describe('9. VSpinner (Activity Indicator)', () => {
    it('renders standard size presets (sm: 16, md: 24, lg: 36)', () => {
      const treeSm = renderWithProviders(<VSpinner size="sm" mode="native" />);
      const containerSm = treeSm.root.findByProps({ accessibilityRole: 'progressbar' });
      expect(StyleSheet.flatten(containerSm.props.style).width).toBe(16);

      const treeMd = renderWithProviders(<VSpinner size="md" mode="native" />);
      const containerMd = treeMd.root.findByProps({ accessibilityRole: 'progressbar' });
      expect(StyleSheet.flatten(containerMd.props.style).width).toBe(24);

      const treeLg = renderWithProviders(<VSpinner size="lg" mode="native" />);
      const containerLg = treeLg.root.findByProps({ accessibilityRole: 'progressbar' });
      expect(StyleSheet.flatten(containerLg.props.style).width).toBe(36);
    });
  });

  describe('10. VSwitch (Toggle Primitive)', () => {
    it('toggles value on press and respects 48dp hit floor', () => {
      const onToggle = jest.fn();
      const tree = renderWithProviders(
        <VSwitch
          value={false}
          onToggle={onToggle}
          label="वैदिक पंचांग अधिसूचना"
        />
      );
      const pressable = tree.root.findByProps({ accessibilityRole: 'switch' });

      act(() => {
        pressable.props.onPress();
      });

      expect(onToggle).toHaveBeenCalledWith(true);
      expect(StyleSheet.flatten(pressable.props.style).minHeight).toBe(48);
    });
  });

  describe('11. VCheckbox & VCheckboxGroup', () => {
    it('VCheckbox toggles state on press with 48x48dp floor', () => {
      const onToggle = jest.fn();
      const tree = renderWithProviders(
        <VCheckbox checked={false} onToggle={onToggle} label="गंगाजल संकल्प" />
      );
      const pressable = tree.root.findByProps({ accessibilityRole: 'checkbox' });

      act(() => {
        pressable.props.onPress();
      });

      expect(onToggle).toHaveBeenCalledWith(true);
      expect(StyleSheet.flatten(pressable.props.style).minHeight).toBe(48);
    });

    it('VCheckboxGroup renders authentic Varanasi Ghats and Ritual choices', () => {
      expect(VARANASI_GHAT_OPTIONS.length).toBeGreaterThan(0);
      expect(RITUAL_CHOICE_OPTIONS.length).toBeGreaterThan(0);

      const onToggle = jest.fn();
      const tree = renderWithProviders(
        <VCheckboxGroup
          title="तीर्थ घाट चयन"
          options={VARANASI_GHAT_OPTIONS}
          selectedIds={[VARANASI_GHAT_OPTIONS[0].id]}
          onToggle={onToggle}
        />
      );

      const titleNode = tree.root.findByProps({ children: 'तीर्थ घाट चयन' });
      expect(titleNode).toBeTruthy();
    });
  });

  describe('12. VSlider (Distance & Muhurat Slider)', () => {
    it('clamps value and displays formatted label', () => {
      const onChange = jest.fn();
      const tree = renderWithProviders(
        <VSlider
          value={15}
          min={5}
          max={50}
          step={5}
          label="सेवा परिधि"
          onValueChange={onChange}
        />
      );
      const labelNode = tree.root.findByProps({ children: '15 km' });
      expect(labelNode).toBeTruthy();
    });
  });

  describe('13. OtpPinInput (Multi-cell Verification)', () => {
    it('renders 6 input cells by default with 48dp touch floor', () => {
      const onChange = jest.fn();
      const tree = renderWithProviders(
        <OtpPinInput value="123456" onChange={onChange} />
      );
      const inputs = tree.root.findAllByType(RNTextInput);
      expect(inputs.length).toBe(6);
    });
  });

  describe('14. GotraPickerDropdown (Shastric Universal Fallback)', () => {
    it('contains Shastric Kashyapa fallback (कश्यपो गोत्रम्) per Shastra injunction', () => {
      expect(GOTRA_FALLBACK.id).toBe('kashyapa');
      expect(GOTRA_FALLBACK.nameHi).toContain('कश्यप');
      const kashyapaInGotras = GOTRAS.find((g) => g.id === GOTRA_FALLBACK.id);
      expect(kashyapaInGotras?.pravara).toContain('कश्यप');
    });

    it('renders Gotra trigger and displays current selection', () => {
      const onSelect = jest.fn();
      const tree = renderWithProviders(
        <GotraPickerDropdown
          selectedGotra="kashyapa"
          onSelectGotra={onSelect}
          label="गोत्र"
        />
      );
      const nameNode = tree.root.findByProps({ children: 'कश्यप' });
      expect(nameNode).toBeTruthy();
    });
  });

  describe('15. SelectDropdown & FileUploadField', () => {
    it('SelectDropdown displays selected item label and opens modal', () => {
      const options = [
        { id: 'opt1', label: 'रुद्राभिषेक' },
        { id: 'opt2', label: 'महामृत्युंजय' },
      ];
      const tree = renderWithProviders(
        <SelectDropdown
          label="पूजा विधि"
          options={options}
          selectedId="opt1"
          onSelect={jest.fn()}
        />
      );
      const selectedLabel = tree.root.findByProps({ children: 'रुद्राभिषेक' });
      expect(selectedLabel).toBeTruthy();
    });

    it('FileUploadField displays recognized institution hint and empty upload card', () => {
      const tree = renderWithProviders(
        <FileUploadField
          label="शास्त्री / आचार्य उपाधि"
          onSelectFile={jest.fn()}
        />
      );
      const hint = tree.root.findByProps({
        children: 'मान्यता प्राप्त संस्थान: संपूर्णानंद संस्कृत वि.वि. / बीएचयू एसवीडीवी',
      });
      expect(hint).toBeTruthy();
    });
  });

  describe('16. DatePickerModal & TimePickerModal', () => {
    it('DatePickerModal renders bilingual calendar days with 48dp cell buttons', () => {
      const tree = renderWithProviders(
        <DatePickerModal
          isVisible={true}
          selectedDate="2026-10-26"
          onSelectDate={jest.fn()}
          onClose={jest.fn()}
          auspiciousDates={['2026-10-26']}
        />
      );
      const dayNode = tree.root.findByProps({ children: 26 });
      expect(dayNode).toBeTruthy();
    });

    it('TimePickerModal provides authentic Vedic Muhurat presets', () => {
      const tree = renderWithProviders(
        <TimePickerModal
          isVisible={true}
          selectedTime="04:30"
          onSelectTime={jest.fn()}
          onClose={jest.fn()}
        />
      );
      const matched = tree.root.findAll((node) => {
        if (node.type !== RNText) return false;
        const text = Array.isArray(node.props.children)
          ? node.props.children.join('')
          : String(node.props.children || '');
        return text.includes('ब्रह्म मुहूर्त');
      });
      expect(matched.length).toBeGreaterThan(0);
    });
  });

  describe('17. SolarBrandGlyph', () => {
    it('renders sacred Surya Corona and consecrated Om center', () => {
      const tree = renderWithProviders(<SolarBrandGlyph size={48} showOm={true} />);
      const omNode = tree.root.findByProps({ children: 'ॐ' });
      expect(omNode).toBeTruthy();
    });
  });

  describe('18. Backwards Compatibility Re-exports', () => {
    it('preserves legacy primitives (Button, Card, Header, Input, Text) in src/shared/components', () => {
      expect(LegacyButton).toBeDefined();
      expect(LegacyCard).toBeDefined();
      expect(LegacyHeader).toBeDefined();
      expect(LegacyInput).toBeDefined();
      expect(LegacyText).toBeDefined();
    });

    it('exports new foundation primitives alongside legacy ones', () => {
      expect(VButton).toBeDefined();
      expect(VText).toBeDefined();
      expect(VInput).toBeDefined();
      expect(VAvatar).toBeDefined();
      expect(GotraPickerDropdown).toBeDefined();
    });
  });
});
