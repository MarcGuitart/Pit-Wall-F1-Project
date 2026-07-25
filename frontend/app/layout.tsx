import type { Metadata } from 'next'
import { Barlow_Condensed, Barlow, JetBrains_Mono } from 'next/font/google'
import './globals.css'
// import { RaceStartLoader } from '@/components/layout/RaceStartLoader'

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-barlow',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pit Wall Engineer | F1 Race Strategy & Telemetry Analysis',
  description: 'Past F1 races analysed into strategy-grade and telemetry insights: pace, tyres, pit windows and race momentum in one engineer-style view. 50K+ data points per session.',
  openGraph: {
    title: 'Pit Wall Engineer | F1 Race Strategy & Telemetry Analysis',
    description: 'Past F1 races analysed into strategy-grade and telemetry insights.',
    url: 'https://pitwallengineer.com',
    siteName: 'Pit Wall Engineer',
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${barlowCondensed.variable} ${barlow.variable} ${jetbrainsMono.variable} font-body antialiased bg-bg-primary text-text-primary`}
      >
        {/* <RaceStartLoader /> */}
        {children}
      </body>
    </html>
  )
}
