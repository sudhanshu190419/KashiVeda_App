/**
 * Kashi Veda — Authentic Vedic Domain Constants
 *
 * ZERO MOCK DATA POLICY: Every string, name, and term in this file
 * is authentic Vedic terminology sourced from Shastra and real
 * Kashi academic institutions. No placeholder content.
 */

/** Vedic Gotra list — Used in GotraPickerDropdown */
export const GOTRAS = [
  { id: 'kashyapa', nameEn: 'Kashyapa', nameHi: 'कश्यप', pravara: 'कश्यप, आवत्सार, नैध्रुव' },
  { id: 'bharadvaja', nameEn: 'Bharadvaja', nameHi: 'भारद्वाज', pravara: 'भारद्वाज, बार्हस्पत्य, अंगिरस' },
  { id: 'vasishtha', nameEn: 'Vasishtha', nameHi: 'वशिष्ठ', pravara: 'वशिष्ठ, ऐन्द्रप्रमद, आभरद्वसव' },
  { id: 'gautama', nameEn: 'Gautama', nameHi: 'गौतम', pravara: 'अंगिरस, आयस्य, गौतम' },
  { id: 'shandilya', nameEn: 'Shandilya', nameHi: 'शांडिल्य', pravara: 'शांडिल्य, आसित, दैवल' },
  { id: 'atri', nameEn: 'Atri', nameHi: 'अत्रि', pravara: 'आत्रेय, आर्चनानस, श्यावाश्व' },
  { id: 'jamadagni', nameEn: 'Jamadagni', nameHi: 'जमदग्नि', pravara: 'भार्गव, च्यावन, आप्नवान' },
  { id: 'vishvamitra', nameEn: 'Vishvamitra', nameHi: 'विश्वामित्र', pravara: 'वैश्वामित्र, देवरात, औदल' },
  { id: 'agastya', nameEn: 'Agastya', nameHi: 'अगस्त्य', pravara: 'अगस्त्य, दार्ढच्युत, ऐध्मवाह' },
  { id: 'angirasa', nameEn: 'Angirasa', nameHi: 'अंगिरस', pravara: 'आंगिरस, बार्हस्पत्य, भारद्वाज' },
  { id: 'mudgala', nameEn: 'Mudgala', nameHi: 'मुद्गल', pravara: 'आंगिरस, भार्म्यश्व, मौद्गल्य' },
  { id: 'parashara', nameEn: 'Parashara', nameHi: 'पराशर', pravara: 'वासिष्ठ, शाक्त्य, पाराशर्य' },
  { id: 'kaushika', nameEn: 'Kaushika', nameHi: 'कौशिक', pravara: 'वैश्वामित्र, देवरात, औदल' },
  { id: 'sandilya', nameEn: 'Sandilya', nameHi: 'सांडिल्य', pravara: 'काश्यप, आवत्सार, शांडिल्य' },
  { id: 'katyayana', nameEn: 'Katyayana', nameHi: 'कात्यायन', pravara: 'वैश्वामित्र, देवरात, कात्य' },
] as const;

/**
 * Universal Gotra fallback — per COMPONENT_LIBRARY.md
 * Kashyapa Gotra is the Shastra-prescribed fallback
 * when a devotee does not know their lineage.
 */
export const GOTRA_FALLBACK = {
  id: 'kashyapa',
  nameEn: 'Kashyapa (Shastra-prescribed default for unknown lineage)',
  nameHi: 'कश्यप (अज्ञात गोत्र हेतु शास्त्रीय विधान)',
} as const;

