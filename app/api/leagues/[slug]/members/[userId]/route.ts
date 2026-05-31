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
 *   - When the last member leaves, the empty league is deleted.
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

  // Owner self-leave: clear created_by FIRST, before removing the member, so
  // the "ownerless after the owner leaves" invariant can never be left
  // half-applied. If this fails we abort before deleting — an admin'd league
  // is recoverable; a removed owner whose created_by still points at them is a
  // reclaim-ownership-by-rejoining hole.
  if (isSelf && isOwner) {
    const { error: clearError } = await admin
      .from("leagues")
      .update({ created_by: null })
      .eq("id", league.id);
    if (clearError) {
      console.error("/api/leagues/members owner-clear failed:", clearError);
      return NextResponse.json(
        { error: "could not remove member" },
        { status: 500 },
      );
    }
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

  // Garbage-collect the league once its last member leaves, so empty,
  // ownerless leagues don't linger as zombies. Best-effort: the member is
  // already removed, so a cleanup failure must not fail the request.
  const { count: remaining } = await admin
    .from("league_members")
    .select("user_id", { count: "exact", head: true })
    .eq("league_id", league.id);
  if (remaining === 0) {
    const { error: leagueDeleteError } = await admin
      .from("leagues")
      .delete()
      .eq("id", league.id);
    if (leagueDeleteError) {
      console.error(
        "/api/leagues/members league-cleanup failed:",
        leagueDeleteError,
      );
    }
  }

  return NextResponse.json({ removed: userId });
}
