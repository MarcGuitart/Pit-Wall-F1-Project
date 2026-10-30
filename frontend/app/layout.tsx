import { BUILD_COMMIT } from '@/lib/build'
import type { Metadata } from 'next'
import { archivo, jetbrainsMono } from '@/lib/fonts'
import './globals.css'
import { AccessBootstrap } from '@/components/access/AccessBootstrap'
import { SweepOverlay } from '@/components/layout/SweepOverlay'

export const metadata: Metadata = {
  // Absolute URLs for canonical and og:image (Block 29).
  metadataBase: new URL('https://pitwallengineer.com'),
  // Which commit this build is: <meta name="pw-build"> (block 42, lib/build.ts).
  other: { 'pw-build': BUILD_COMMIT },
  title: 'Pit Wall Engineer | F1 Race Strategy & Telemetry Analysis',
  description: 'Past F1 races analysed into strategy-grade and telemetry insights: pace, tyres, pit windows and race momentum in one engineer-style view.',
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
        className={`${archivo.variable} ${jetbrainsMono.variable} font-body antialiased bg-bg-primary text-text-primary`}
      >
        <AccessBootstrap />
        {children}
        <SweepOverlay />
      </body>
    </html>
  )
}