/** Puja / Ritual categories */
export const PUJA_CATEGORIES = [
  { id: 'grah_shanti', nameEn: 'Grah Shanti', nameHi: 'ग्रह शांति', icon: 'planet' },
  { id: 'vivah', nameEn: 'Vivah Sanskar', nameHi: 'विवाह संस्कार', icon: 'rings' },
  { id: 'namkaran', nameEn: 'Namkaran', nameHi: 'नामकरण', icon: 'baby' },
  { id: 'satyanarayan', nameEn: 'Satyanarayan Katha', nameHi: 'सत्यनारायण कथा', icon: 'book' },
  { id: 'rudrabhishek', nameEn: 'Rudrabhishek', nameHi: 'रुद्राभिषेक', icon: 'trishul' },
  { id: 'mahamrityunjay', nameEn: 'Mahamrityunjay Anushthaan', nameHi: 'महामृत्युंजय अनुष्ठान', icon: 'shield' },
  { id: 'griha_pravesh', nameEn: 'Griha Pravesh', nameHi: 'गृह प्रवेश', icon: 'home' },
  { id: 'mundan', nameEn: 'Mundan Sanskar', nameHi: 'मुंडन संस्कार', icon: 'scissors' },
  { id: 'havan', nameEn: 'Havan / Yagya', nameHi: 'हवन / यज्ञ', icon: 'flame' },
  { id: 'pind_daan', nameEn: 'Pind Daan', nameHi: 'पिंड दान', icon: 'offering' },
  { id: 'shraddh', nameEn: 'Shraddh Karma', nameHi: 'श्राद्ध कर्म', icon: 'lotus' },
  { id: 'vastu_puja', nameEn: 'Vastu Shanti Puja', nameHi: 'वास्तु शांति पूजा', icon: 'compass' },
] as const;

/** Booking mode options */
export const BOOKING_MODES = [
  { id: 'remote', nameEn: 'Remote (Live Video)', nameHi: 'रिमोट (लाइव वीडियो)', icon: 'video' },
  { id: 'temple', nameEn: 'Temple Visit', nameHi: 'मंदिर दर्शन', icon: 'shrine' },
  { id: 'home', nameEn: 'Home Visit', nameHi: 'गृह भ्रमण', icon: 'home' },
] as const;

/**
 * BookingStatus — Macro Escrow states
 * Decoupled from FulfillmentStage (day-of-puja stages).
 * Per MASTER_SRS.md and post-audit architecture decision.
 */
export const BOOKING_STATUSES = [
  'requested',
  'approved',
  'payment_pending',
  'confirmed',
  'rescheduled',
  'cancelled',
  'in_progress',
  'completed',
  'disputed',
  'resolved',
  'expired',
  'declined',
] as const;

export type BookingStatus = typeof BOOKING_STATUSES[number];

/**
 * FulfillmentStage — Day-of-puja in-transit stages
 * These are sub-states within BookingStatus 'in_progress'.
 */
export const FULFILLMENT_STAGES = [
  'samagri_dispatched',
  'pandit_en_route',
  'ritual_started',
  'purnahuti',        // Ritual completion marker — triggers escrow release
] as const;

export type FulfillmentStage = typeof FULFILLMENT_STAGES[number];

/** Panchang metric labels */
export const PANCHANG_LABELS = {
  tithi: { en: 'Tithi', hi: 'तिथि' },
  nakshatra: { en: 'Nakshatra', hi: 'नक्षत्र' },
  yoga: { en: 'Yoga', hi: 'योग' },
  karana: { en: 'Karana', hi: 'करण' },
  sunrise: { en: 'Sunrise', hi: 'सूर्योदय' },
  sunset: { en: 'Sunset', hi: 'सूर्यास्त' },
  rahukaal: { en: 'Rahukaal', hi: 'राहुकाल' },
  abhijeet: { en: 'Abhijeet Muhurat', hi: 'अभिजीत मुहूर्त' },
} as const;

/** Academic credential institutions — real Kashi institutions only */
export const CREDENTIAL_INSTITUTIONS = [
  { id: 'ssu', nameEn: 'Sampurnanand Sanskrit Vishwavidyalaya', nameHi: 'संपूर्णानंद संस्कृत विश्वविद्यालय' },
  { id: 'bhu_svdv', nameEn: 'BHU SVDV (Shri Vishwanath Dhaam Vidyapeetham)', nameHi: 'बीएचयू एसवीडीवी' },
  { id: 'rashtriya_sanskrit', nameEn: 'Rashtriya Sanskrit Sansthan', nameHi: 'राष्ट्रीय संस्कृत संस्थान' },
  { id: 'other', nameEn: 'Other Recognized Institution', nameHi: 'अन्य मान्यता प्राप्त संस्थान' },
] as const;

