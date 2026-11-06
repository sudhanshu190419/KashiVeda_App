// src/features/address/services/addressService.ts
import { supabase } from "../../../infrastructure/supabase/client.ts";
import { CustomerAddress } from "../../booking/types/booking.types.ts";

export interface SaveAddressInput {
  label: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  is_default?: boolean;
}

export const addressService = {
  /**
   * Fetch all saved addresses for the authenticated customer.
   */
  async fetchAddresses(): Promise<CustomerAddress[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("customer_addresses")
      .select(
        "id, customer_id, label, address_line1, address_line2, city, state, pincode, latitude, longitude, is_default, created_at"
      )
      .eq("customer_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load addresses: ${error.message}`);
    }

    return (data as CustomerAddress[]) || [];
  },

  /**
   * Save a new address for the authenticated customer.
   */
  async saveAddress(input: SaveAddressInput): Promise<CustomerAddress> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Authentication required to save address.");
    }

    if (input.is_default) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", user.id)
        .eq("is_default", true);
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        customer_id: user.id,
        label: input.label,
        address_line1: input.address_line1,
        address_line2: input.address_line2 || null,
        city: input.city,
        state: input.state || null,
        pincode: input.pincode || null,
        latitude: input.latitude ?? 25.3176,
        longitude: input.longitude ?? 82.9739,
        is_default: input.is_default || false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save address: ${error.message}`);
    }

    return data as CustomerAddress;
  },

  /**
   * Update an existing address for the authenticated customer.
   */
  async updateAddress(
    addressId: string,
    input: SaveAddressInput
  ): Promise<CustomerAddress> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Authentication required to update address.");
    }

    if (input.is_default) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", user.id)
        .eq("is_default", true);
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .update({
        label: input.label,
        address_line1: input.address_line1,
        address_line2: input.address_line2 || null,
        city: input.city,
        state: input.state || null,
        pincode: input.pincode || null,
        latitude: input.latitude ?? 25.3176,
        longitude: input.longitude ?? 82.9739,
        is_default: input.is_default || false,
      })
      .eq("id", addressId)
      .eq("customer_id", user.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update address: ${error.message}`);
    }

    return data as CustomerAddress;
  },

  /**
   * Set an address as the default for the authenticated customer.
   */
  async setDefaultAddress(addressId: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Authentication required.");
    }

    // Unset current default
    await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", user.id)
      .eq("is_default", true);

    // Set new default
    const { error } = await supabase
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", addressId)
      .eq("customer_id", user.id);

    if (error) {
      throw new Error(`Failed to set default address: ${error.message}`);
    }
  },

  /**
   * Delete a saved address for the authenticated customer.
   */
  async deleteAddress(addressId: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Authentication required to delete address.");
    }

    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", addressId)
      .eq("customer_id", user.id);

    if (error) {
      throw new Error(`Failed to delete address: ${error.message}`);
    }
  },
};
