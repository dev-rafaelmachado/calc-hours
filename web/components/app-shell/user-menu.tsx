import { requireUser } from "@/lib/data/auth"

import { UserMenuButton } from "./user-menu-button"

export async function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = await requireUser()
  return <UserMenuButton email={user.email ?? "Conta"} compact={compact} />
}
