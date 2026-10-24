import type { Metadata } from 'next';
import { Toaster } from '@acadia/ui';
import { fontVariables } from '@acadia/ui/fonts';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Campus Engine — Platform Console',
  description: 'Super Admin console for the Campus Engine (Coaching) SaaS platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={fontVariables}>
      <head>
        {/* Synchronous on purpose: it must set the API URL before the app bundle runs. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/config.js" />
      </head>
      <body>
        <Toaster>
          <AuthProvider>{children}</AuthProvider>
        </Toaster>
      </body>
    </html>
  );
}
