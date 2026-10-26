// src/shared/components/index.ts

// Legacy UI components (explicitly preserving legacy Button and ButtonProps for backwards compatibility)
export * from "./ui/index.ts";
export { Button } from "./ui/index.ts";
export type { ButtonProps } from "./ui/index.ts";

// Foundation primitives (VButton, VIconButton, VText, VInput, VAvatar, VBadge, etc.)
export * from "./foundations/index.ts";

// Icon components shim (Ionicons, MaterialCommunityIcons, Feather, etc.)
export * from "./icons/index.ts";
