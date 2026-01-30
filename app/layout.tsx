import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Datametrics Assegnazioni',
  description: 'App per gestione assegnazioni',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className="dark">
      <body className="min-h-screen bg-dm-bg text-dm-text">{children}</body>
    </html>
  )
}
