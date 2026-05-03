import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidSlug } from "@/lib/leagues/slug";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: league } = await admin
    .from("leagues")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!league) {
    return NextResponse.json({ error: "league not found" }, { status: 404 });
  }

  // Idempotent: re-joining is a no-op (composite PK collision is fine).
  const { error: insertError } = await admin
    .from("league_members")
    .upsert(
      { league_id: league.id, user_id: user.id },
      { onConflict: "league_id,user_id", ignoreDuplicates: true },
    );

  if (insertError) {
    console.error("/api/leagues/join insert failed:", insertError);
    return NextResponse.json(
      { error: "could not join league" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    league_id: league.id,
    slug: league.slug,
    name: league.name,
  });
}
