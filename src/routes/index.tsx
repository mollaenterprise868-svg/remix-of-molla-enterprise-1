import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import mollaLogoUrl from "@/assets/molla-logo.jpg";
import { ThemeToggle } from "@/components/molla/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { pinPassword, workerEmail } from "@/lib/molla";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Molla Enterprise Till System" },
      {
        name: "description",
        content:
          "Staff sign in for Molla Enterprise. One secure sign in that opens the till or the manager dashboard based on your role.",
      },
      { property: "og:title", content: "Sign in — Molla Enterprise Till System" },
      {
        property: "og:description",
        content: "Secure till and stock control sign in for Molla Enterprise staff.",
      },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void routeByRole();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeByRole() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isManager = (roles ?? []).some((r) => r.role === "manager");
    await navigate({ to: isManager ? "/manager" : "/till", replace: true });
  }

  async function onSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const id = identifier.trim();
    const asEmail = id.includes("@");
    const { error } = await supabase.auth.signInWithPassword({
      email: asEmail ? id.toLowerCase() : workerEmail(id),
      password: asEmail ? secret : pinPassword(secret),
    });
    setBusy(false);
    if (error) {
      toast.error("Those sign in details are not correct");
      return;
    }
    toast.success("Welcome back");
    void routeByRole();
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-5 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <header className="text-center">
        <img
          src={mollaLogo.url}
          alt="Molla Enterprise logo"
          className="mx-auto mb-4 size-20 rounded-2xl object-cover"
        />
        <h1 className="mt-2 text-3xl font-bold text-foreground">Molla Enterprise Till System</h1>
      </header>

      <div className="panel w-full max-w-md p-6">
        <form onSubmit={onSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">Worker ID</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. W001"
              autoComplete="username"
              maxLength={20}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="secret">PIN</Label>
            <Input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="••••"
              autoComplete="current-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
