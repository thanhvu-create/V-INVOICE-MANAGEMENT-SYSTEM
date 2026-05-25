import type { Metadata } from 'next'
import { Cormorant_Garamond, Cardo } from 'next/font/google'
import './globals.css'

const cormorant = Cormorant_Garamond({
  subsets:  ['latin'],
  weight:   ['400', '500', '600'],
  variable: '--font-heading-loaded',
  display:  'swap',
})

const cardo = Cardo({
  subsets:  ['latin'],
  weight:   ['400', '700'],
  variable: '--font-body-loaded',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'V-Invoice — HP Jewelry',
  description: 'HP Jewelry invoice management system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${cardo.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
