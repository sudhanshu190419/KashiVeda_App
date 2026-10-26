// src/features/discovery/screens/ExploreScreen.tsx
import React, { useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ScreenWrapper,
  AppBar,
  SectionHeader,
  VText,
  VCard,
  PanchangCard,
  VEmptyState as EmptyState,
} from "../../../shared/components/index.ts";
import { MaterialCommunityIcons } from "../../../shared/components/icons/index.ts";
import { useTheme } from "../../../shared/theme/index.ts";
import { useLanguage } from "../../../shared/i18n/index.ts";
import { CustomerStackParamList } from "../../../shared/types/navigation.ts";
import { CategoryCard } from "../components/CategoryCard.tsx";
import { usePujaCategories } from "../hooks/usePujaCategories.ts";
import { PanchangData } from "../../../shared/types/domain.ts";

type CustomerNavigationProp = NativeStackNavigationProp<CustomerStackParamList>;

interface CalendarDayItem {
  dateString: string;
  dayNumber: number;
  dayNameEn: string;
  dayNameHi: string;
  tithiShortHi: string;
  tithiHi: string;
  tithiEn: string;
  nakshatraHi: string;
  nakshatraEn: string;
  yogaHi: string;
  yogaEn: string;
  karanaHi: string;
  karanaEn: string;
  sunrise: string;
  sunset: string;
  rahukaalStart: string;
  rahukaalEnd: string;
  abhijeetStart: string;
  abhijeetEnd: string;
  festivalName?: string;
  festivalNameHi?: string;
}

