import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/auth";

const ACTIVE_SCHEDULE_PROGRESS = new Set(["belum_jemput", "sudah_jemput", "dalam_perjalanan"]);
const ACTIVE_TEBENGAN_PROGRESS = new Set(["menuju_jemput", "berangkat"]);

export function MitraGpsSync() {
  const { user, token } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const activeTargetsRef = useRef<{ url: string }[]>([]);
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

  const isMitra = user?.role === "driver";

  useEffect(() => {
    if (!isMitra || !token) return;

    async function fetchActiveTargets() {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
      const targets: { url: string }[] = [];

      try {
        const [schedRes, carterRes, tebRes] = await Promise.all([
          fetch(`${apiBase}/schedules/mine`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/carter-bookings/incoming`, { headers, cache: "no-store" }),
          fetch(`${apiBase}/tebengan/mine`, { headers, cache: "no-store" }),
        ]);

        if (schedRes.ok) {
          const schedules: any[] = await schedRes.json();
          for (const s of schedules) {
            if (ACTIVE_SCHEDULE_PROGRESS.has(s.trip_progress)) {
              targets.push({ url: `${apiBase}/schedules/${s.id}/driver-location` });
            }
          }
        }

        if (carterRes.ok) {
          const carters: any[] = await carterRes.json();
          for (const c of carters) {
            if (c.status === "aktif" && c.trip_progress !== "selesai") {
              targets.push({ url: `${apiBase}/carter-bookings/${c.id}/driver-location` });
            }
          }
        }

        if (tebRes.ok) {
          const tebengans: any[] = await tebRes.json();
          for (const t of tebengans) {
            if (ACTIVE_TEBENGAN_PROGRESS.has(t.trip_progress) || t.status === "berangkat") {
              targets.push({ url: `${apiBase}/tebengan/${t.id}/driver-location` });
            }
          }
        }
      } catch {
        // network errors ignored silently
      }

      activeTargetsRef.current = targets;
    }

    fetchActiveTargets();
    const pollInterval = setInterval(fetchActiveTargets, 30_000);

    if (!navigator.geolocation) return () => clearInterval(pollInterval);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const body = JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        for (const target of activeTargetsRef.current) {
          fetch(target.url, { method: "PATCH", headers, body }).catch(() => {});
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 3000 },
    );

    return () => {
      clearInterval(pollInterval);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isMitra, token, apiBase]);

  return null;
}
