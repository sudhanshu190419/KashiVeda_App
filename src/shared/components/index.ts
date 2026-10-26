// src/shared/components/index.ts

// Legacy UI components (explicitly preserving legacy Button and ButtonProps for backwards compatibility)
export * from "./ui/index.ts";
export { Button } from "./ui/index.ts";
export type { ButtonProps } from "./ui/index.ts";

// Foundation primitives (VButton, VIconButton, VText, VInput, VAvatar, VBadge, etc.)
export * from "./foundations/index.ts";

// Icon components shim (Ionicons, MaterialCommunityIcons, Feather, etc.)
export * from "./icons/index.ts";

// Layout components (V-prefixed and unique components; legacy Card, EmptyState, ErrorState preserved from ui/)
export {
  ScreenWrapper,
  ScreenTitle,
  AppBar,
  SectionHeader,
  StepProgress,
  ProgressBar,
  StickyBottomBar,
  VCard,
  VTabs,
  TabBar,
  GridList,
  AccordionList,
  FilterBar,
  OfflineBanner,
  VEmptyState,
  VErrorState,
} from "./layout/index.ts";
export type {
  ScreenWrapperProps,
  ScreenTitleProps,
  AppBarProps,
  SectionHeaderProps,
  StepProgressProps,
  StepItem,
  ProgressBarProps,
  StickyBottomBarProps,
  VCardProps,
  VTabsProps,
  TabItem,
  TabBarProps,
  GridListProps,
  AccordionListProps,
  AccordionItem,
  FilterBarProps,
  FilterOption,
  OfflineBannerProps,
  VEmptyStateProps,
  VErrorStateProps,
} from "./layout/index.ts";

// Spiritual domain components (Group C)
export * from "./spiritual/index.ts";

// Feedback components (Group D)
export * from "./feedback/index.ts";
