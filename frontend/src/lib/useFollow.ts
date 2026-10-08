"use client";
// Cloudscape links/buttons fire `onFollow` with an href. We intercept it and use the Next.js router
// so navigation is client-side (no full page reload) while links still work with ctrl/cmd-click.
import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface FollowEvent {
  preventDefault: () => void;
  detail: { href?: string; external?: boolean };
}

export function useFollow() {
  const router = useRouter();
  return useCallback(
    (e: FollowEvent) => {
      const href = e.detail.href;
      if (!href || e.detail.external || href.startsWith("http")) return;
      e.preventDefault();
      router.push(href);
    },
    [router],
  );
}
