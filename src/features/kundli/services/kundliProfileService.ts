// src/features/kundli/services/kundliProfileService.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KundliProfile, SaveKundliProfileInput } from "../types/kundliProfile.types.ts";

const STORAGE_KEY_PREFIX = "@kashi_veda_kundli_profiles_";

export const kundliProfileService = {
  /**
   * Fetch all saved Kundli profiles for the current user.
   */
  async fetchProfiles(userId: string): Promise<KundliProfile[]> {
    if (!userId) return [];
    try {
      const raw = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  /**
   * Save a new Kundli profile for the current user.
   */
  async saveProfile(
    userId: string,
    input: SaveKundliProfileInput
  ): Promise<KundliProfile> {
    if (!userId) {
      throw new Error("User identifier required to save profile.");
    }

    const currentProfiles = await this.fetchProfiles(userId);
    const newProfile: KundliProfile = {
      id: "kp_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7),
      name: input.name.trim(),
      relation: input.relation,
      dateOfBirth: input.dateOfBirth,
      timeOfBirth: input.timeOfBirth || "",
      timeUnknown: !!input.timeUnknown,
      placeOfBirth: input.placeOfBirth.trim(),
      gotra: input.gotra?.trim() || undefined,
      rashi: input.rashi?.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [newProfile, ...currentProfiles];
    await AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${userId}`,
      JSON.stringify(updated)
    );

    return newProfile;
  },

  /**
   * Update an existing Kundli profile for the current user.
   */
  async updateProfile(
    userId: string,
    profileId: string,
    input: SaveKundliProfileInput
  ): Promise<KundliProfile> {
    if (!userId) {
      throw new Error("User identifier required to update profile.");
    }

    const currentProfiles = await this.fetchProfiles(userId);
    const index = currentProfiles.findIndex((p) => p.id === profileId);
    if (index === -1) {
      throw new Error("Profile not found.");
    }

    const updatedProfile: KundliProfile = {
      ...currentProfiles[index],
      name: input.name.trim(),
      relation: input.relation,
      dateOfBirth: input.dateOfBirth,
      timeOfBirth: input.timeOfBirth || "",
      timeUnknown: !!input.timeUnknown,
      placeOfBirth: input.placeOfBirth.trim(),
      gotra: input.gotra?.trim() || undefined,
      rashi: input.rashi?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    currentProfiles[index] = updatedProfile;
    await AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${userId}`,
      JSON.stringify(currentProfiles)
    );

    return updatedProfile;
  },

  /**
   * Delete a Kundli profile for the current user.
   */
  async deleteProfile(userId: string, profileId: string): Promise<void> {
    if (!userId) {
      throw new Error("User identifier required to delete profile.");
    }

    const currentProfiles = await this.fetchProfiles(userId);
    const filtered = currentProfiles.filter((p) => p.id !== profileId);
    await AsyncStorage.setItem(
      `${STORAGE_KEY_PREFIX}${userId}`,
      JSON.stringify(filtered)
    );
  },
};
