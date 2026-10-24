'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert, BrandLogo, Button, Card, Input } from '@acadia/ui';
import { ApiError, login } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const { reload, status } = useSession();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await login(email, password);
      await reload();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError('Could not reach the server. Check that the API is running.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return <div className="grid min-h-screen place-items-center text-body-sm text-fg-muted">Loading…</div>;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-5 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-5">
        <div className="flex flex-col items-center gap-11 text-center">
          <BrandLogo size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-h2 text-fg">Sign in to your centre</h1>
            <p className="text-body-sm text-fg-secondary">Manage your coaching centre across every branch.</p>
          </div>
        </div>

        <Card className="p-5">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}

            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={fieldErrors.email}
              placeholder="you@academy.in"
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
              placeholder="••••••••••"
            />

            <Button type="submit" fullWidth loading={busy} disabled={!email || !password}>
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
