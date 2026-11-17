import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { pageTitle, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import { MotionProvider } from '@/providers/motion-provider';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

// The opsz axis gives large text the Inter Display cut automatically.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  axes: ['opsz'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

// Vercel sets the production host; locally the dev server's origin is close enough for OG URLs.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: SITE_NAME, template: pageTitle('%s') },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
  },
  // Public pages may be indexed; the workspace and token pages opt out (D50).
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#07060e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <QueryProvider>
          <MotionProvider>{children}</MotionProvider>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
