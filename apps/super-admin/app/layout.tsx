import type { Metadata } from 'next';
import { Toaster } from '@acadia/ui';
import { fontVariables } from '@acadia/ui/fonts';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acadia — Platform Console',
  description: 'Super Admin console for the Acadia coaching centre SaaS platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={fontVariables}>
      <body>
        <Toaster>
          <AuthProvider>{children}</AuthProvider>
        </Toaster>
      </body>
    </html>
  );
}
