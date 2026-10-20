const fs = require('fs');

const path = 'C:/Projects/kashi-veda-admin/lib/actions/astrology-management.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace saveAstrologyPlan
const oldPlanStart = content.indexOf('export async function saveAstrologyPlan(');
const oldPlanEnd = content.indexOf('// =============================================================================\n// 3. SUBSCRIPTIONS DIRECTORY & DETAIL');

if (oldPlanStart === -1 || oldPlanEnd === -1) {
  console.error('Could not find saveAstrologyPlan block');
  process.exit(1);
}

const newPlanBlock = `export async function saveAstrologyPlan(
  formData: AstrologyPlanFormData
): Promise<{ success: boolean; error?: string; data?: any }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const name = (formData.name || "").trim();
  if (name.length < 2) {
    return { success: false, error: "Plan name must be at least 2 characters." };
  }
  if (!formData.duration_days || formData.duration_days < 1) {
    return { success: false, error: "Duration must be at least 1 day." };
  }
  if (formData.price === undefined || formData.price < 0) {
    return { success: false, error: "Price cannot be negative." };
  }

  try {
    // AST-16: Execute authoritative atomic mutation and audit record in single database transaction
    const { data, error } = await supabase.rpc("admin_save_astrology_plan", {
      p_id: formData.id || null,
      p_name: name,
      p_duration_days: formData.duration_days,
      p_price: formData.price,
      p_currency: formData.currency || "INR",
      p_daily_in_app_enabled: formData.daily_in_app_enabled ?? true,
      p_weekly_whatsapp_enabled: formData.weekly_whatsapp_enabled ?? false,
      p_is_active: formData.is_active ?? true,
    });

    if (error) {
      console.error("Error in admin_save_astrology_plan:", error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || "Failed to save astrology plan." };
    }

    revalidatePath("/astrology");
    revalidatePath("/astrology/plans");
    return { success: true, data: data.plan };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save astrology plan.";
    return { success: false, error: message };
  }
}

`;

content = content.slice(0, oldPlanStart) + newPlanBlock + content.slice(oldPlanEnd);

// Replace saveAstrologyContent
const oldContentStart = content.indexOf('export async function saveAstrologyContent(');
const oldContentEnd = content.indexOf('// =============================================================================\n// 5. DELIVERIES JOURNAL & RETRY');

if (oldContentStart === -1 || oldContentEnd === -1) {
  console.error('Could not find saveAstrologyContent block');
  process.exit(1);
}

const newContentBlock = `export async function saveAstrologyContent(
  formData: AstrologyContentFormData
): Promise<{ success: boolean; error?: string; data?: any }> {
  const supabase = await createClient();
  await requireAdmin(supabase);

  const body = (formData.body || "").trim();
  if (body.length < 5) {
    return { success: false, error: "Content body must be at least 5 characters." };
  }
  if (!formData.publish_at) {
    return { success: false, error: "Publish date and time is required." };
  }
  if (formData.expires_at && new Date(formData.expires_at) <= new Date(formData.publish_at)) {
    return { success: false, error: "Expiration date and time must be strictly after the publication date and time." };
  }

  try {
    // AST-16: Execute authoritative atomic mutation and audit record in single database transaction
    const { data, error } = await supabase.rpc("admin_save_astrology_content", {
      p_id: formData.id || null,
      p_channel: formData.channel,
      p_title: formData.title ? formData.title.trim() : null,
      p_body: body,
      p_publish_at: formData.publish_at,
      p_expires_at: formData.expires_at || null,
      p_status: formData.status,
    });

    if (error) {
      console.error("Error in admin_save_astrology_content:", error.message);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || "Failed to save astrology content." };
    }

    revalidatePath("/astrology");
    revalidatePath("/astrology/content");
    return { success: true, data: data.content };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save astrology content.";
    return { success: false, error: message };
  }
}

`;

content = content.slice(0, oldContentStart) + newContentBlock + content.slice(oldContentEnd);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated lib/actions/astrology-management.ts with atomic RPC calls');
