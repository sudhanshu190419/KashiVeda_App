const fs = require('fs');
const path = require('path');

const adminDir = 'C:/Projects/kashi-veda-admin';

// 1. types
const typesContent = `export interface SamagriItem {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  is_active: boolean;
  package_count?: number;
}

export interface SamagriItemFormData {
  id?: string;
  name: string;
  description?: string | null;
  unit: string;
  unit_price: number;
  is_active?: boolean;
}

export interface SamagriPackageItemMapping {
  samagri_item_id: string;
  quantity: number;
}

export interface SamagriPackageItemDetail {
  id?: string;
  quantity: number;
  item: SamagriItem;
}

export interface SamagriPackage {
  id: string;
  puja_service_id: string;
  puja_service_name?: string;
  name: string;
  description: string | null;
  is_active: boolean;
  items: SamagriPackageItemDetail[];
  total_items_count: number;
  calculated_package_price: number;
}

export interface SamagriPackageFormData {
  id?: string;
  puja_service_id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  items: SamagriPackageItemMapping[];
}

export interface SamagriCatalogOverviewData {
  items: SamagriItem[];
  packages: SamagriPackage[];
  pujaServices: { id: string; name: string }[];
  totalItems: number;
  activeItems: number;
  totalPackages: number;
  activePackages: number;
}
`;

