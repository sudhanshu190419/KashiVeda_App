// src/shared/types/index.ts
export * from "./navigation.ts";
export * from "./domain.ts";
export * from "../../features/discovery/types/discovery.ts";

// Disambiguate overlapping names between domain.ts and discovery.ts
export type { Review, SamagriItem } from "./domain.ts";