/** Pandit onboarding step labels — bilingual, consumed by StepProgress */
export const ONBOARDING_STEPS = [
  { title: 'Basics', titleHi: 'मूलभूत विवरण' },
  { title: 'Rituals', titleHi: 'अनुष्ठान' },
  { title: 'Astrology', titleHi: 'ज्योतिष' },
  { title: 'Credentials', titleHi: 'प्रमाण-पत्र' },
  { title: 'Verification', titleHi: 'सत्यापन' },
] as const;

/** Pandit availability states */
export const AVAILABILITY_STATES = {
  available: { en: 'Available Today', hi: 'आज उपलब्ध', color: 'statusActive' },
  busy: { en: 'Busy', hi: 'व्यस्त', color: 'warning' },
  offline: { en: 'Offline', hi: 'ऑफलाइन', color: 'statusAlert' },
} as const;

/** Empty state messages — bilingual, honest, no mock data */
export const EMPTY_STATE_MESSAGES = {
  noBookings: { en: 'No upcoming pujas found', hi: 'कोई आगामी पूजा नहीं मिली' },
  noPandits: { en: 'No Pandit Ji available in your area', hi: 'आपके क्षेत्र में कोई पंडित जी उपलब्ध नहीं' },
  noReviews: { en: 'No reviews yet', hi: 'अभी तक कोई समीक्षा नहीं' },
  noKundlis: { en: 'No saved Kundlis', hi: 'कोई सहेजी गई कुंडली नहीं' },
  noEarnings: { en: 'No earnings recorded yet', hi: 'अभी तक कोई आय दर्ज नहीं' },
  noNotifications: { en: 'No new notifications', hi: 'कोई नई सूचना नहीं' },
  noFamilyProfiles: { en: 'No family profiles added', hi: 'कोई पारिवारिक प्रोफ़ाइल नहीं जोड़ी गई' },
  noSavedAddresses: { en: 'No saved addresses', hi: 'कोई सहेजा गया पता नहीं' },
} as const;

/** Error state messages — honest failure copy */
export const ERROR_STATE_MESSAGES = {
  networkError: { en: 'Could not connect to server', hi: 'सर्वर से कनेक्ट नहीं हो सका' },
  loadFailed: { en: 'Could not load data', hi: 'डेटा लोड नहीं हो सका' },
  paymentFailed: { en: 'Payment could not be processed', hi: 'भुगतान प्रोसेस नहीं हो सका' },
  retry: { en: 'Tap to retry', hi: 'पुनः प्रयास करें' },
} as const;

/** Dakshina (tip) amounts in INR — real economics */
export const DAKSHINA_AMOUNTS = [101, 251, 501, 1001, 2100] as const;

/** Cancellation policy thresholds */
export const CANCELLATION_POLICY = {
  fullRefundWindowHours: 24,
  samagriDeductionPercent: 100,  // Full samagri cost deducted if <24h
  platformFeePercent: 10,       // Additional 10% of total if <24h with no samagri
  panditCancellationRefund: 100, // 100% refund if Pandit cancels
} as const;

/** Escrow model */
export const ESCROW_CONFIG = {
  advancePercent: 50,  // 50% advance held in escrow
  releaseEvent: 'purnahuti' as const,  // Released to Pandit after ritual completion
} as const;

