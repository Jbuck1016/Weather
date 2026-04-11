import type { Metadata } from 'next'
import { Space_Mono, Syne } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
})

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WeatherEdge',
  description: 'Kalshi weather market trading dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceMono.variable} ${syne.variable}`}>
      <body>
        <div className="app-root">
          <nav className="border-b border-border bg-bg2/80 backdrop-blur sticky top-0 z-30">
            <div className="px-6 py-3 flex items-center justify-between">
              <Link href="/" className="flex items-baseline gap-1 no-underline">
                <span className="heading text-xl text-accent">KX</span>
                <span className="heading text-xl text-text">EDGE</span>
                <span className="label ml-3 hidden md:inline">WEATHER TRADING DASHBOARD</span>
              </Link>
              <div className="flex gap-4 items-center">
                <Link href="/" className="label hover:text-accent">DASHBOARD</Link>
                <Link href="/positions" className="label hover:text-accent">POSITIONS</Link>
                <Link href="/history" className="label hover:text-accent">HISTORY</Link>
                <Link href="/bot" className="label hover:text-accent">BOT</Link>
              </div>
            </div>
          </nav>
          <main className="px-6 py-4">{children}</main>
          <footer className="px-6 py-4 text-center label border-t border-border mt-8">
            Markets settle via NWS Daily Climate Report only — not AccuWeather, Google, or iOS Weather
          </footer>
        </div>
      </body>
    </html>
  )
}
