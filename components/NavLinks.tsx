'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/pre-match', label: 'Pre match' },
  { href: '/post-match', label: 'Post match' },
  { href: '/report-allenatore', label: 'Report allenatore/CV' },
] as const

export default function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-4">
      {links.map(({ href, label }) => {
        const isActive = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`text-sm font-medium transition-colors ${
              isActive
                ? 'text-dm-accent underline'
                : 'text-dm-text-muted hover:text-dm-text'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
