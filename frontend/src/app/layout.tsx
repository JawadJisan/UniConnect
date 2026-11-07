import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { MotionProvider } from '@/providers/motion-provider';
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

export const metadata: Metadata = {
  title: { default: 'UniConnect', template: '%s | UniConnect' },
  description: 'University club management: memberships, events, announcements and blood donation.',
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
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
