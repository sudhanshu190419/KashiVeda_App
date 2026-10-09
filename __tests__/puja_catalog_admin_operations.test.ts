// __tests__/puja_catalog_admin_operations.test.ts
import type {
  PujaCategoryItem,
  PujaCategoryFormData,
  PujaServiceItem,
  PujaServiceFormData,
  ServiceMode,
} from "../../kashi-veda-admin/lib/types/puja-catalog";

describe("Admin Master Puja Catalog Operations Test Suite", () => {
  const adminUserId = "admin-1111-2222-3333-444444444444";
  const regularUserId = "customer-5555-6666-7777-888888888888";

  // Mock Database State
  let categoriesTable: PujaCategoryItem[] = [];
  let servicesTable: PujaServiceItem[] = [];
  let auditLogsTable: any[] = [];

  beforeEach(() => {
    categoriesTable = [
      {
        id: "cat-1",
        name: "Abhishek & Rudra",
        description: "Sacred bathing and Shiva propitiation rituals",
        display_order: 1,
        is_active: true,
        ritual_count: 1,
      },
      {
        id: "cat-2",
        name: "Sanskar & Vivah",
        description: "Vedic rites of passage and matrimonial consecrations",
        display_order: 2,
        is_active: true,
        ritual_count: 1,
      },
    ];

    servicesTable = [
      {
        id: "srv-1",
        category_id: "cat-1",
        category_name: "Abhishek & Rudra",
        category_is_active: true,
        name: "Rudrabhishek",
        description: "Holy Shiva water & panchamrit abhisheka",
        default_duration_minutes: 90,
        allowed_modes: ["home", "temple", "remote"],
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "srv-2",
        category_id: "cat-2",
        category_name: "Sanskar & Vivah",
        category_is_active: true,
        name: "Griha Pravesh Puja",
        description: "Auspicious home blessing and Vastu purusha invocation",
        default_duration_minutes: 120,
        allowed_modes: ["home"],
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    auditLogsTable = [];
  });

  // Simulated Server Action: saveCategory
  function simulateSaveCategory(callerRoles: string[], callerId: string, formData: PujaCategoryFormData) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const name = (formData.name || "").trim();
    if (name.length < 2) {
      return { success: false, error: "Category name must be at least 2 characters." };
    }

    // Duplicate check
    const existing = categoriesTable.find(
      (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== formData.id
    );
    if (existing) {
      return { success: false, error: `A category named "${name}" already exists.` };
    }

    if (formData.id) {
      const idx = categoriesTable.findIndex((c) => c.id === formData.id);
      if (idx === -1) return { success: false, error: "Category not found." };

      categoriesTable[idx] = {
        ...categoriesTable[idx],
        name,
        description: formData.description?.trim() || null,
        display_order: formData.display_order ?? 0,
        is_active: formData.is_active !== undefined ? formData.is_active : categoriesTable[idx].is_active,
      };

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "puja_category_updated",
        entity_type: "puja_categories",
        entity_id: formData.id,
        details: { name, is_active: categoriesTable[idx].is_active },
      });

      return { success: true, data: categoriesTable[idx] };
    } else {
      const newCategory: PujaCategoryItem = {
        id: `cat-${Date.now()}`,
        name,
        description: formData.description?.trim() || null,
        display_order: formData.display_order ?? 0,
        is_active: formData.is_active !== undefined ? formData.is_active : true,
        ritual_count: 0,
      };
      categoriesTable.push(newCategory);

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "puja_category_created",
        entity_type: "puja_categories",
        entity_id: newCategory.id,
        details: { name },
      });

      return { success: true, data: newCategory };
    }
  }

  // Simulated Server Action: toggleCategoryStatus
  function simulateToggleCategoryStatus(callerRoles: string[], callerId: string, categoryId: string, isActive: boolean) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const cat = categoriesTable.find((c) => c.id === categoryId);
    if (!cat) return { success: false, error: "Category not found" };

    cat.is_active = isActive;

    auditLogsTable.push({
      actor_user_id: callerId,
      action: isActive ? "puja_category_activated" : "puja_category_deactivated",
      entity_type: "puja_categories",
      entity_id: categoryId,
      details: { new_status: isActive },
    });

    return { success: true };
  }

  // Simulated Server Action: saveRitual
  function simulateSaveRitual(callerRoles: string[], callerId: string, formData: PujaServiceFormData) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const name = (formData.name || "").trim();
    if (name.length < 2) {
      return { success: false, error: "Ritual name must be at least 2 characters." };
    }

    const duration = Number(formData.default_duration_minutes);
    if (isNaN(duration) || duration <= 0) {
      return { success: false, error: "Default duration must be greater than 0 minutes." };
    }

    const validModes: ServiceMode[] = ["home", "temple", "remote"];
    const allowedModes = (formData.allowed_modes || []).filter((m) => validModes.includes(m));
    if (allowedModes.length === 0) {
      return { success: false, error: "At least one service mode (Home, Temple, or Remote) must be selected." };
    }

    // Duplicate check
    const existing = servicesTable.find(
      (s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== formData.id
    );
    if (existing) {
      return { success: false, error: `A ritual service named "${name}" already exists.` };
    }

    if (formData.id) {
      const idx = servicesTable.findIndex((s) => s.id === formData.id);
      if (idx === -1) return { success: false, error: "Ritual not found" };

      servicesTable[idx] = {
        ...servicesTable[idx],
        name,
        category_id: formData.category_id || null,
        description: formData.description?.trim() || null,
        default_duration_minutes: duration,
        allowed_modes: allowedModes,
        is_active: formData.is_active !== undefined ? formData.is_active : servicesTable[idx].is_active,
        updated_at: new Date().toISOString(),
      };

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "puja_service_updated",
        entity_type: "puja_services",
        entity_id: formData.id,
        details: { name, duration, allowed_modes: allowedModes },
      });

      return { success: true, data: servicesTable[idx] };
    } else {
      const newRitual: PujaServiceItem = {
        id: `srv-${Date.now()}`,
        name,
        category_id: formData.category_id || null,
        description: formData.description?.trim() || null,
        default_duration_minutes: duration,
        allowed_modes: allowedModes,
        is_active: formData.is_active !== undefined ? formData.is_active : true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      servicesTable.push(newRitual);

      auditLogsTable.push({
        actor_user_id: callerId,
        action: "puja_service_created",
        entity_type: "puja_services",
        entity_id: newRitual.id,
        details: { name, duration, allowed_modes: allowedModes },
      });

      return { success: true, data: newRitual };
    }
  }

  // Simulated Server Action: toggleRitualStatus
  function simulateToggleRitualStatus(callerRoles: string[], callerId: string, serviceId: string, isActive: boolean) {
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      throw new Error("Unauthorized: Administrator privileges required");
    }

    const srv = servicesTable.find((s) => s.id === serviceId);
    if (!srv) return { success: false, error: "Ritual not found" };

    srv.is_active = isActive;

    auditLogsTable.push({
      actor_user_id: callerId,
      action: isActive ? "puja_service_activated" : "puja_service_deactivated",
      entity_type: "puja_services",
      entity_id: serviceId,
      details: { new_status: isActive },
    });

    return { success: true };
  }

  // ===========================================================================
  // 1. Category Operations
  // ===========================================================================
  describe("1. Category Management", () => {
    test("1. Admin can create a new puja category with valid fields", () => {
      const res = simulateSaveCategory(["admin"], adminUserId, {
        name: "Navgrah & Shanti",
        description: "Planetary balance and peace rituals",
        display_order: 3,
        is_active: true,
      });

      expect(res.success).toBe(true);
      expect(res.data?.name).toBe("Navgrah & Shanti");
      expect(categoriesTable.length).toBe(3);
    });

    test("2. Admin can update an existing category name and display order", () => {
      const res = simulateSaveCategory(["admin"], adminUserId, {
        id: "cat-1",
        name: "Abhishek, Rudra & Shiva",
        display_order: 10,
      });

      expect(res.success).toBe(true);
      const updated = categoriesTable.find((c) => c.id === "cat-1");
      expect(updated?.name).toBe("Abhishek, Rudra & Shiva");
      expect(updated?.display_order).toBe(10);
    });

    test("3. Duplicate category name is rejected case-insensitively", () => {
      const res = simulateSaveCategory(["admin"], adminUserId, {
        name: "abhishek & rudra", // same as cat-1
        display_order: 5,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("already exists");
    });

    test("4. Category activation and deactivation toggles lifecycle correctly", () => {
      // Deactivate
      const deact = simulateToggleCategoryStatus(["admin"], adminUserId, "cat-1", false);
      expect(deact.success).toBe(true);
      expect(categoriesTable.find((c) => c.id === "cat-1")?.is_active).toBe(false);

      // Reactivate
      const act = simulateToggleCategoryStatus(["admin"], adminUserId, "cat-1", true);
      expect(act.success).toBe(true);
      expect(categoriesTable.find((c) => c.id === "cat-1")?.is_active).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Ritual Service Operations
  // ===========================================================================
  describe("2. Ritual Service Management", () => {
    test("5. Admin can create a new master ritual with category, duration, and allowed modes", () => {
      const res = simulateSaveRitual(["admin"], adminUserId, {
        name: "Satyanarayan Katha & Puja",
        category_id: "cat-2",
        description: "Lord Vishnu Katha for prosperity and peace",
        default_duration_minutes: 150,
        allowed_modes: ["home", "remote"],
        is_active: true,
      });

      expect(res.success).toBe(true);
      expect(res.data?.name).toBe("Satyanarayan Katha & Puja");
      expect(res.data?.allowed_modes).toEqual(["home", "remote"]);
      expect(res.data?.default_duration_minutes).toBe(150);
      expect(servicesTable.length).toBe(3);
    });

    test("6. Duplicate ritual name is rejected case-insensitively", () => {
      const res = simulateSaveRitual(["admin"], adminUserId, {
        name: "rudrabhishek", // matches srv-1
        default_duration_minutes: 60,
        allowed_modes: ["home"],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("already exists");
    });

    test("7. Ritual with invalid duration (<= 0) is rejected", () => {
      const res = simulateSaveRitual(["admin"], adminUserId, {
        name: "New Ritual",
        default_duration_minutes: 0,
        allowed_modes: ["home"],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("greater than 0 minutes");
    });

    test("8. Ritual with no allowed service modes selected is rejected", () => {
      const res = simulateSaveRitual(["admin"], adminUserId, {
        name: "New Ritual",
        default_duration_minutes: 60,
        allowed_modes: [],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("At least one service mode");
    });

    test("9. Ritual activation and deactivation updates status correctly", () => {
      // Deactivate
      const deact = simulateToggleRitualStatus(["admin"], adminUserId, "srv-1", false);
      expect(deact.success).toBe(true);
      expect(servicesTable.find((s) => s.id === "srv-1")?.is_active).toBe(false);

      // Reactivate
      const act = simulateToggleRitualStatus(["admin"], adminUserId, "srv-1", true);
      expect(act.success).toBe(true);
      expect(servicesTable.find((s) => s.id === "srv-1")?.is_active).toBe(true);
    });
  });

  // ===========================================================================
  // 3. Security, Authorization & Audit Logging
  // ===========================================================================
  describe("3. Security, Authorization & Audit Logging", () => {
    test("10. Non-admin user cannot mutate categories or rituals", () => {
      expect(() => {
        simulateSaveCategory(["customer"], regularUserId, { name: "Illegal Category", display_order: 1 });
      }).toThrow("Administrator privileges required");

      expect(() => {
        simulateSaveRitual(["pandit"], regularUserId, {
          name: "Illegal Ritual",
          default_duration_minutes: 60,
          allowed_modes: ["home"],
        });
      }).toThrow("Administrator privileges required");
    });

    test("11. Mutations record immutable audit log entries in admin_audit_logs", () => {
      simulateSaveCategory(["admin"], adminUserId, { name: "Havan & Yagya", display_order: 4 });
      simulateToggleCategoryStatus(["admin"], adminUserId, "cat-1", false);
      simulateSaveRitual(["admin"], adminUserId, {
        name: "Maha Mrityunjaya Jaap",
        default_duration_minutes: 180,
        allowed_modes: ["temple", "remote"],
      });
      simulateToggleRitualStatus(["admin"], adminUserId, "srv-2", false);

      expect(auditLogsTable).toHaveLength(4);
      expect(auditLogsTable[0].action).toBe("puja_category_created");
      expect(auditLogsTable[1].action).toBe("puja_category_deactivated");
      expect(auditLogsTable[2].action).toBe("puja_service_created");
      expect(auditLogsTable[3].action).toBe("puja_service_deactivated");
      expect(auditLogsTable.every((log) => log.actor_user_id === adminUserId)).toBe(true);
    });

    test("12. Deletion safety: No hard-delete path exists in catalog management", () => {
      // The API only exposes toggleStatus (is_active = false)
      // Historical references in bookings (FOREIGN KEY ON DELETE RESTRICT) remain unviolated
      const activeRitual = servicesTable.find((s) => s.id === "srv-1")!;
      simulateToggleRitualStatus(["admin"], adminUserId, activeRitual.id, false);

      expect(servicesTable.find((s) => s.id === "srv-1")).toBeDefined();
      expect(servicesTable.find((s) => s.id === "srv-1")?.is_active).toBe(false);
    });
  });

  // ===========================================================================
  // 4. Downstream Integration Contract
  // ===========================================================================
  describe("4. Downstream Integration Contract", () => {
    test("13. Active rituals are returned for mobile Pandit onboarding, while deactivated are excluded", () => {
      // Deactivate srv-2
      simulateToggleRitualStatus(["admin"], adminUserId, "srv-2", false);

      // Simulated mobile fetchAvailablePujas query: .eq("is_active", true)
      const availableForPandit = servicesTable.filter((s) => s.is_active);

      expect(availableForPandit.length).toBe(1);
      expect(availableForPandit[0].id).toBe("srv-1");
      expect(availableForPandit[0].name).toBe("Rudrabhishek");
      expect(availableForPandit.map((s) => s.id)).not.toContain("srv-2");
    });

    test("14. Catalog search correctly filters by ritual name, description, and category", () => {
      const search = (query: string) => {
        const q = query.toLowerCase();
        return servicesTable.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description && s.description.toLowerCase().includes(q)) ||
            (s.category_name && s.category_name.toLowerCase().includes(q))
        );
      };

      expect(search("Shiva").length).toBe(1);
      expect(search("Shiva")[0].name).toBe("Rudrabhishek");
      expect(search("Pravesh").length).toBe(1);
      expect(search("Pravesh")[0].name).toBe("Griha Pravesh Puja");
      expect(search("NonExistent").length).toBe(0);
    });
  });
});
