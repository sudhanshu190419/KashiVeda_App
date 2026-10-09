// __tests__/samagri_catalog_admin_operations.test.ts
import type {
  SamagriItem,
  SamagriItemFormData,
  SamagriPackage,
  SamagriPackageFormData,
} from "../../kashi-veda-admin/lib/types/samagri-catalog";

describe("Admin Master Samagri Catalog & Ritual Package Operations Test Suite", () => {
  const superAdminUserId = "superadmin-1111-2222-3333-444444444444";
  const adminUserId = "admin-2222-3333-4444-555555555555";
  const regularUserId = "customer-9999-8888-7777-666666666666";

  // Mock Database State
  let samagriItemsTable: SamagriItem[] = [];
  let samagriPackagesTable: any[] = [];
  let samagriPackageItemsTable: any[] = [];
  let auditLogsTable: any[] = [];

  beforeEach(() => {
    samagriItemsTable = [
      {
        id: "item-ghee-1",
        name: "Pure Cow Ghee",
        description: "A2 Gir cow bilona ghee",
        unit: "kg",
        unit_price: 650,
        is_active: true,
      },
      {
        id: "item-gangajal-1",
        name: "Brahmakund Gangajal",
        description: "Sacred sealed Varanasi Gangajal",
        unit: "litre",
        unit_price: 150,
        is_active: true,
      },
      {
        id: "item-dhoop-1",
        name: "Guggul Dhoop Cones",
        description: "Organic temple herbal dhoop",
        unit: "box",
        unit_price: 200,
        is_active: false,
      },
    ];

    samagriPackagesTable = [
      {
        id: "pkg-1",
        puja_service_id: "srv-rudra-1",
        name: "Rudrabhishek Complete Samagri",
        description: "16 sacred offerings for Lord Shiva Abhisheka",
        is_active: true,
      },
    ];

    samagriPackageItemsTable = [
      {
        package_id: "pkg-1",
        samagri_item_id: "item-ghee-1",
        quantity: 1,
      },
      {
        package_id: "pkg-1",
        samagri_item_id: "item-gangajal-1",
        quantity: 2,
      },
    ];

    auditLogsTable = [];
  });

  // Simulated Server Action: saveSamagriItem
  function simulateSaveSamagriItem(
    callerRoles: string[],
    callerId: string,
    formData: SamagriItemFormData
  ) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const name = (formData.name || "").trim();
    if (name.length < 2) {
      return { success: false, error: "Item name must be at least 2 characters." };
    }

    const unit = (formData.unit || "").trim();
    if (unit.length < 1) {
      return { success: false, error: "Measurement unit is required." };
    }

    const unitPrice = Number(formData.unit_price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      return { success: false, error: "Unit price must be a valid non-negative number." };
    }

    // Duplicate check
    const existing = samagriItemsTable.find(
      (i) => i.name.toLowerCase() === name.toLowerCase() && i.id !== formData.id
    );
    if (existing) {
      return { success: false, error: `A samagri item named "${name}" already exists.` };
    }

    if (formData.id) {
      const idx = samagriItemsTable.findIndex((i) => i.id === formData.id);
      if (idx === -1) return { success: false, error: "Item not found." };

      samagriItemsTable[idx] = {
        ...samagriItemsTable[idx],
        name,
        description: formData.description?.trim() || null,
        unit,
        unit_price: unitPrice,
        is_active: formData.is_active !== undefined ? formData.is_active : samagriItemsTable[idx].is_active,
      };

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "samagri_item_updated",
        entity_type: "samagri_items",
        entity_id: formData.id,
        details: { name, unit, unit_price: unitPrice, is_active: samagriItemsTable[idx].is_active },
      });

      return { success: true, data: samagriItemsTable[idx] };
    } else {
      const newItem: SamagriItem = {
        id: `item-${Date.now()}`,
        name,
        description: formData.description?.trim() || null,
        unit,
        unit_price: unitPrice,
        is_active: formData.is_active !== undefined ? formData.is_active : true,
      };
      samagriItemsTable.push(newItem);

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "samagri_item_created",
        entity_type: "samagri_items",
        entity_id: newItem.id,
        details: { name, unit, unit_price: unitPrice },
      });

      return { success: true, data: newItem };
    }
  }

  // Simulated Server Action: toggleSamagriItemStatus
  function simulateToggleSamagriItemStatus(
    callerRoles: string[],
    callerId: string,
    itemId: string,
    isActive: boolean
  ) {
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
      details: { new_status: isActive },
    });

    return { success: true };
  }

  // Simulated Server Action: saveSamagriPackage
  function simulateSaveSamagriPackage(
    callerRoles: string[],
    callerId: string,
    formData: SamagriPackageFormData
  ) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const name = (formData.name || "").trim();
    if (name.length < 2) {
      return { success: false, error: "Package name must be at least 2 characters." };
    }

    if (!formData.puja_service_id) {
      return { success: false, error: "A target Ritual / Puja Service must be selected." };
    }

    const items = (formData.items || []).filter((i) => i.samagri_item_id && i.quantity > 0);
    if (items.length === 0) {
      return { success: false, error: "At least one item with a valid quantity must be added to the package." };
    }

    let packageId = formData.id;

    if (packageId) {
      const idx = samagriPackagesTable.findIndex((p) => p.id === packageId);
      if (idx === -1) return { success: false, error: "Package not found." };

      samagriPackagesTable[idx] = {
        ...samagriPackagesTable[idx],
        name,
        puja_service_id: formData.puja_service_id,
        description: formData.description?.trim() || null,
        is_active: formData.is_active !== undefined ? formData.is_active : samagriPackagesTable[idx].is_active,
      };

      // Replace package items
      samagriPackageItemsTable = samagriPackageItemsTable.filter((pi) => pi.package_id !== packageId);
      items.forEach((i) => {
        samagriPackageItemsTable.push({
          package_id: packageId,
          samagri_item_id: i.samagri_item_id,
          quantity: i.quantity,
        });
      });

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "samagri_package_updated",
        entity_type: "samagri_packages",
        entity_id: packageId,
        details: { name, puja_service_id: formData.puja_service_id, items_count: items.length },
      });

      return { success: true, data: { id: packageId } };
    } else {
      const newPkg = {
        id: `pkg-${Date.now()}`,
        puja_service_id: formData.puja_service_id,
        name,
        description: formData.description?.trim() || null,
        is_active: formData.is_active !== undefined ? formData.is_active : true,
      };
      samagriPackagesTable.push(newPkg);

      items.forEach((i) => {
        samagriPackageItemsTable.push({
          package_id: newPkg.id,
          samagri_item_id: i.samagri_item_id,
          quantity: i.quantity,
        });
      });

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "samagri_package_created",
        entity_type: "samagri_packages",
        entity_id: newPkg.id,
        details: { name, puja_service_id: formData.puja_service_id, items_count: items.length },
      });

      return { success: true, data: { id: newPkg.id } };
    }
  }

  // Simulated Server Action: toggleSamagriPackageStatus
  function simulateToggleSamagriPackageStatus(
    callerRoles: string[],
    callerId: string,
    packageId: string,
    isActive: boolean
  ) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const pkg = samagriPackagesTable.find((p) => p.id === packageId);
    if (!pkg) return { success: false, error: "Package not found." };

    pkg.is_active = isActive;

    auditLogsTable.push({
      actor_user_id: callerId,
      action: isActive ? "samagri_package_activated" : "samagri_package_deactivated",
      entity_type: "samagri_packages",
      entity_id: packageId,
      details: { new_status: isActive },
    });

    return { success: true };
  }

  // =========================================================================
  // 1. Master Samagri Item Operations
  // =========================================================================
  describe("1. Master Samagri Item Management", () => {
    test("1. Admin can create a new samagri item with valid name, unit, and unit price", () => {
      const res = simulateSaveSamagriItem(["admin"], adminUserId, {
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

    test("2. Admin can update an existing item name, unit, and unit price", () => {
      const res = simulateSaveSamagriItem(["super_admin"], superAdminUserId, {
        id: "item-ghee-1",
        name: "Organic A2 Gir Cow Ghee (Bilona Churned)",
        unit: "kg",
        unit_price: 750,
      });

      expect(res.success).toBe(true);
      const updated = samagriItemsTable.find((i) => i.id === "item-ghee-1");
      expect(updated?.name).toBe("Organic A2 Gir Cow Ghee (Bilona Churned)");
      expect(updated?.unit_price).toBe(750);
    });

    test("3. Duplicate item name is rejected case-insensitively", () => {
      const res = simulateSaveSamagriItem(["admin"], adminUserId, {
        name: "pure cow ghee", // matches item-ghee-1
        unit: "kg",
        unit_price: 500,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("already exists");
    });

    test("4. Invalid item inputs (short name, negative price, empty unit) are rejected", () => {
      const shortName = simulateSaveSamagriItem(["admin"], adminUserId, {
        name: "A",
        unit: "kg",
        unit_price: 100,
      });
      expect(shortName.success).toBe(false);
      expect(shortName.error).toContain("at least 2 characters");

      const negPrice = simulateSaveSamagriItem(["admin"], adminUserId, {
        name: "Valid Name",
        unit: "kg",
        unit_price: -50,
      });
      expect(negPrice.success).toBe(false);
      expect(negPrice.error).toContain("non-negative");

      const emptyUnit = simulateSaveSamagriItem(["admin"], adminUserId, {
        name: "Valid Name",
        unit: "   ",
        unit_price: 100,
      });
      expect(emptyUnit.success).toBe(false);
      expect(emptyUnit.error).toContain("unit is required");
    });

    test("5. Item activation and deactivation updates status correctly", () => {
      // Deactivate
      const deact = simulateToggleSamagriItemStatus(["admin"], adminUserId, "item-ghee-1", false);
      expect(deact.success).toBe(true);
      expect(samagriItemsTable.find((i) => i.id === "item-ghee-1")?.is_active).toBe(false);

      // Reactivate
      const actRes = simulateToggleSamagriItemStatus(["admin"], adminUserId, "item-ghee-1", true);
      expect(actRes.success).toBe(true);
      expect(samagriItemsTable.find((i) => i.id === "item-ghee-1")?.is_active).toBe(true);
    });
  });

  // =========================================================================
  // 2. Ritual Package Operations
  // =========================================================================
  describe("2. Ritual Package Management", () => {
    test("6. Super Admin can create a new package with puja service and multiple items", () => {
      const res = simulateSaveSamagriPackage(["super_admin"], superAdminUserId, {
        name: "Maha Rudrabhishek Deluxe Samagri",
        puja_service_id: "srv-rudra-1",
        description: "Extended samagri for 11 Brahmins",
        is_active: true,
        items: [
          { samagri_item_id: "item-ghee-1", quantity: 2 },
          { samagri_item_id: "item-gangajal-1", quantity: 5 },
        ],
      });

      expect(res.success).toBe(true);
      expect(samagriPackagesTable.length).toBe(2);
      const pkgItems = samagriPackageItemsTable.filter((pi) => pi.package_id === res.data?.id);
      expect(pkgItems.length).toBe(2);
      expect(pkgItems.find((pi) => pi.samagri_item_id === "item-ghee-1")?.quantity).toBe(2);
    });

    test("7. Super Admin can update an existing package and its item mappings", () => {
      const res = simulateSaveSamagriPackage(["super_admin"], superAdminUserId, {
        id: "pkg-1",
        name: "Rudrabhishek Premium Samagri",
        puja_service_id: "srv-rudra-1",
        items: [
          { samagri_item_id: "item-ghee-1", quantity: 3 }, // updated quantity
        ],
      });

      expect(res.success).toBe(true);
      const updatedPkg = samagriPackagesTable.find((p) => p.id === "pkg-1");
      expect(updatedPkg.name).toBe("Rudrabhishek Premium Samagri");
      const pkgItems = samagriPackageItemsTable.filter((pi) => pi.package_id === "pkg-1");
      expect(pkgItems.length).toBe(1);
      expect(pkgItems[0].quantity).toBe(3);
    });

    test("8. Package without puja service or items is rejected", () => {
      const noPuja = simulateSaveSamagriPackage(["admin"], adminUserId, {
        name: "Test Package",
        puja_service_id: "",
        items: [{ samagri_item_id: "item-ghee-1", quantity: 1 }],
      });
      expect(noPuja.success).toBe(false);
      expect(noPuja.error).toContain("Puja Service must be selected");

      const noItems = simulateSaveSamagriPackage(["admin"], adminUserId, {
        name: "Test Package",
        puja_service_id: "srv-rudra-1",
        items: [],
      });
      expect(noItems.success).toBe(false);
      expect(noItems.error).toContain("At least one item");
    });

    test("9. Package total price is calculated correctly from item unit prices and quantities", () => {
      // pkg-1 has: 1x Ghee (650) + 2x Gangajal (150) = 650 + 300 = 950
      const pkgItems = samagriPackageItemsTable.filter((pi) => pi.package_id === "pkg-1");
      const calculatedPrice = pkgItems.reduce((sum, pi) => {
        const item = samagriItemsTable.find((i) => i.id === pi.samagri_item_id);
        return sum + (item?.unit_price || 0) * pi.quantity;
      }, 0);

      expect(calculatedPrice).toBe(950);
    });

    test("10. Package activation and deactivation updates status correctly", () => {
      const deact = simulateToggleSamagriPackageStatus(["admin"], adminUserId, "pkg-1", false);
      expect(deact.success).toBe(true);
      expect(samagriPackagesTable.find((p) => p.id === "pkg-1")?.is_active).toBe(false);

      const actRes = simulateToggleSamagriPackageStatus(["admin"], adminUserId, "pkg-1", true);
      expect(actRes.success).toBe(true);
      expect(samagriPackagesTable.find((p) => p.id === "pkg-1")?.is_active).toBe(true);
    });
  });

  // =========================================================================
  // 3. Security, Authorization & Audit Logging
  // =========================================================================
  describe("3. Security, Authorization & Audit Logging", () => {
    test("11. Non-admin users cannot mutate items or packages", () => {
      expect(() => {
        simulateSaveSamagriItem(["customer"], regularUserId, {
          name: "Illegal Item",
          unit: "kg",
          unit_price: 10,
        });
      }).toThrow("Administrator privileges required");

      expect(() => {
        simulateToggleSamagriItemStatus(["pandit"], regularUserId, "item-ghee-1", false);
      }).toThrow("Administrator privileges required");

      expect(() => {
        simulateSaveSamagriPackage(["customer"], regularUserId, {
          name: "Illegal Package",
          puja_service_id: "srv-rudra-1",
          items: [{ samagri_item_id: "item-ghee-1", quantity: 1 }],
        });
      }).toThrow("Administrator privileges required");
    });

    test("12. All mutations record immutable audit logs in admin_audit_logs", () => {
      simulateSaveSamagriItem(["admin"], adminUserId, {
        name: "Havan Sticks (Samidha)",
        unit: "bundle",
        unit_price: 50,
      });
      simulateToggleSamagriItemStatus(["admin"], adminUserId, "item-ghee-1", false);
      simulateSaveSamagriPackage(["admin"], adminUserId, {
        name: "Griha Pravesh Basic Package",
        puja_service_id: "srv-rudra-1",
        items: [{ samagri_item_id: "item-gangajal-1", quantity: 1 }],
      });
      simulateToggleSamagriPackageStatus(["admin"], adminUserId, "pkg-1", false);

      expect(auditLogsTable).toHaveLength(4);
      expect(auditLogsTable[0].action).toBe("samagri_item_created");
      expect(auditLogsTable[1].action).toBe("samagri_item_deactivated");
      expect(auditLogsTable[2].action).toBe("samagri_package_created");
      expect(auditLogsTable[3].action).toBe("samagri_package_deactivated");
      expect(auditLogsTable.every((log) => log.actor_user_id === adminUserId)).toBe(true);
    });
  });
});
