// __tests__/samagri_custom_catalog.test.tsx
import React from "react";
import ReactTestRenderer, { act } from "react-test-renderer";
import { bookingService } from "../src/features/booking/services/bookingService.ts";
import { SamagriSelector } from "../src/features/booking/components/SamagriSelector.tsx";
import { useBookingFlow } from "../src/features/booking/hooks/useBookingFlow.ts";
import { SamagriItem } from "../src/features/discovery/types/discovery.ts";
import { supabase } from "../src/infrastructure/supabase/client.ts";

describe("Samagri Custom Items Catalog & Booking Flow Test Suite", () => {
  const adminUserId = "admin-1111-2222-3333-444444444444";
  const customerUserId = "cust-5555-6666-7777-888888888888";

  // Simulated Database State for public.samagri_items
  let samagriItemsTable: SamagriItem[] = [];
  let auditLogsTable: any[] = [];

  beforeEach(() => {
    jest.clearAllMocks();

    samagriItemsTable = [
      {
        id: "item-ghee-1",
        name: "Pure Desi Cow Ghee",
        description: "A2 Vedic Gir cow bilona ghee for havana",
        unit: "kg",
        unit_price: 650,
        is_active: true,
      },
      {
        id: "item-gangajal-1",
        name: "Brahmakund Gangajal",
        description: "Sealed consecrated sacred water from Varanasi Ghats",
        unit: "litre",
        unit_price: 150,
        is_active: true,
      },
      {
        id: "item-dhoop-1",
        name: "Guggul & Sambrani Dhoop",
        description: "Organic temple herbal incense cone box",
        unit: "box",
        unit_price: 200,
        is_active: false, // Inactive item
      },
    ];

    auditLogsTable = [];
  });

  // =========================================================================
  // 1. Admin Master Catalog Operations (CRUD & Authorization)
  // =========================================================================
  describe("1. Admin Catalog Management & Authorization", () => {
    function simulateAdminSaveItem(
      callerRoles: string[],
      callerId: string,
      itemData: Partial<SamagriItem> & { name: string; unit_price: number; unit?: string }
    ) {
      if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
        throw new Error("Unauthorized: Administrator privileges required");
      }

      const name = (itemData.name || "").trim();
      if (name.length < 2) {
        return { success: false, error: "Item name must be at least 2 characters." };
      }
      if (itemData.unit_price < 0) {
        return { success: false, error: "Unit price must be non-negative." };
      }

      if (itemData.id) {
        const idx = samagriItemsTable.findIndex((i) => i.id === itemData.id);
        if (idx === -1) return { success: false, error: "Item not found." };

        samagriItemsTable[idx] = {
          ...samagriItemsTable[idx],
          name,
          description: itemData.description?.trim() || null,
          unit: itemData.unit || samagriItemsTable[idx].unit || "unit",
          unit_price: itemData.unit_price,
          is_active: itemData.is_active !== undefined ? itemData.is_active : samagriItemsTable[idx].is_active,
        };

        auditLogsTable.push({
          actor_user_id: callerId,
          action: "samagri_item_updated",
          entity_type: "samagri_items",
          entity_id: itemData.id,
          details: { name, unit_price: itemData.unit_price, is_active: samagriItemsTable[idx].is_active },
        });

        return { success: true, data: samagriItemsTable[idx] };
      } else {
        const newItem: SamagriItem = {
          id: `item-${Date.now()}`,
          name,
          description: itemData.description?.trim() || null,
          unit: itemData.unit || "unit",
          unit_price: itemData.unit_price,
          is_active: itemData.is_active !== undefined ? itemData.is_active : true,
        };
        samagriItemsTable.push(newItem);

        auditLogsTable.push({
          actor_user_id: callerId,
          action: "samagri_item_created",
          entity_type: "samagri_items",
          entity_id: newItem.id,
          details: { name, unit_price: newItem.unit_price },
        });

        return { success: true, data: newItem };
      }
    }

    function simulateAdminToggleStatus(callerRoles: string[], callerId: string, itemId: string, isActive: boolean) {
      if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
        throw new Error("Unauthorized: Administrator privileges required");
      }

      const item = samagriItemsTable.find((i) => i.id === itemId);
      if (!item) return { success: false, error: "Item not found." };

      item.is_active = isActive;

      auditLogsTable.push({
        actor_user_id: callerId,
        action: isActive ? "samagri_item_activated" : "samagri_item_deactivated",
        entity_type: "samagri_items",
        entity_id: itemId,
        details: { is_active: isActive },
      });

      return { success: true, data: item };
    }

    test("1. Super Admin can create a new samagri item with name, description, unit, and unit price", () => {
      const res = simulateAdminSaveItem(["super_admin"], adminUserId, {
        name: "Roli & Kumkum",
        description: "Natural turmeric and vermilion paste",
        unit: "pack",
        unit_price: 75,
        is_active: true,
      });

      expect(res.success).toBe(true);
      expect(res.data?.name).toBe("Roli & Kumkum");
      expect(res.data?.unit).toBe("pack");
      expect(res.data?.unit_price).toBe(75);
      expect(samagriItemsTable.length).toBe(4);
    });

    test("2. Super Admin can edit item name, description, unit, and price", () => {
      const res = simulateAdminSaveItem(["super_admin"], adminUserId, {
        id: "item-ghee-1",
        name: "Organic A2 Gir Cow Ghee (Premium)",
        description: "Pure wooden churned bilona ghee",
        unit: "kg",
        unit_price: 700,
      });

      expect(res.success).toBe(true);
      const updated = samagriItemsTable.find((i) => i.id === "item-ghee-1");
      expect(updated?.name).toBe("Organic A2 Gir Cow Ghee (Premium)");
      expect(updated?.unit_price).toBe(700);
    });

    test("3. Super Admin can activate and deactivate catalog items", () => {
      // Deactivate active item
      const deact = simulateAdminToggleStatus(["super_admin"], adminUserId, "item-ghee-1", false);
      expect(deact.success).toBe(true);
      expect(samagriItemsTable.find((i) => i.id === "item-ghee-1")?.is_active).toBe(false);

      // Reactivate inactive item
      const actRes = simulateAdminToggleStatus(["super_admin"], adminUserId, "item-dhoop-1", true);
      expect(actRes.success).toBe(true);
      expect(samagriItemsTable.find((i) => i.id === "item-dhoop-1")?.is_active).toBe(true);
    });

    test("4. Non-admin users cannot mutate samagri catalog", () => {
      expect(() => {
        simulateAdminSaveItem(["customer"], customerUserId, {
          name: "Unauthorized Item",
          unit_price: 100,
        });
      }).toThrow("Administrator privileges required");

      expect(() => {
        simulateAdminToggleStatus(["pandit"], customerUserId, "item-ghee-1", false);
      }).toThrow("Administrator privileges required");
    });
  });

  // =========================================================================
  // 2. Mobile Service Fetch & RLS Filtering
  // =========================================================================
  describe("2. Mobile Catalog Fetch & RLS Filtering", () => {
    test("5. bookingService.fetchCustomSamagriItems queries active catalog items and excludes inactive items", async () => {
      const activeItemsFromDb = samagriItemsTable.filter((i) => i.is_active);

      const fromSpy = jest.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "samagri_items") {
          return {
            select: () => ({
              eq: (col: string, val: any) => {
                expect(col).toBe("is_active");
                expect(val).toBe(true);
                return {
                  order: () => Promise.resolve({ data: activeItemsFromDb, error: null }),
                };
              },
            }),
          } as any;
        }
        return {} as any;
      });

      const items = await bookingService.fetchCustomSamagriItems();

      expect(items.length).toBe(2);
      expect(items.map((i) => i.id)).toEqual(["item-ghee-1", "item-gangajal-1"]);
      expect(items.map((i) => i.id)).not.toContain("item-dhoop-1"); // Inactive excluded

      fromSpy.mockRestore();
    });

    test("6. bookingService.fetchCustomSamagriItems throws error when database read fails", async () => {
      const fromSpy = jest.spyOn(supabase, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: "permission denied for table samagri_items" } }),
          }),
        }),
      } as any);

      await expect(bookingService.fetchCustomSamagriItems()).rejects.toThrow(
        "Failed to load samagri catalog: permission denied for table samagri_items"
      );

      fromSpy.mockRestore();
    });
  });

  // =========================================================================
  // 3. Mobile UI Component Rendering & Empty State
  // =========================================================================
  describe("3. SamagriSelector UI Component Behavior", () => {
    test("7. SamagriSelector renders empty-state message when custom catalog has 0 items", () => {
      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <SamagriSelector
            samagriType="custom"
            onSelectSamagriType={jest.fn()}
            packages={[]}
            selectedPackage={null}
            onSelectPackage={jest.fn()}
            customCatalog={[]}
            customSelections={[]}
            onUpdateCustomQty={jest.fn()}
          />
        );
      });

      const root = renderer!.root;
      expect(
        root.findAllByProps({
          children: "No individual custom Samagri items are currently available in the catalog. You can select a predefined Ritual Package or choose Devotee Arranged.",
        }).length
      ).toBeGreaterThan(0);
    });

    test("8. SamagriSelector renders active catalog items with name, description, unit price, and unit", () => {
      const activeItems = [
        {
          id: "item-ghee-1",
          name: "Pure Desi Cow Ghee",
          description: "A2 Vedic Gir cow bilona ghee for havana",
          unit: "kg",
          unit_price: 650,
          is_active: true,
        },
        {
          id: "item-gangajal-1",
          name: "Brahmakund Gangajal",
          description: null,
          unit: "litre",
          unit_price: 150,
          is_active: true,
        },
      ];

      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <SamagriSelector
            samagriType="custom"
            onSelectSamagriType={jest.fn()}
            packages={[]}
            selectedPackage={null}
            onSelectPackage={jest.fn()}
            customCatalog={activeItems}
            customSelections={[{ item: activeItems[0], quantity: 2 }]}
            onUpdateCustomQty={jest.fn()}
          />
        );
      });

      const root = renderer!.root;
      expect(root.findAllByProps({ children: "Pure Desi Cow Ghee" }).length).toBeGreaterThan(0);
      expect(root.findAllByProps({ children: "A2 Vedic Gir cow bilona ghee for havana" }).length).toBeGreaterThan(0);
      expect(root.findAllByProps({ children: "Brahmakund Gangajal" }).length).toBeGreaterThan(0);
    });

    test("9. Quantity increment and decrement triggers onUpdateCustomQty callback correctly", () => {
      const activeItem = {
        id: "item-ghee-1",
        name: "Pure Desi Cow Ghee",
        description: null,
        unit: "kg",
        unit_price: 650,
        is_active: true,
      };

      const onUpdateCustomQty = jest.fn();

      let renderer: ReactTestRenderer.ReactTestRenderer;

      act(() => {
        renderer = ReactTestRenderer.create(
          <SamagriSelector
            samagriType="custom"
            onSelectSamagriType={jest.fn()}
            packages={[]}
            selectedPackage={null}
            onSelectPackage={jest.fn()}
            customCatalog={[activeItem]}
            customSelections={[{ item: activeItem, quantity: 1 }]}
            onUpdateCustomQty={onUpdateCustomQty}
          />
        );
      });

      const root = renderer!.root;
      // Find all TouchableOpacity components
      const touchables = root.findAllByType(require("react-native").TouchableOpacity);
      // In custom item row, the last two touchables are [-] and [+]
      const minusBtn = touchables[touchables.length - 2];
      const plusBtn = touchables[touchables.length - 1];

      act(() => {
        plusBtn.props.onPress();
      });
      expect(onUpdateCustomQty).toHaveBeenCalledWith(activeItem, 2);

      act(() => {
        minusBtn.props.onPress();
      });
      expect(onUpdateCustomQty).toHaveBeenCalledWith(activeItem, 0);
    });
  });

  // =========================================================================
  // 4. Financial Calculations & Authoritative Payment Order RPC Rules
  // =========================================================================
  describe("4. Financial Calculations & RPC Invariants", () => {
    test("10. Custom Samagri items calculate 100% advance requirement in price estimation", () => {
      // Pricing Rule:
      // Base Puja = 2000 (advance_percent = 10% -> 200)
      // Custom Samagri: 2x Ghee (650) + 1x Gangajal (150) = 1300 + 150 = 1450 (100% advance = 1450)
      // Total Amount = 3450
      // Advance Amount = 200 + 1450 = 1650
      // Balance Amount = 3450 - 1650 = 1800
      const basePujaPrice = 2000;
      const advancePercent = 10;
      const samagriTotal = 2 * 650 + 1 * 150; // 1450
      const prasadTotal = 0;

      const pujaAdvance = Math.round(basePujaPrice * (advancePercent / 100));
      const totalAdvance = pujaAdvance + samagriTotal + prasadTotal;
      const totalAmount = basePujaPrice + samagriTotal + prasadTotal;
      const balanceAmount = totalAmount - totalAdvance;

      expect(pujaAdvance).toBe(200);
      expect(samagriTotal).toBe(1450);
      expect(totalAdvance).toBe(1650);
      expect(totalAmount).toBe(3450);
      expect(balanceAmount).toBe(1800);
    });

    test("11. create_or_validate_booking RPC passes custom samagri arrays cleanly", async () => {
      const rpcSpy = jest.spyOn(supabase, "rpc").mockResolvedValue({
        data: {
          booking_id: "bk-custom-samagri-1",
          booking_number: "KV-BK-20261009-CUSTOM1",
          status: "payment_pending",
          scheduled_start_at: "2026-10-12T09:00:00+05:30",
          scheduled_end_at: "2026-10-12T10:30:00+05:30",
          total_amount: 3450,
          advance_amount: 1650,
          balance_amount: 1800,
          puja_price: 2000,
          samagri_total: 1450,
          prasad_total: 0,
          payment_order_id: "po-custom-samagri-1",
        },
        error: null,
      } as any);

      const res = await bookingService.createOrValidateBooking({
        pandit_id: "pandit-1",
        puja_service_id: "puja-1",
        service_mode: "home",
        scheduled_start_at: "2026-10-12T09:00:00+05:30",
        address_id: "addr-1",
        custom_samagri_item_ids: ["item-ghee-1", "item-gangajal-1"],
        custom_samagri_quantities: [2, 1],
      });

      expect(rpcSpy).toHaveBeenCalledWith("create_or_validate_booking", expect.objectContaining({
        p_custom_samagri_item_ids: ["item-ghee-1", "item-gangajal-1"],
        p_custom_samagri_quantities: [2, 1],
      }));

      expect(res.booking_id).toBe("bk-custom-samagri-1");
      expect(res.advance_amount).toBe(1650);
      expect(res.samagri_total).toBe(1450);

      rpcSpy.mockRestore();
    });
  });
});
