import { NextResponse, type NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSlug } from "@/lib/leagues/slug";

const MAX_SLUG_RETRIES = 5;

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 64) {
    return NextResponse.json(
      { error: "name must be 1–64 characters" },
      { status: 400 },
    );
  }

  const supabase = await createServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Generate a fresh slug; retry on the (astronomically unlikely) collision.
  let inserted: { id: string; slug: string; name: string } | null = null;
  let lastError: unknown = null;
  for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
    const slug = generateSlug();
    const { data, error } = await admin
      .from("leagues")
      .insert({ slug, name, created_by: user.id })
      .select("id, slug, name")
      .single();
    if (!error && data) {
      inserted = data;
      break;
    }
    lastError = error;
    // 23505 = unique_violation. Anything else is a real failure.
    if (error?.code !== "23505") break;
  }

  if (!inserted) {
    console.error("/api/leagues/create insert failed:", lastError);
    return NextResponse.json(
      { error: "could not create league" },
      { status: 500 },
    );
  }

  // Add the creator as the first member. Service-role bypasses RLS.
  const { error: memberError } = await admin
    .from("league_members")
    .insert({ league_id: inserted.id, user_id: user.id });
  if (memberError) {
    console.error("/api/leagues/create membership failed:", memberError);
    // Best-effort cleanup so we don't orphan the league row.
    await admin.from("leagues").delete().eq("id", inserted.id);
    return NextResponse.json(
      { error: "could not create league" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    league_id: inserted.id,
    slug: inserted.slug,
    name: inserted.name,
  });
}
