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
            className={`text-sm font-medium ${
              isActive
                ? 'text-indigo-600 underline'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
