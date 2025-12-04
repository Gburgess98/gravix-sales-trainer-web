'use client';

import LogoutButton from '@/components/LogoutButton';

export default function ToolbarActions() {
  async function handleLogout() {
    // TODO: wire actual sign-out here (e.g., Supabase, Clerk, etc.)
    // await signOut();
    await new Promise(r => setTimeout(r, 200));
  }

  return (
    <LogoutButton
      variant="light"
      label="Logout"
      onClick={handleLogout}
    />
  );
}