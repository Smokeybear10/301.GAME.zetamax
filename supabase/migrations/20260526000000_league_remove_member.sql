-- Zetamax — league member removal
--
-- Adds `is_owner` to get_league_preview so the client can show
-- owner-only controls (the × kick button on other members' rows).
-- The actual DELETE happens through a server route handler with the
-- admin client; RLS is unchanged because nothing client-direct deletes.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.get_league_preview(league_slug text)
RETURNS TABLE(
  league_id uuid,
  name text,
  member_count integer,
  is_member boolean,
  is_owner boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    l.id,
    l.name,
    (SELECT count(*)::int FROM public.league_members WHERE league_id = l.id),
    EXISTS (
      SELECT 1 FROM public.league_members
      WHERE league_id = l.id AND user_id = auth.uid()
    ),
    (l.created_by IS NOT NULL AND l.created_by = auth.uid())
  FROM public.leagues l
  WHERE l.slug = league_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_preview(text) TO authenticated;