/** Authentic Varanasi Ghats — Sacred riverfronts along the Ganga */
export const VARANASI_GHATS = [
  { id: 'assi', nameEn: 'Assi Ghat', nameHi: 'अस्सी घाट', significanceEn: 'Southern confluence of Assi and Ganga', significanceHi: 'अस्सी और गंगा का पावन संगम' },
  { id: 'dashashwamedh', nameEn: 'Dashashwamedh Ghat', nameHi: 'दशाश्वमेध घाट', significanceEn: 'Main Ganga Aarti & Ten-horse sacrifice site', significanceHi: 'भव्य गंगा आरती एवं दशाश्वमेध यज्ञ स्थल' },
  { id: 'manikarnika', nameEn: 'Manikarnika Ghat', nameHi: 'मणिकर्णिका घाट', significanceEn: 'Maha Smashana & Moksha Tirtha', significanceHi: 'महाश्मशान एवं मोक्ष तीर्थ' },
  { id: 'panchganga', nameEn: 'Panchganga Ghat', nameHi: 'पंचगंगा घाट', significanceEn: 'Confluence of five sacred rivers', significanceHi: 'पाँच पवित्र नदियों का संगम' },
  { id: 'harishchandra', nameEn: 'Harishchandra Ghat', nameHi: 'हरिश्चंद्र घाट', significanceEn: 'Ancient Satya Harishchandra cremation ghat', significanceHi: 'सत्यवादी राजा हरिश्चंद्र पावन घाट' },
  { id: 'kedar', nameEn: 'Kedar Ghat', nameHi: 'केदार घाट', significanceEn: 'Kedareshwar temple shrine', significanceHi: 'श्री केदारेश्वर महादेव मंदिर' },
  { id: 'tulsi', nameEn: 'Tulsi Ghat', nameHi: 'तुलसी घाट', significanceEn: 'Goswami Tulsidas Ramcharitmanas composition site', significanceHi: 'गोस्वामी तुलसीदास रचित रामचरितमानस स्थल' },
] as const;

/** Authentic Ritual choices for devotee and pandit preferences */
export const RITUAL_CHOICES = [
  { id: 'sankalp_vastu', nameEn: 'Vedic Sankalp Included', nameHi: 'वैदिक संकल्प सम्मिलित' },
  { id: 'havan_samagri', nameEn: 'Shuddha Havan Samagri Provided', nameHi: 'शुद्ध हवन सामग्री सहित' },
  { id: 'ganga_jal', nameEn: 'Authentic Gangajal Kalash', nameHi: 'प्रामाणिक गंगाजल कलश' },
  { id: 'brahman_bhojan', nameEn: 'Brahman Bhojan Arrangement', nameHi: 'ब्राह्मण भोजन व्यवस्था' },
  { id: 'panchamrit', nameEn: 'Panchamrit & Desi Ghee', nameHi: 'पंचामृत एवं शुद्ध देशी घी' },
] as const;

/** Service radius presets in kilometers */
export const SERVICE_RADIUS_CONFIG = {
  min: 5,
  max: 50,
  step: 5,
  defaultKm: 15,
} as const;

/** Authentic Vedic Samagri Items with sacred measurements */
export const AUTHENTIC_VEDIC_SAMAGRI = [
  {
    id: 'gangajal',
    nameEn: 'Kashi Gangajal Kalash',
    nameHi: 'पवित्र काशी गंगाजल कलश',
    nameEnglish: 'Kashi Gangajal Kalash',
    nameHindi: 'पवित्र काशी गंगाजल कलश',
    quantity: '500 ml',
    unitEn: 'brass can',
    unitHi: 'पीतल पात्र',
    priceInr: 90,
    price: 90,
    isIncluded: true,
    isClientArranging: false,
  },
  {
    id: 'roli_kumkum',
    nameEn: 'Vedic Roli & Kumkum',
    nameHi: 'शुद्ध वैदिक रोली एवं कुमकुम',
    nameEnglish: 'Vedic Roli & Kumkum',
    nameHindi: 'शुद्ध वैदिक रोली एवं कुमकुम',
    quantity: '250 g',
    unitEn: 'packet',
    unitHi: 'पैकेट',
    priceInr: 60,
    price: 60,
    isIncluded: true,
    isClientArranging: false,
  },
  {
    id: 'akshat',
    nameEn: 'Shuddha Akshat (Unbroken Rice)',
    nameHi: 'शुद्ध अखंड अक्षत (बासमती चावल)',
    nameEnglish: 'Shuddha Akshat (Unbroken Rice)',
    nameHindi: 'शुद्ध अखंड अक्षत (बासमती चावल)',
    quantity: '500 g',
    unitEn: 'packet',
    unitHi: 'पैकेट',
    priceInr: 75,
    price: 75,
    isIncluded: true,
    isClientArranging: false,
  },
  {
    id: 'belpatra',
    nameEn: 'Fresh Bilva Patra (Belpatra)',
    nameHi: 'पवित्र त्रिशूल बेलपत्र',
    nameEnglish: 'Fresh Bilva Patra (Belpatra)',
    nameHindi: 'पवित्र त्रिशूल बेलपत्र',
    quantity: '108 pcs',
    unitEn: 'bundle',
    unitHi: 'दण्ड (108 पत्र)',
    priceInr: 108,
    price: 108,
    isIncluded: true,
    isClientArranging: false,
  },
  {
    id: 'peet_vastra',
    nameEn: 'Consecrated Peet Vastra (Yellow Silk)',
    nameHi: 'संस्कारित पीत वस्त्र',
    nameEnglish: 'Consecrated Peet Vastra (Yellow Silk)',
    nameHindi: 'संस्कारित पीत वस्त्र',
    quantity: '2 sets',
    unitEn: 'pair',
    unitHi: 'जोड़ी',
    priceInr: 240,
    price: 240,
    isIncluded: true,
    isClientArranging: false,
  },
  {
    id: 'desi_ghee',
    nameEn: 'Pure Desi Cow Ghee for Havan',
    nameHi: 'देशी गाय का शुद्ध घृत',
    nameEnglish: 'Pure Desi Cow Ghee for Havan',
    nameHindi: 'देशी गाय का शुद्ध घृत',
    quantity: '1 kg',
    unitEn: 'jar',
    unitHi: 'पात्र',
    priceInr: 650,
    price: 650,
    isIncluded: true,
    isClientArranging: false,
  },
  {
    id: 'dhoop_samidha',
    nameEn: 'Vedic Samidha & Sugandhit Dhoop',
    nameHi: 'वैदिक समिधा एवं सुगंधित धूप',
    nameEnglish: 'Vedic Samidha & Sugandhit Dhoop',
    nameHindi: 'वैदिक समिधा एवं सुगंधित धूप',
    quantity: '1 bundle',
    unitEn: 'pack',
    unitHi: 'बंडल',
    priceInr: 150,
    price: 150,
    isIncluded: true,
    isClientArranging: false,
  },
] as const;