// 2. actions
const actionsContent = `/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import type {
  SamagriItem,
  SamagriItemFormData,
  SamagriPackage,
  SamagriPackageFormData,
  SamagriCatalogOverviewData,
} from "@/lib/types/samagri-catalog";

function extractSingle<T>(val: T | T[] | null | undefined): T | null {
  if (Array.isArray(val)) {
    return val[0] || null;
  }
  return val || null;
}

/**
 * Fetches complete Samagri overview data (Master Catalog Items, Ritual Packages & Puja Services)
 */
export async function getSamagriCatalogData(): Promise<SamagriCatalogOverviewData> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  // 1. Fetch all samagri catalog items
  const { data: itemsRaw, error: itemsError } = await supabase
    .from("samagri_items")
    .select("id, name, description, unit, unit_price, is_active")
    .order("name", { ascending: true });

  if (itemsError) {
    console.error("Error fetching samagri_items:", itemsError);
  }

  // 2. Fetch all packages with nested items and puja service name
  const { data: packagesRaw, error: pkgError } = await supabase
    .from("samagri_packages")
    .select(\`
      id,
      puja_service_id,
      name,
      description,
      is_active,
      puja_service:puja_services(id, name),
      package_items:samagri_package_items(
        quantity,
        item:samagri_items(id, name, description, unit, unit_price, is_active)
      )
    \`)
    .order("name", { ascending: true });

  if (pkgError) {
    console.error("Error fetching samagri_packages:", pkgError);
  }

  // 3. Fetch active puja services list for package assignment dropdown
  const { data: pujaServicesRaw, error: srvError } = await supabase
    .from("puja_services")
    .select("id, name")
    .order("name", { ascending: true });

  if (srvError) {
    console.error("Error fetching puja_services for samagri packages:", srvError);
  }

  // Count package usage per samagri item
  const itemUsageMap = new Map<string, number>();
  ((packagesRaw as any[]) || []).forEach((pkg) => {
    (pkg.package_items || []).forEach((pi: any) => {
      const itemId = pi.item?.id;
      if (itemId) {
        itemUsageMap.set(itemId, (itemUsageMap.get(itemId) || 0) + 1);
      }
    });
  });

  const items: SamagriItem[] = ((itemsRaw as any[]) || []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit || "unit",
    unit_price: Number(row.unit_price) || 0,
    is_active: row.is_active,
    package_count: itemUsageMap.get(row.id) || 0,
  }));

  const packages: SamagriPackage[] = ((packagesRaw as any[]) || []).map((pkg) => {
    const pujaServiceObj = extractSingle(pkg.puja_service);
    const rawItems = (pkg.package_items || []) as any[];

    const mappedItems = rawItems
      .filter((pi) => pi.item != null)
      .map((pi) => {
        const itemObj = extractSingle(pi.item);
        return {
          quantity: Number(pi.quantity) || 1,
          item: {
            id: itemObj?.id || "",
            name: itemObj?.name || "Item",
            description: itemObj?.description || null,
            unit: itemObj?.unit || "unit",
            unit_price: Number(itemObj?.unit_price) || 0,
            is_active: itemObj?.is_active ?? true,
          },
        };
      });

    const calculatedPrice = mappedItems.reduce(
      (sum, pi) => sum + pi.quantity * (pi.item.unit_price || 0),
      0
    );

    return {
      id: pkg.id,
      puja_service_id: pkg.puja_service_id,
      puja_service_name: pujaServiceObj?.name || "Unassigned Ritual",
      name: pkg.name,
      description: pkg.description,
      is_active: pkg.is_active,
      items: mappedItems,
      total_items_count: mappedItems.length,
      calculated_package_price: calculatedPrice,
    };
  });

  const pujaServices = ((pujaServicesRaw as any[]) || []).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  return {
    items,
    packages,
    pujaServices,
    totalItems: items.length,
    activeItems: items.filter((i) => i.is_active).length,
    totalPackages: packages.length,
    activePackages: packages.filter((p) => p.is_active).length,
  };
}

/**
 * Creates or updates a Master Samagri Item in public.samagri_items
 */
export async function saveSamagriItem(
  formData: SamagriItemFormData
): Promise<{ success: boolean; error?: string; data?: any }> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  const name = (formData.name || "").trim();
  if (name.length < 2) {
    return { success: false, error: "Item name must be at least 2 characters." };
  }

  const unit = (formData.unit || "").trim();
  if (unit.length < 1) {
    return { success: false, error: "Measurement unit is required (e.g. kg, litre, pack, piece, box)." };
  }

  const unitPrice = Number(formData.unit_price);
  if (isNaN(unitPrice) || unitPrice < 0) {
    return { success: false, error: "Unit price must be a valid non-negative number." };
  }

  try {
    // Check for duplicate name
    let query = supabase.from("samagri_items").select("id").ilike("name", name);
    if (formData.id) {
      query = query.neq("id", formData.id);
    }
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      return { success: false, error: 'A samagri item named "' + name + '" already exists.' };
    }

    const payload = {
      name,
      description: formData.description?.trim() || null,
      unit,
      unit_price: unitPrice,
      is_active: formData.is_active !== undefined ? formData.is_active : true,
    };

    if (formData.id) {
      // Update
      const { data, error } = await supabase
        .from("samagri_items")
        .update(payload)
        .eq("id", formData.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      await supabase.from("admin_audit_logs").insert({
        actor_user_id: adminUser.id,
        action: "samagri_item_updated",
        entity_type: "samagri_items",
        entity_id: formData.id,
        details: {
          name,
          unit,
          unit_price: unitPrice,
          is_active: formData.is_active,
        },
      });

      revalidatePath("/samagri");
      return { success: true, data };
    } else {
      // Create
      const { data, error } = await supabase
        .from("samagri_items")
        .insert(payload)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      await supabase.from("admin_audit_logs").insert({
        actor_user_id: adminUser.id,
        action: "samagri_item_created",
        entity_type: "samagri_items",
        entity_id: data.id,
        details: {
          name,
          unit,
          unit_price: unitPrice,
          is_active: data.is_active,
        },
      });

      revalidatePath("/samagri");
      return { success: true, data };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save samagri item." };
  }
}

/**
 * Toggles the active status of a Samagri Item
 */
export async function toggleSamagriItemStatus(
  itemId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  try {
    const { error } = await supabase
      .from("samagri_items")
      .update({ is_active: isActive })
      .eq("id", itemId);

    if (error) {
      return { success: false, error: error.message };
    }

    await supabase.from("admin_audit_logs").insert({
      actor_user_id: adminUser.id,
      action: isActive ? "samagri_item_activated" : "samagri_item_deactivated",
      entity_type: "samagri_items",
      entity_id: itemId,
      details: { new_status: isActive },
    });

    revalidatePath("/samagri");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update item status." };
  }
}

/**
 * Creates or updates a Ritual Samagri Package and its package items
 */
export async function saveSamagriPackage(
  formData: SamagriPackageFormData
): Promise<{ success: boolean; error?: string; data?: any }> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

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

  try {
    let packageId = formData.id;

    if (packageId) {
      // Update existing package header
      const { error: updateErr } = await supabase
        .from("samagri_packages")
        .update({
          name,
          puja_service_id: formData.puja_service_id,
          description: formData.description?.trim() || null,
          is_active: formData.is_active !== undefined ? formData.is_active : true,
        })
        .eq("id", packageId);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      // Replace package items
      const { error: delErr } = await supabase
        .from("samagri_package_items")
        .delete()
        .eq("package_id", packageId);

      if (delErr) {
        return { success: false, error: delErr.message };
      }
    } else {
      // Create new package header
      const { data: newPkg, error: createErr } = await supabase
        .from("samagri_packages")
        .insert({
          name,
          puja_service_id: formData.puja_service_id,
          description: formData.description?.trim() || null,
          is_active: formData.is_active !== undefined ? formData.is_active : true,
        })
        .select()
        .single();

      if (createErr || !newPkg) {
        return { success: false, error: createErr?.message || "Failed to create package header." };
      }

      packageId = newPkg.id;
    }

    // Insert new package item mappings
    const itemRows = items.map((i) => ({
      package_id: packageId,
      samagri_item_id: i.samagri_item_id,
      quantity: i.quantity,
    }));

    const { error: itemsInsertErr } = await supabase
      .from("samagri_package_items")
      .insert(itemRows);

    if (itemsInsertErr) {
      return { success: false, error: itemsInsertErr.message };
    }

    await supabase.from("admin_audit_logs").insert({
      actor_user_id: adminUser.id,
      action: formData.id ? "samagri_package_updated" : "samagri_package_created",
      entity_type: "samagri_packages",
      entity_id: packageId,
      details: {
        name,
        puja_service_id: formData.puja_service_id,
        items_count: items.length,
      },
    });

    revalidatePath("/samagri");
    return { success: true, data: { id: packageId } };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save ritual package." };
  }
}

/**
 * Toggles the active status of a Ritual Samagri Package
 */
export async function toggleSamagriPackageStatus(
  packageId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const adminUser = await requireAdmin(supabase);

  try {
    const { error } = await supabase
      .from("samagri_packages")
      .update({ is_active: isActive })
      .eq("id", packageId);

    if (error) {
      return { success: false, error: error.message };
    }

    await supabase.from("admin_audit_logs").insert({
      actor_user_id: adminUser.id,
      action: isActive ? "samagri_package_activated" : "samagri_package_deactivated",
      entity_type: "samagri_packages",
      entity_id: packageId,
      details: { new_status: isActive },
    });

    revalidatePath("/samagri");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update package status." };
  }
}
`;

