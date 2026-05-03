import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Beacon endpoint. Called via navigator.sendBeacon when the daily drill page
 * is hidden / navigated away mid-round. Marks a still-pending daily run as
 * forfeited so the user can't reload and retry.
 *
 * Best-effort by design — failures are silent on the client. The 5-min cron
 * sweep is the source-of-truth backstop.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ run_id: string }> },
) {
  const { run_id } = await ctx.params;
  if (!run_id) {
    return NextResponse.json({ error: "missing run_id" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Atomic update: only flips pending → forfeited, and only on the caller's
  // own row. No-op (and no error) if already finalized.
  const { data: updated, error } = await admin
    .from("runs")
    .update({
      validation_status: "forfeited",
      completed_at: new Date().toISOString(),
    })
    .eq("id", run_id)
    .eq("user_id", user.id)
    .eq("mode", "daily")
    .eq("validation_status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("/api/runs/forfeit update failed:", error);
    return NextResponse.json({ error: "could not forfeit" }, { status: 500 });
  }

  return NextResponse.json({ forfeited: !!updated });
}
