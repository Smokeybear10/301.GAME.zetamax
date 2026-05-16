-- League invite links need to render a preview (name + member count) for
-- signed-out visitors before the "Sign in to join" CTA. The RPC is
-- SECURITY DEFINER, read-only, and `is_member` collapses to false when
-- auth.uid() is null, so exposing it to anon leaks nothing the URL doesn't
-- already imply (the slug + name pairing).

GRANT EXECUTE ON FUNCTION public.get_league_preview(text) TO anon;
