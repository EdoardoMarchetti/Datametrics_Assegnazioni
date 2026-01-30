import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import LogoutButton from '@/components/LogoutButton'
import NavLinks from '@/components/NavLinks'
import logo from '@/image/dm_logo_white.png'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-dm-bg">
      <header className="border-b border-dm-border bg-dm-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <a href="/" className="flex items-center gap-3">
                <Image
                  src={logo}
                  alt="Datametrics Department"
                  height={36}
                  width={120}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </a>
              <NavLinks />
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
