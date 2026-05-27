import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSlug } from "@/lib/leagues/slug";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Remove a member from a league.
 *
 *   - Self-leave: any member can remove themselves (userId === caller.id).
 *   - Owner kick: the league creator can remove any other member.
 *   - If the league creator self-leaves, the league becomes ownerless
 *     (created_by → null). Other members keep playing; nobody is admin.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; userId: string }> },
) {
  const { slug, userId } = await ctx.params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  if (!UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: "invalid user id" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const caller = authData.user;
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: league } = await admin
    .from("leagues")
    .select("id, created_by")
    .eq("slug", slug)
    .maybeSingle();

  if (!league) {
    return NextResponse.json({ error: "league not found" }, { status: 404 });
  }

  const isSelf = userId === caller.id;
  const isOwner = league.created_by === caller.id;
  if (!isSelf && !isOwner) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: deleteError, count } = await admin
    .from("league_members")
    .delete({ count: "exact" })
    .eq("league_id", league.id)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("/api/leagues/members DELETE failed:", deleteError);
    return NextResponse.json(
      { error: "could not remove member" },
      { status: 500 },
    );
  }
  if (!count) {
    return NextResponse.json(
      { error: "member not found" },
      { status: 404 },
    );
  }

  // If the league owner self-left, the league has no admin anymore.
  // Clear created_by so they can't reclaim ownership by rejoining.
  if (isSelf && league.created_by === caller.id) {
    const { error: clearError } = await admin
      .from("leagues")
      .update({ created_by: null })
      .eq("id", league.id);
    if (clearError) {
      console.error("/api/leagues/members owner-clear failed:", clearError);
      // The member was already removed; surface the partial-success state
      // with a 200 so the UI doesn't double-prompt.
    }
  }

  return NextResponse.json({ removed: userId });
}