// 3. item-form-modal
const itemModalContent = `"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { saveSamagriItem } from "@/lib/actions/samagri-catalog-management";
import type { SamagriItem } from "@/lib/types/samagri-catalog";
import { Loader2, X, Package, AlertCircle } from "lucide-react";

interface ItemFormModalProps {
  item?: SamagriItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const UNIT_PRESETS = ["kg", "gm", "litre", "ml", "pack", "box", "piece", "bunch", "bottle"];

export function ItemFormModal({
  item,
  isOpen,
  onClose,
  onSuccess,
}: ItemFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("piece");
  const [unitPrice, setUnitPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || "");
      setUnit(item.unit || "piece");
      setUnitPrice(String(item.unit_price ?? 0));
      setIsActive(item.is_active);
    } else {
      setName("");
      setDescription("");
      setUnit("piece");
      setUnitPrice("0");
      setIsActive(true);
    }
    setError(null);
  }, [item, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Item name is required.");
      return;
    }

    if (!unit.trim()) {
      setError("Measurement unit is required.");
      return;
    }

    const priceNum = Number(unitPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Unit price must be a valid non-negative number.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await saveSamagriItem({
      id: item?.id,
      name: name.trim(),
      description: description.trim() || null,
      unit: unit.trim().toLowerCase(),
      unit_price: priceNum,
      is_active: isActive,
    });

    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || "Failed to save samagri item.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-lg border-border bg-card shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {item ? "Edit Samagri Item" : "Create Master Samagri Item"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Catalog item for Custom Items selection and Ritual Packages
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-4 max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Item Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pure Desi Cow Ghee, Brahmakund Gangajal"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Quality specifications, ritual usage, or Vedic sourcing details..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Unit Price (INR) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  required
                />
                <span className="text-[11px] text-muted-foreground mt-0.5 block">
                  Authoritative base price in INR
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Measurement Unit *
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. kg, litre, pack"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {UNIT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setUnit(p)}
                      className={\`text-[10px] px-1.5 py-0.5 rounded border transition-colors \${
                        unit.toLowerCase() === p
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                      }\`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Lifecycle Status
              </label>
              <div className="flex items-center gap-2 h-9">
                <input
                  type="checkbox"
                  id="item_is_active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <label htmlFor="item_is_active" className="text-sm font-medium text-foreground cursor-pointer">
                  {isActive ? "Active (Available for Devotee custom selection & packages)" : "Inactive (Hidden from mobile catalog)"}
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {item ? "Save Changes" : "Create Item"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`;