/**
 * Authentic Cancellation Tiers per MASTER_SRS & System Rules
 * >48 hrs = 100% refund, 24-48 hrs = 50% refund, <24 hrs = 0% refund
 */
export const CANCELLATION_RULES = [
  {
    tier: 'more_than_48h',
    minHours: 48,
    maxHours: undefined,
    refundPercent: 100,
    titleEn: '> 48 Hours Notice',
    titleHi: '48 घंटे से अधिक पूर्व',
    policyEn: '100% full refund of advance escrow deposit',
    policyHi: 'अग्रिम एस्क्रो राशि का 100% पूर्ण रिफंड',
    badgeVariant: 'success' as const,
  },
  {
    tier: 'between_24_and_48h',
    minHours: 24,
    maxHours: 48,
    refundPercent: 50,
    titleEn: '24 - 48 Hours Notice',
    titleHi: '24 से 48 घंटे पूर्व',
    policyEn: '50% refund (Samagri preparation & reservation fee deducted)',
    policyHi: '50% रिफंड (सामग्री व्यवस्था एवं आरक्षण शुल्क कटौती)',
    badgeVariant: 'warning' as const,
  },
  {
    tier: 'less_than_24h',
    minHours: 0,
    maxHours: 24,
    refundPercent: 0,
    titleEn: '< 24 Hours Notice',
    titleHi: '24 घंटे से कम पूर्व',
    policyEn: '0% refund (Materials consecrated & priest time reserved)',
    policyHi: '0% रिफंड (सामग्री संस्कारित एवं पुरोहित समय आरक्षित)',
    badgeVariant: 'destructive' as const,
  },
] as const;

/** Dakshina tiers in INR per Shastric Shagun tradition (₹101, ₹251, ₹501, ₹1008) */
export const DAKSHINA_TIERS = [101, 251, 501, 1008] as const;

