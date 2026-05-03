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
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogle = async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/competitive`,
      },
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
                href="/practice"
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
