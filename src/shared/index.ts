// src/shared/index.ts
export * from "./components/index.ts";
export * from "./constants/index.ts";
export * from "./i18n/index.ts";
export * from "./theme/index.ts";
export * from "./types/index.ts";
export * from "./utils/index.ts";
export { AdminNoticeScreen } from "./screens/AdminNoticeScreen.tsx";

// Disambiguate overlapping names between components and types
export { KundliChart } from "./components/index.ts";
export type { GotraOption } from "./types/index.ts";
