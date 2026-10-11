import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/molla/theme-toggle";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/", replace: true });
  }

  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="mr-2 size-4" />
          Sign out
        </Button>
      </div>
      <div className="mt-3 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-primary">Molla</p>
        <h1 className="text-xl font-bold break-words text-foreground">{title}</h1>
        {subtitle ? <p className="text-sm break-words text-muted-foreground">{subtitle}</p> : null}
      </div>
    </header>
  );
}
