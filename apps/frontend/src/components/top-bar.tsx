import { LogOutIcon, PencilIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { signOut, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { Logo } from "./logo";
import { ThemeButton } from "./theme-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function TopBar({
  logoTo,
  children,
  end,
  wide,
  compact,
}: {
  logoTo?: string;
  /** Between the logo and the right-hand controls. */
  children?: ReactNode;
  /** Right-hand controls before the theme toggle. */
  end?: ReactNode;
  wide?: boolean;
  /** Below the small breakpoint the logo shows only its mark. */
  compact?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div
        className={cn(
          "mx-auto flex h-16 items-center gap-4 px-4 sm:px-6",
          wide ? "max-w-[1440px]" : "max-w-7xl lg:px-8",
        )}
      >
        <Logo to={logoTo} compact={compact} />
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        <div className="flex shrink-0 items-center gap-2">
          {end}
          <ThemeButton />
        </div>
      </div>
    </header>
  );
}

export function ProfileMenu() {
  const profile = useProfile();
  const navigate = useNavigate();
  if (!profile) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        aria-label="Your profile"
      >
        <Avatar seed={profile.avatarSeed} className="size-10" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex items-center gap-3">
          <Avatar seed={profile.avatarSeed} className="size-9" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{profile.name}</div>
            <div className="text-xs font-normal text-muted-foreground">
              Saved in this browser
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/welcome?edit=1")}>
          <PencilIcon /> Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem
          destructive
          onSelect={() => {
            signOut();
            navigate("/welcome");
          }}
        >
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
