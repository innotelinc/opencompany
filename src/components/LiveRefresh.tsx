"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps server-rendered state fresh while the owner watches. */
export default function LiveRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), Math.max(2, seconds) * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
