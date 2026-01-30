'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 rounded-md font-medium transition-colors bg-dm-elevated text-dm-text border border-dm-border hover:bg-dm-card hover:border-dm-text-subtle focus:outline-none focus:ring-2 focus:ring-dm-accent focus:ring-offset-2 focus:ring-offset-dm-bg"
    >
      Logout
    </button>
  )
}
