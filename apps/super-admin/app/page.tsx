'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

// Client-side so the root survives a static export, which has no server to redirect from.
export default function Index() {
  const router = useRouter();
  React.useEffect(() => { router.replace('/dashboard'); }, [router]);
  return null;
}