/** Standard Reschedule Reasons */
export const RESCHEDULE_REASONS = [
  {
    id: 'family_emergency',
    label: 'Family Emergency',
    labelHi: 'पारिवारिक अपरिहार्यता',
    labelEn: 'Family Emergency',
  },
  {
    id: 'health_issue',
    label: 'Health Reason',
    labelHi: 'स्वास्थ्य संबंधी कारण',
    labelEn: 'Health Reason',
  },
  {
    id: 'tithi_muhurat_change',
    label: 'Astrological / Tithi Muhurat Adjustment',
    labelHi: 'नवीन शुभ मुहूर्त विचार',
    labelEn: 'Astrological / Tithi Muhurat Adjustment',
  },
  {
    id: 'travel_delay',
    label: 'Travel Delay to Varanasi',
    labelHi: 'काशी आगमन में विलंब',
    labelEn: 'Travel Delay to Varanasi',
  },
  {
    id: 'weather_hindrance',
    label: 'Adverse Weather',
    labelHi: 'प्रतिकूल मौसम',
    labelEn: 'Adverse Weather',
  },
  {
    id: 'other',
    label: 'Other Personal Reason',
    labelHi: 'अन्य कारण',
    labelEn: 'Other Personal Reason',
  },
] as const;

/** Standard Cancellation Reasons */
export const CANCELLATION_REASONS = [
  {
    id: 'family_unavoidable',
    label: 'Unavoidable Family Emergency',
    labelHi: 'पारिवारिक अपरिहार्यता',
    labelEn: 'Unavoidable Family Emergency',
  },
  {
    id: 'health_emergency',
    label: 'Medical Emergency',
    labelHi: 'आकस्मिक स्वास्थ्य समस्या',
    labelEn: 'Medical Emergency',
  },
  {
    id: 'travel_cancelled',
    label: 'Varanasi Travel Cancelled',
    labelHi: 'यात्रा निरस्त',
    labelEn: 'Varanasi Travel Cancelled',
  },
  {
    id: 'date_conflict',
    label: 'Unresolvable Schedule Conflict',
    labelHi: 'समय अथवा तिथि टकराव',
    labelEn: 'Unresolvable Schedule Conflict',
  },
  {
    id: 'other',
    label: 'Other Reason',
    labelHi: 'अन्य व्यक्तिगत कारण',
    labelEn: 'Other Reason',
  },
] as const;

/** Standard Dispute Categories */
export const DISPUTE_CATEGORIES = [
  {
    id: 'priest_no_show',
    label: 'Priest No-Show',
    labelHi: 'पुरोहित जी उपस्थित नहीं हुए',
    labelEn: 'Priest No-Show',
  },
  {
    id: 'incomplete_ritual',
    label: 'Incomplete Ritual',
    labelHi: 'अनुष्ठान अधूरा छोड़ दिया गया',
    labelEn: 'Incomplete Ritual',
  },
  {
    id: 'samagri_issue',
    label: 'Samagri Defect or Shortage',
    labelHi: 'सामग्री अपूर्ण अथवा अशुद्ध',
    labelEn: 'Samagri Defect or Shortage',
  },
  {
    id: 'unauthorized_substitute',
    label: 'Unauthorized Substitute Priest',
    labelHi: 'अनधिकृत प्रतिनिधि पुरोहित',
    labelEn: 'Unauthorized Substitute Priest',
  },
  {
    id: 'severe_delay',
    label: 'Severe Delay (> 2 Hours)',
    labelHi: 'गंभीर विलंब (2 घंटे से अधिक)',
    labelEn: 'Severe Delay (> 2 Hours)',
  },
  {
    id: 'conduct_issue',
    label: 'Professionalism / Conduct Issue',
    labelHi: 'मर्यादा अथवा आचरण समस्या',
    labelEn: 'Professionalism / Conduct Issue',
  },
] as const;

/** Feedback tags for scholar ritual evaluation */
export const REVIEW_FEEDBACK_TAGS = [
  { id: 'vidhi', labelEn: 'Vidhi Purity', labelHi: 'शास्त्रोक्त विधि' },
  { id: 'punctuality', labelEn: 'Punctuality', labelHi: 'समयनिष्ठता' },
  { id: 'chanting', labelEn: 'Pure Chanting', labelHi: 'शुद्ध मंत्रोच्चार' },
  { id: 'sincerity', labelEn: 'Spiritual Sincerity', labelHi: 'निष्ठा एवं भाव' },
  { id: 'guidance', labelEn: 'Devotee Guidance', labelHi: 'सुलभ मार्गदर्शन' },
] as const;
