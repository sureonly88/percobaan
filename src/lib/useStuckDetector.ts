"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const STUCK_CHECK_INTERVAL = 2 * 60 * 1000; // every 2 minutes

/**
 * Hook that polls /api/notifications/stuck (POST) to detect stuck transactions
 * and auto-create notifications. Only runs for admin and supervisor roles.
 */
export function useStuckTransactionDetector() {
  const { data: session } = useSession();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const role = (session?.user as { role?: string })?.role;
    if (!role || (role !== "admin" && role !== "supervisor")) return;

    const checkStuck = async () => {
      try {
        await fetch("/api/notifications/stuck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threshold: 5 }),
        });
      } catch {
        // silent — detection failure should not impact the app
      }
    };

    // Run immediately on mount, then every interval
    checkStuck();
    intervalRef.current = setInterval(checkStuck, STUCK_CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [session]);
}