// 4. package-form-modal
const packageModalContent = `"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { saveSamagriPackage } from "@/lib/actions/samagri-catalog-management";
import type {
  SamagriPackage,
  SamagriItem,
  SamagriPackageItemMapping,
} from "@/lib/types/samagri-catalog";
import { Loader2, X, Layers, AlertCircle, Plus, Trash2, Calculator } from "lucide-react";

interface PackageFormModalProps {
  pkg?: SamagriPackage | null;
  catalogItems: SamagriItem[];
  pujaServices: { id: string; name: string }[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PackageFormModal({
  pkg,
  catalogItems,
  pujaServices,
  isOpen,
  onClose,
  onSuccess,
}: PackageFormModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pujaServiceId, setPujaServiceId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedItems, setSelectedItems] = useState<SamagriPackageItemMapping[]>([]);
  const [itemToAddId, setItemToAddId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pkg) {
      setName(pkg.name);
      setDescription(pkg.description || "");
      setPujaServiceId(pkg.puja_service_id || "");
      setIsActive(pkg.is_active);
      setSelectedItems(
        (pkg.items || []).map((pi) => ({
          samagri_item_id: pi.item.id,
          quantity: pi.quantity,
        }))
      );
    } else {
      setName("");
      setDescription("");
      setPujaServiceId(pujaServices[0]?.id || "");
      setIsActive(true);
      setSelectedItems([]);
    }
    setItemToAddId("");
    setError(null);
  }, [pkg, pujaServices, isOpen]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    if (!itemToAddId) return;
    const existingIndex = selectedItems.findIndex((i) => i.samagri_item_id === itemToAddId);
    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
      setSelectedItems(updated);
    } else {
      setSelectedItems([...selectedItems, { samagri_item_id: itemToAddId, quantity: 1 }]);
    }
    setItemToAddId("");
  };

  const handleUpdateQuantity = (itemId: string, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setSelectedItems(
      selectedItems.map((i) =>
        i.samagri_item_id === itemId ? { ...i, quantity: qty } : i
      )
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((i) => i.samagri_item_id !== itemId));
  };

  // Calculate estimated total
  const estimatedPrice = selectedItems.reduce((sum, si) => {
    const item = catalogItems.find((ci) => ci.id === si.samagri_item_id);
    return sum + (item?.unit_price || 0) * si.quantity;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Package name is required.");
      return;
    }

    if (!pujaServiceId) {
      setError("Please select an associated Puja Service.");
      return;
    }

    if (selectedItems.length === 0) {
      setError("At least one catalog item must be added to the package.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await saveSamagriPackage({
      id: pkg?.id,
      name: name.trim(),
      puja_service_id: pujaServiceId,
      description: description.trim() || null,
      is_active: isActive,
      items: selectedItems,
    });

    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || "Failed to save ritual package.");
    }
  };

  const availableItemsToAdd = catalogItems.filter(
    (ci) => !selectedItems.some((si) => si.samagri_item_id === ci.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl border-border bg-card shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                {pkg ? "Edit Ritual Package" : "Create Ritual Samagri Package"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Predefined bundled samagri offering attached to a sacred puja service
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-4 max-h-[82vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Package Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Complete Shodashopachara Samagri"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Assigned Puja Service *
                </label>
                <select
                  value={pujaServiceId}
                  onChange={(e) => setPujaServiceId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">-- Select Ritual / Puja Service --</option>
                  {pujaServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details of Vedic items included, purity standards, or special offerings..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Package Items Section */}
            <div className="border border-border/80 rounded-lg p-3 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    Included Items & Quantities ({selectedItems.length})
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Select items from master catalog to bundle in this package
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-md border border-primary/20 text-xs font-semibold text-primary">
                  <Calculator className="h-3.5 w-3.5" />
                  <span>Est. Package Total: ₹{estimatedPrice.toFixed(2)}</span>
                </div>
              </div>

              {/* Add item picker */}
              <div className="flex gap-2">
                <select
                  value={itemToAddId}
                  onChange={(e) => setItemToAddId(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">-- Choose item from catalog to add --</option>
                  {availableItemsToAdd.map((ci) => (
                    <option key={ci.id} value={ci.id}>
                      {ci.name} (₹{ci.unit_price} / {ci.unit}) {!ci.is_active ? "[Inactive]" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddItem}
                  disabled={!itemToAddId}
                  className="gap-1 text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add to Package
                </Button>
              </div>

              {/* Selected items list */}
              {selectedItems.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-md">
                  No items added yet. Use the dropdown above to add items to this package.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {selectedItems.map((si) => {
                    const item = catalogItems.find((ci) => ci.id === si.samagri_item_id);
                    const subtotal = (item?.unit_price || 0) * si.quantity;

                    return (
                      <div
                        key={si.samagri_item_id}
                        className="flex items-center justify-between gap-3 p-2 rounded-md bg-background border border-border text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground truncate block">
                            {item?.name || "Unknown Item"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            ₹{item?.unit_price || 0} per {item?.unit || "unit"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-muted-foreground">Qty:</label>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={si.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(si.samagri_item_id, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 rounded border border-input bg-background px-2 py-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span className="text-[11px] text-muted-foreground w-12 truncate">
                            {item?.unit || "unit"}
                          </span>
                        </div>

                        <div className="w-20 text-right font-mono font-medium text-foreground">
                          ₹{subtotal.toFixed(2)}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(si.samagri_item_id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Lifecycle Status
              </label>
              <div className="flex items-center gap-2 h-9">
                <input
                  type="checkbox"
                  id="pkg_is_active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <label htmlFor="pkg_is_active" className="text-sm font-medium text-foreground cursor-pointer">
                  {isActive ? "Active (Visible for Devotee package selection)" : "Inactive (Hidden from booking options)"}
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {pkg ? "Save Changes" : "Create Package"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
`;

