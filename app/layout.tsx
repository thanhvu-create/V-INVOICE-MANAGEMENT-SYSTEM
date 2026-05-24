import type { Metadata } from 'next'
import { Cormorant_Garamond, Jost } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-heading-loaded',
  display:  'swap',
})

const jost = Jost({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-body-loaded',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'V-Invoice — Jewelry Invoice Management',
  description: 'HP Jewelry invoice management system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossOrigin="anonymous"
        />
        <style>{`
          :root {
            --font-heading: var(--font-heading-loaded, 'Cormorant Garamond', Georgia, serif);
            --font-body:    var(--font-body-loaded, 'Jost', Arial, sans-serif);
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
