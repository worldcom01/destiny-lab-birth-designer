'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 구버전 /results 경로 → Mode A 결과 페이지로 리다이렉트
export default function LegacyResultsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/mode-a/results'); }, [router]);
  return null;
}