// 5. samagri-catalog-view
const viewContent = `"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ItemFormModal } from "./modals/item-form-modal";
import { PackageFormModal } from "./modals/package-form-modal";
import {
  toggleSamagriItemStatus,
  toggleSamagriPackageStatus,
} from "@/lib/actions/samagri-catalog-management";
import type {
  SamagriCatalogOverviewData,
  SamagriItem,
  SamagriPackage,
} from "@/lib/types/samagri-catalog";
import {
  Package,
  Layers,
  Plus,
  Edit,
  Power,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Scroll,
} from "lucide-react";

interface SamagriCatalogViewProps {
  data: SamagriCatalogOverviewData;
}

export function SamagriCatalogView({ data }: SamagriCatalogViewProps) {
  const [activeTab, setActiveTab] = useState<"items" | "packages">("items");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [selectedPujaFilter, setSelectedPujaFilter] = useState<string>("all");

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SamagriItem | null>(null);

  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<SamagriPackage | null>(null);

  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filtered Items
  const filteredItems = data.items.filter((item) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      item.unit.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      selectedStatusFilter === "all" ||
      (selectedStatusFilter === "active" && item.is_active) ||
      (selectedStatusFilter === "inactive" && !item.is_active);

    return matchesSearch && matchesStatus;
  });

  // Filtered Packages
  const filteredPackages = data.packages.filter((pkg) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (pkg.description && pkg.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (pkg.puja_service_name && pkg.puja_service_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      pkg.items.some((pi) => pi.item.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      selectedStatusFilter === "all" ||
      (selectedStatusFilter === "active" && pkg.is_active) ||
      (selectedStatusFilter === "inactive" && !pkg.is_active);

    const matchesPuja =
      selectedPujaFilter === "all" || pkg.puja_service_id === selectedPujaFilter;

    return matchesSearch && matchesStatus && matchesPuja;
  });

  const handleToggleItemStatus = async (item: SamagriItem) => {
    const nextState = !item.is_active;
    const confirmMsg = nextState
      ? 'Activate "' + item.name + '"? It will become visible in the mobile app Custom Items list.'
      : 'Deactivate "' + item.name + '"? It will be hidden from new customer selections while preserving all past booking records and package mappings.';

    if (!window.confirm(confirmMsg)) return;

    setProcessingId(item.id);
    await toggleSamagriItemStatus(item.id, nextState);
    setProcessingId(null);
  };

  const handleTogglePackageStatus = async (pkg: SamagriPackage) => {
    const nextState = !pkg.is_active;
    const confirmMsg = nextState
      ? 'Activate package "' + pkg.name + '"? It will appear as a selectable Ritual Package for devotees.'
      : 'Deactivate package "' + pkg.name + '"? It will be hidden from future booking options.';

    if (!window.confirm(confirmMsg)) return;

    setProcessingId(pkg.id);
    await toggleSamagriPackageStatus(pkg.id, nextState);
    setProcessingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Package className="h-6 w-6 text-primary" />
            Samagri Master Catalog
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage Vedic sacred ingredients, unit pricing, and puja ritual packages
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "items" ? (
            <Button
              onClick={() => {
                setSelectedItem(null);
                setIsItemModalOpen(true);
              }}
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Catalog Item
            </Button>
          ) : (
            <Button
              onClick={() => {
                setSelectedPackage(null);
                setIsPackageModalOpen(true);
              }}
              className="gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Create Ritual Package
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Catalog Items
            </span>
            <div className="text-2xl font-bold text-foreground mt-1 font-mono">
              {data.totalItems}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Items (Mobile)
            </span>
            <div className="text-2xl font-bold text-emerald-600 mt-1 font-mono flex items-center gap-1.5">
              <CheckCircle2 className="h-5 w-5" />
              {data.activeItems}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ritual Packages
            </span>
            <div className="text-2xl font-bold text-foreground mt-1 font-mono">
              {data.totalPackages}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardContent className="p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Packages
            </span>
            <div className="text-2xl font-bold text-primary mt-1 font-mono">
              {data.activePackages}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("items")}
          className={\`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors \${
            activeTab === "items"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }\`}
        >
          <Package className="h-4 w-4" />
          Master Catalog Items
          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
            {data.totalItems}
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab("packages")}
          className={\`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors \${
            activeTab === "packages"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }\`}
        >
          <Layers className="h-4 w-4" />
          Ritual Packages
          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
            {data.totalPackages}
          </Badge>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={
              activeTab === "items"
                ? "Search by item name, description, unit..."
                : "Search by package name, ritual, included items..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <select
          value={selectedStatusFilter}
          onChange={(e) => setSelectedStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>

        {activeTab === "packages" && (
          <select
            value={selectedPujaFilter}
            onChange={(e) => setSelectedPujaFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-xs truncate"
          >
            <option value="all">All Associated Rituals</option>
            {data.pujaServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* TAB 1: MASTER CATALOG ITEMS */}
      {activeTab === "items" && (
        <Card className="border-border bg-card shadow-sm overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Package className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-base font-semibold text-foreground">No Catalog Items Found</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {searchTerm || selectedStatusFilter !== "all"
                  ? "No catalog items matched your filter criteria."
                  : "The Samagri master catalog is currently empty. Click 'Add Catalog Item' to create sacred items like Ghee, Gangajal, Dhoop, and Roli."}
              </p>
              {!searchTerm && selectedStatusFilter === "all" && (
                <Button
                  onClick={() => {
                    setSelectedItem(null);
                    setIsItemModalOpen(true);
                  }}
                  size="sm"
                  className="gap-2 mt-2"
                >
                  <Plus className="h-4 w-4" />
                  Add First Catalog Item
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Item Name & Description</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4">Unit Price</th>
                    <th className="py-3 px-4 text-center">Package Usages</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item) => {
                    const isProcessing = processingId === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3.5 px-4 max-w-md">
                          <div className="font-semibold text-foreground">{item.name}</div>
                          {item.description ? (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {item.description}
                            </p>
                          ) : null}
                        </td>

                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="font-mono text-xs capitalize">
                            {item.unit}
                          </Badge>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-foreground">
                          ₹{item.unit_price.toFixed(2)}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono text-xs">
                          {item.package_count ? (
                            <Badge variant="secondary" className="text-[11px]">
                              {item.package_count} pkgs
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {item.is_active ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                              Inactive
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedItem(item);
                                setIsItemModalOpen(true);
                              }}
                              className="h-8 px-2.5 text-xs gap-1"
                              title="Edit item details"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleItemStatus(item)}
                              disabled={isProcessing}
                              className={\`h-8 px-2.5 text-xs gap-1 \${
                                item.is_active
                                  ? "text-muted-foreground hover:text-destructive"
                                  : "text-emerald-600 hover:text-emerald-700"
                              }\`}
                              title={item.is_active ? "Deactivate item" : "Activate item"}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                              {item.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: RITUAL PACKAGES */}
      {activeTab === "packages" && (
        <Card className="border-border bg-card shadow-sm overflow-hidden">
          {filteredPackages.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-base font-semibold text-foreground">No Ritual Packages Found</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {searchTerm || selectedStatusFilter !== "all" || selectedPujaFilter !== "all"
                  ? "No ritual packages matched your search filters."
                  : "No predefined ritual packages created yet. Click 'Create Ritual Package' to bundle items for specific rituals like Rudrabhishek or Griha Pravesh."}
              </p>
              {!searchTerm && selectedStatusFilter === "all" && selectedPujaFilter === "all" && (
                <Button
                  onClick={() => {
                    setSelectedPackage(null);
                    setIsPackageModalOpen(true);
                  }}
                  size="sm"
                  className="gap-2 mt-2"
                >
                  <Plus className="h-4 w-4" />
                  Create First Package
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 border-b border-border text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Package Name & Details</th>
                    <th className="py-3 px-4">Associated Ritual</th>
                    <th className="py-3 px-4">Included Items Preview</th>
                    <th className="py-3 px-4">Calculated Price</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredPackages.map((pkg) => {
                    const isProcessing = processingId === pkg.id;
                    return (
                      <tr key={pkg.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-semibold text-foreground">{pkg.name}</div>
                          {pkg.description ? (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {pkg.description}
                            </p>
                          ) : null}
                        </td>

                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-xs gap-1 font-medium bg-muted/30">
                            <Scroll className="h-3 w-3 text-primary shrink-0" />
                            <span className="truncate max-w-[160px]">{pkg.puja_service_name}</span>
                          </Badge>
                        </td>

                        <td className="py-3.5 px-4 max-w-md">
                          <div className="flex flex-wrap gap-1">
                            {pkg.items.slice(0, 3).map((pi, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="text-[11px] font-normal"
                              >
                                {pi.item.name} ({pi.quantity} {pi.item.unit})
                              </Badge>
                            ))}
                            {pkg.items.length > 3 && (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                +{pkg.items.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-semibold text-foreground">
                          ₹{pkg.calculated_package_price.toFixed(2)}
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          {pkg.is_active ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground border-border text-xs">
                              Inactive
                            </Badge>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedPackage(pkg);
                                setIsPackageModalOpen(true);
                              }}
                              className="h-8 px-2.5 text-xs gap-1"
                              title="Edit package details"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              Edit
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTogglePackageStatus(pkg)}
                              disabled={isProcessing}
                              className={\`h-8 px-2.5 text-xs gap-1 \${
                                pkg.is_active
                                  ? "text-muted-foreground hover:text-destructive"
                                  : "text-emerald-600 hover:text-emerald-700"
                              }\`}
                              title={pkg.is_active ? "Deactivate package" : "Activate package"}
                            >
                              {isProcessing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                              {pkg.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Form Modals */}
      <ItemFormModal
        item={selectedItem}
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSuccess={() => {}}
      />

      <PackageFormModal
        pkg={selectedPackage}
        catalogItems={data.items}
        pujaServices={data.pujaServices}
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
}
`;

