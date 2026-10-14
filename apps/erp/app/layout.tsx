import type { Metadata } from 'next';
import { Toaster } from '@acadia/ui';
import { fontVariables } from '@acadia/ui/fonts';
import { SessionProvider } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acadia ERP',
  description: 'Coaching centre operations across every branch.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={fontVariables}>
      <body>
        <Toaster>
          <SessionProvider>{children}</SessionProvider>
        </Toaster>
      </body>
    </html>
  );
}