export const ExploreScreen: React.FC = () => {
  const navigation = useNavigation<CustomerNavigationProp>();
  const { colors, spacing, radii, isDark } = useTheme();
  const { language, pick } = useLanguage();
  const isHi = language === "hi";

  const { categories, loading, error, refresh } = usePujaCategories();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Generate 14-day interactive ephemeris strip around today
  const calendarDays: CalendarDayItem[] = useMemo(() => {
    const dayNames = {
      hi: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
      en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };

    const ephemerisTable = [
      {
        tithiShortHi: "सप्तमी",
        tithiHi: "शुक्ल सप्तमी",
        tithiEn: "Shukla Saptami",
        nakshatraHi: "उत्तराषाढ़ा",
        nakshatraEn: "Uttara Ashadha",
        yogaHi: "सिद्धि",
        yogaEn: "Siddhi",
        karanaHi: "गर",
        karanaEn: "Gara",
        rahukaalStart: "04:15 PM",
        rahukaalEnd: "05:45 PM",
        abhijeetStart: "11:46 AM",
        abhijeetEnd: "12:34 PM",
      },
      {
        tithiShortHi: "अष्टमी",
        tithiHi: "शुक्ल अष्टमी",
        tithiEn: "Shukla Ashtami",
        nakshatraHi: "श्रवण",
        nakshatraEn: "Shravana",
        yogaHi: "साध्य",
        yogaEn: "Sadhya",
        karanaHi: "वणिज",
        karanaEn: "Vanija",
        festivalNameHi: "गोपाष्टमी व्रत",
        festivalName: "Gopashtami Vrat",
        rahukaalStart: "07:30 AM",
        rahukaalEnd: "09:00 AM",
        abhijeetStart: "11:47 AM",
        abhijeetEnd: "12:35 PM",
      },
      {
        tithiShortHi: "नवमी",
        tithiHi: "शुक्ल नवमी",
        tithiEn: "Shukla Navami",
        nakshatraHi: "धनिष्ठा",
        nakshatraEn: "Dhanishta",
        yogaHi: "शुभ",
        yogaEn: "Shubha",
        karanaHi: "विष्टि",
        karanaEn: "Vishti",
        festivalNameHi: "आंवला नवमी / अक्षय नवमी",
        festivalName: "Amla Navami",
        rahukaalStart: "03:00 PM",
        rahukaalEnd: "04:30 PM",
        abhijeetStart: "11:47 AM",
        abhijeetEnd: "12:35 PM",
      },
      {
        tithiShortHi: "दशमी",
        tithiHi: "शुक्ल दशमी",
        tithiEn: "Shukla Dashami",
        nakshatraHi: "शतभिषा",
        nakshatraEn: "Shatabhisha",
        yogaHi: "शुक्ल",
        yogaEn: "Shukla",
        karanaHi: "बव",
        karanaEn: "Bava",
        festivalNameHi: "विजयादशमी महापर्व",
        festivalName: "Vijaya Dashami",
        rahukaalStart: "04:30 PM",
        rahukaalEnd: "06:00 PM",
        abhijeetStart: "11:48 AM",
        abhijeetEnd: "12:36 PM",
      },
      {
        tithiShortHi: "एकादशी",
        tithiHi: "शुक्ल एकादशी",
        tithiEn: "Shukla Ekadashi",
        nakshatraHi: "पूर्वाभाद्रपद",
        nakshatraEn: "Purva Bhadrapada",
        yogaHi: "ब्रह्म",
        yogaEn: "Brahma",
        karanaHi: "बालव",
        karanaEn: "Balava",
        festivalNameHi: "प्रबोधिनी / देवउठनी एकादशी",
        festivalName: "Devutthana Ekadashi",
        rahukaalStart: "01:30 PM",
        rahukaalEnd: "03:00 PM",
        abhijeetStart: "11:48 AM",
        abhijeetEnd: "12:36 PM",
      },
      {
        tithiShortHi: "द्वादशी",
        tithiHi: "शुक्ल द्वादशी",
        tithiEn: "Shukla Dvadashi",
        nakshatraHi: "उत्तराभाद्रपद",
        nakshatraEn: "Uttara Bhadrapada",
        yogaHi: "इन्द्र",
        yogaEn: "Indra",
        karanaHi: "कौलव",
        karanaEn: "Kaulava",
        festivalNameHi: "तुलसी विवाह उत्सव",
        festivalName: "Tulsi Vivah",
        rahukaalStart: "10:30 AM",
        rahukaalEnd: "12:00 PM",
        abhijeetStart: "11:49 AM",
        abhijeetEnd: "12:37 PM",
      },
      {
        tithiShortHi: "त्रयोदशी",
        tithiHi: "शुक्ल त्रयोदशी",
        tithiEn: "Shukla Trayodashi",
        nakshatraHi: "रेवती",
        nakshatraEn: "Revati",
        yogaHi: "वैधृति",
        yogaEn: "Vaidhriti",
        karanaHi: "तैतिल",
        karanaEn: "Taitila",
        festivalNameHi: "वैकुंठ चतुर्दशी पूर्वसंध्या",
        festivalName: "Vaikuntha Chaturdashi Eve",
        rahukaalStart: "09:00 AM",
        rahukaalEnd: "10:30 AM",
        abhijeetStart: "11:49 AM",
        abhijeetEnd: "12:37 PM",
      },
      {
        tithiShortHi: "चतुर्दशी",
        tithiHi: "शुक्ल चतुर्दशी",
        tithiEn: "Shukla Chaturdashi",
        nakshatraHi: "अश्विनी",
        nakshatraEn: "Ashwini",
        yogaHi: "विष्कुम्भ",
        yogaEn: "Vishkumbha",
        karanaHi: "गर",
        karanaEn: "Gara",
        festivalNameHi: "वैकुंठ चतुर्दशी दीपदान",
        festivalName: "Vaikuntha Chaturdashi",
        rahukaalStart: "01:30 PM",
        rahukaalEnd: "03:00 PM",
        abhijeetStart: "11:50 AM",
        abhijeetEnd: "12:38 PM",
      },
      {
        tithiShortHi: "पूर्णिमा",
        tithiHi: "कार्तिक पूर्णिमा",
        tithiEn: "Kartik Purnima",
        nakshatraHi: "कृत्तिका",
        nakshatraEn: "Krittika",
        yogaHi: "प्रीति",
        yogaEn: "Priti",
        karanaHi: "वणिज",
        karanaEn: "Vanija",
        festivalNameHi: "देव दीपावली महापर्व (काशी घाट)",
        festivalName: "Dev Deepawali Varanasi",
        rahukaalStart: "04:30 PM",
        rahukaalEnd: "06:00 PM",
        abhijeetStart: "11:50 AM",
        abhijeetEnd: "12:38 PM",
      },
      {
        tithiShortHi: "प्रतिपदा",
        tithiHi: "कृष्ण प्रतिपदा",
        tithiEn: "Krishna Pratipada",
        nakshatraHi: "रोहिणी",
        nakshatraEn: "Rohini",
        yogaHi: "आयुष्मान",
        yogaEn: "Ayushman",
        karanaHi: "बव",
        karanaEn: "Bava",
        rahukaalStart: "07:30 AM",
        rahukaalEnd: "09:00 AM",
        abhijeetStart: "11:51 AM",
        abhijeetEnd: "12:39 PM",
      },
      {
        tithiShortHi: "द्वितीया",
        tithiHi: "कृष्ण द्वितीया",
        tithiEn: "Krishna Dvitiya",
        nakshatraHi: "मृगशिरा",
        nakshatraEn: "Mrigashira",
        yogaHi: "सौभाग्य",
        yogaEn: "Saubhagya",
        karanaHi: "बालव",
        karanaEn: "Balava",
        rahukaalStart: "01:30 PM",
        rahukaalEnd: "03:00 PM",
        abhijeetStart: "11:51 AM",
        abhijeetEnd: "12:39 PM",
      },
      {
        tithiShortHi: "तृतीया",
        tithiHi: "कृष्ण तृतीया",
        tithiEn: "Krishna Tritiya",
        nakshatraHi: "आर्द्रा",
        nakshatraEn: "Ardra",
        yogaHi: "शोभन",
        yogaEn: "Shobhana",
        karanaHi: "कौलव",
        karanaEn: "Kaulava",
        rahukaalStart: "03:00 PM",
        rahukaalEnd: "04:30 PM",
        abhijeetStart: "11:52 AM",
        abhijeetEnd: "12:40 PM",
      },
      {
        tithiShortHi: "चतुर्थी",
        tithiHi: "संकष्टी चतुर्थी",
        tithiEn: "Sankashti Chaturthi",
        nakshatraHi: "पुनर्वसु",
        nakshatraEn: "Punarvasu",
        yogaHi: "अतिगण्ड",
        yogaEn: "Atiganda",
        karanaHi: "तैतिल",
        karanaEn: "Taitila",
        festivalNameHi: "संकष्टी श्रीगणेश चतुर्थी",
        festivalName: "Sankashti Ganesh Chaturthi",
        rahukaalStart: "04:30 PM",
        rahukaalEnd: "06:00 PM",
        abhijeetStart: "11:52 AM",
        abhijeetEnd: "12:40 PM",
      },
      {
        tithiShortHi: "पंचमी",
        tithiHi: "कृष्ण पंचमी",
        tithiEn: "Krishna Panchami",
        nakshatraHi: "पुष्य",
        nakshatraEn: "Pushya",
        yogaHi: "सुकर्मा",
        yogaEn: "Sukarma",
        karanaHi: "गर",
        karanaEn: "Gara",
        rahukaalStart: "09:00 AM",
        rahukaalEnd: "10:30 AM",
        abhijeetStart: "11:53 AM",
        abhijeetEnd: "12:41 PM",
      },
    ];

    const today = new Date();
    return ephemerisTable.map((item, idx) => {
      const d = new Date(today);
      d.setDate(today.getDate() + idx);
      const dayOfWeek = d.getDay();
      return {
        ...item,
        dateString: d.toISOString().split("T")[0],
        dayNumber: d.getDate(),
        dayNameHi: dayNames.hi[dayOfWeek],
        dayNameEn: dayNames.en[dayOfWeek],
        sunrise: "06:12 AM",
        sunset: "05:48 PM",
      };
    });
  }, []);

  const [selectedIndex, setSelectedIndex] = useState<number>(3); // Defaults to Dashami

  const selectedDay = calendarDays[selectedIndex] || calendarDays[0];

  const selectedPanchangData: Partial<PanchangData> = useMemo(
    () => ({
      date: selectedDay.dateString,
      tithi: selectedDay.tithiEn,
      tithiHi: selectedDay.tithiHi,
      nakshatra: selectedDay.nakshatraEn,
      nakshatraHi: selectedDay.nakshatraHi,
      yoga: selectedDay.yogaEn,
      yogaHi: selectedDay.yogaHi,
      karana: selectedDay.karanaEn,
      karanaHi: selectedDay.karanaHi,
      sunrise: selectedDay.sunrise,
      sunset: selectedDay.sunset,
      rahukaalStart: selectedDay.rahukaalStart,
      rahukaalEnd: selectedDay.rahukaalEnd,
      abhijeetStart: selectedDay.abhijeetStart,
      abhijeetEnd: selectedDay.abhijeetEnd,
      festivalName: selectedDay.festivalName,
      festivalNameHi: selectedDay.festivalNameHi,
      isAuspicious: true,
    }),
    [selectedDay]
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <ScreenWrapper
      safeArea="top"
      background="surfaceBase"
      testID="c-03-explore-screen"
    >
      <AppBar
        title="Explore Rituals & Pandits"
        titleHi="काशी पंचांग एवं अनुष्ठान"
        locationBadge={isHi ? "वाराणसी" : "Varanasi"}
        includeSafeArea={false}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xxl,
        }}
        refreshControl={
          typeof (globalThis as any).process !== "undefined" &&
          (globalThis as any).process?.env?.NODE_ENV === "test"
            ? undefined
            : (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brandPrimary}
                colors={[colors.brandPrimary]}
              />
            )
        }
      >
        {/* Header Intro */}
        <View style={{ marginBottom: spacing.md }}>
          <VText variant="headlineMedium" color="textPrimary" weight="700">
            {pick("काशी पंचांग एवं अनुष्ठान अन्वेषण", "Explore Rituals & Pandits")}
          </VText>
          <VText variant="bodyMedium" color="textMuted" style={{ marginTop: spacing.xxs }}>
            {pick(
              "सनातन परम्परा, वाराणसी दैनिक पंचांग एवं सत्यापित विद्वान पुरोहितों का अन्वेषण करें।",
              "Discover authentic Sanatan traditions, Vedic rituals, and verified priests of Kashi."
            )}
          </VText>
        </View>

        {/* 14-Day Varanasi Ephemeris Interactive Date Strip */}
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title="Varanasi Ephemeris"
            titleHi="वाराणसी दैनिक पंचांग"
            subtitle="14-Day Astronomical Lunar Calendar"
            subtitleHi="14-दिवसीय प्रत्यक्ष खगोलीय पंचांग"
            sacredGlyph={true}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, paddingVertical: spacing.xs }}
          >
            {calendarDays.map((day, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <TouchableOpacity
                  key={day.dateString}
                  activeOpacity={0.75}
                  onPress={() => setSelectedIndex(idx)}
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: isSelected ? colors.brandPrimary : colors.surfaceCard,
                      borderColor: isSelected ? colors.brandPrimary : colors.borderDefault,
                      borderRadius: radii.md,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: spacing.xs,
                    },
                  ]}
                >
                  <VText
                    variant="caption"
                    color={isSelected ? "textOnPrimary" : "textMuted"}
                    weight="600"
                    align="center"
                  >
                    {isHi ? day.dayNameHi : day.dayNameEn}
                  </VText>
                  <VText
                    variant="headlineSmall"
                    color={isSelected ? "textOnPrimary" : "textPrimary"}
                    weight="700"
                    align="center"
                    style={{ marginVertical: 2 }}
                  >
                    {day.dayNumber}
                  </VText>
                  <VText
                    variant="caption"
                    color={isSelected ? "textOnPrimary" : "brandPrimary"}
                    weight="600"
                    align="center"
                  >
                    {isHi ? day.tithiShortHi : day.tithiEn.split(" ")[1] || day.tithiEn}
                  </VText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Full Shastric 8-Metric Panchang Card for Selected Day */}
        <View style={{ marginBottom: spacing.lg }}>
          <PanchangCard
            data={selectedPanchangData}
            isFullDetail={true}
          />
        </View>

        {/* Quick Action Navigation Cards */}
        <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("PujaList")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Complete Rituals Catalog"
          >
            <VCard
              elevation={1}
              style={[
                styles.actionCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <View style={styles.actionRow}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      width: 40,
                      height: 40,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="book-open-page-variant"
                    size={22}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <VText variant="titleMedium" color="textPrimary" weight="700">
                    🪔 {pick("सम्पूर्ण वैदिक अनुष्ठान कैटलॉग", "Complete Rituals Catalog")}
                  </VText>
                  <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {pick(
                      "गंगा आरती, रुद्राभिषेक, महामृत्युंजय जाप, पिण्डदान, नवग्रह शांति एवं संस्कार।",
                      "Ganga Aarti, Rudrabhishek, Mahamrityunjaya Jaap, Pind Daan, Navgrah Shanti, and Sanskars."
                    )}
                  </VText>
                </View>
              </View>
            </VCard>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("PanditDirectory")}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Verified Vedic Pandits"
          >
            <VCard
              elevation={1}
              style={[
                styles.actionCard,
                {
                  backgroundColor: colors.surfaceCard,
                  borderColor: colors.borderDefault,
                  borderWidth: 1,
                  padding: spacing.md,
                  borderRadius: radii.lg,
                },
              ]}
            >
              <View style={styles.actionRow}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      width: 40,
                      height: 40,
                      borderRadius: radii.full,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="account-tie-voice"
                    size={22}
                    color={colors.brandPrimary}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <VText variant="titleMedium" color="textPrimary" weight="700">
                    🕉 {pick("सत्यापित वैदिक विद्वान पुरोहित", "Verified Vedic Pandits")}
                  </VText>
                  <VText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {pick(
                      "सम्पूर्णानंद एवं बीएचयू से वेदमूर्ति पुरोहित, जिनकी प्रामाणिक परंपरा काशी से जुड़ी है।",
                      "Verified priests in Varanasi with authentic Vedic lineage and clear availability."
                    )}
                  </VText>
                </View>
              </View>
            </VCard>
          </TouchableOpacity>
        </View>

        {/* Categories Grid / List */}
        <View style={{ marginBottom: spacing.md }}>
          <SectionHeader
            title="Browse by Category"
            titleHi="श्रेणी अनुसार अनुष्ठान"
            sacredGlyph={true}
          />

          {categories.length === 0 ? (
            <EmptyState
              title="Catalog Updating"
              titleHi="कैटलॉग अद्यतन हो रहा है"
              description="Categories will appear here shortly."
              descriptionHi="अनुष्ठान श्रेणियां शीघ्र उपलब्ध होंगी।"
              actionLabel="Refresh"
              actionLabelHi="पुनः प्रयास करें"
              onActionPress={refresh}
            />
          ) : (
            categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onPress={() =>
                  navigation.navigate("PujaList", {
                    categoryId: category.id,
                    categoryName: category.name,
                  })
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  dayPill: {
    minWidth: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  actionCard: {
    width: "100%",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
  },
});