// 6. samagri page
const pageContent = `import { Suspense } from "react";
import { getSamagriCatalogData } from "@/lib/actions/samagri-catalog-management";
import { SamagriCatalogView } from "@/components/admin/samagri/samagri-catalog-view";

export const metadata = {
  title: "Samagri Catalog & Packages | Kashi Veda Admin",
  description: "Master catalog management for Vedic samagri items, pricing, and ritual packages.",
};

export default async function SamagriPage() {
  const data = await getSamagriCatalogData();

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading Samagri Master Catalog...
        </div>
      }
    >
      <SamagriCatalogView data={data} />
    </Suspense>
  );
}
`;

// Write all files with strict UTF-8
fs.writeFileSync(path.join(adminDir, 'lib/types/samagri-catalog.ts'), typesContent, 'utf8');
fs.writeFileSync(path.join(adminDir, 'lib/actions/samagri-catalog-management.ts'), actionsContent, 'utf8');
fs.writeFileSync(path.join(adminDir, 'components/admin/samagri/modals/item-form-modal.tsx'), itemModalContent, 'utf8');
fs.writeFileSync(path.join(adminDir, 'components/admin/samagri/modals/package-form-modal.tsx'), packageModalContent, 'utf8');
fs.writeFileSync(path.join(adminDir, 'components/admin/samagri/samagri-catalog-view.tsx'), viewContent, 'utf8');
fs.writeFileSync(path.join(adminDir, 'app/(dashboard)/samagri/page.tsx'), pageContent, 'utf8');

console.log('All files successfully written in UTF-8.');
