"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const handleGoogle = async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback },
    });
    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }
    // On success the browser navigates to Google's consent screen — there's
    // no resolved code path back here. Leave isLoading true so the button
    // stays disabled while the redirect kicks in.
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Use your Google account to play ranked rounds and join your friend
            leaderboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              className="w-full"
              onClick={handleGoogle}
              disabled={isLoading}
            >
              {isLoading ? "Redirecting…" : "Continue with Google"}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <p className="text-xs text-muted-foreground text-center">
              Practice mode doesn&apos;t need an account —{" "}
              <a
                href="/practice/classic"
                className="underline underline-offset-4 hover:text-foreground"
              >
                drill without signing in
              </a>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
