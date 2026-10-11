import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workerEmail, pinPassword } from "@/lib/molla";

type StaffInput = {
  workerId: string;
  fullName: string;
  pin: string;
  role: "manager" | "worker";
};

function validate(input: StaffInput) {
  // Collapse spaces and drop anything that is not a letter, number, dash or underscore
  const workerId = (input.workerId ?? "").trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9_-]/g, "");
  const pin = (input.pin ?? "").trim();
  if (workerId.length < 2 || workerId.length > 20)
    throw new Error("Worker ID must be 2-20 letters or numbers (e.g. W001)");
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN must be 4-8 digits");
  if (input.role !== "manager" && input.role !== "worker") throw new Error("Unknown role");
  return { workerId, pin, fullName: input.fullName.trim() || workerId, role: input.role };
}

/** Tells the sign in screen whether any staff account exists yet. */
export const staffExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  return { exists: (count ?? 0) > 0 };
});

/** Creates the very first manager. Refuses once any staff account exists. */
export const bootstrapManager = createServerFn({ method: "POST" })
  .inputValidator((input: StaffInput) => input)
  .handler(async ({ data }) => {
    const { workerId, pin, fullName } = validate({ ...data, role: "manager" });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) > 0) throw new Error("Staff accounts already exist — ask a manager to add you");

    return createAccount(supabaseAdmin, { workerId, pin, fullName, role: "manager" });
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StaffInput) => input)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const clean = validate(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return createAccount(supabaseAdmin, clean);
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    if (data.userId === context.userId) throw new Error("You cannot remove your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetStaffPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; pin: string }) => input)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    if (!/^\d{4,8}$/.test(data.pin.trim())) throw new Error("PIN must be 4-8 digits");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: pinPassword(data.pin),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "manager" | "worker" }) => input)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function assertManager(context: { supabase: { rpc: unknown }; userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "manager")
    .maybeSingle();
  if (!data) throw new Error("Managers only");
}

async function createAccount(
  admin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  input: { workerId: string; pin: string; fullName: string; role: "manager" | "worker" },
) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: workerEmail(input.workerId),
    password: pinPassword(input.pin),
    email_confirm: true,
    user_metadata: { worker_id: input.workerId, full_name: input.fullName },
  });
  if (error || !created.user) throw new Error(error?.message ?? "Could not create that account");

  const userId = created.user.id;
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    worker_id: input.workerId.toUpperCase(),
    full_name: input.fullName,
    status: "active",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(
      profileError.code === "23505" ? "That Worker ID is already taken" : profileError.message,
    );
  }
  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: input.role });
  if (roleError) throw new Error(roleError.message);

  return { userId };
}
