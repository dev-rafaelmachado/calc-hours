"use client"

import { LogOut } from "lucide-react"

import { signOut } from "@/app/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenuButton({ email, compact }: { email: string; compact: boolean }) {
  const initial = email.charAt(0).toUpperCase()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={compact ? "size-8 rounded-full p-0" : "h-9 min-w-0 flex-1 justify-start gap-2 px-2"}
          />
        }
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initial}
        </span>
        {!compact && <span className="truncate text-xs text-muted-foreground">{email}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
