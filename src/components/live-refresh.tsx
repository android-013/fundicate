"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function LiveRefresh({
  label = "Vote totals refresh every 15 seconds while this page is visible.",
}: { label?: string } = {}) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  return <span className="muted small-text">{label}</span>;
}
