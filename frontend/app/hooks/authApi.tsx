"use client";

import { useAuth } from "@/app/contexts/AuthContext";

let pendingRefresh: Promise<Response> | null = null;

export default function useApi() {
  const { accessToken, setAccessToken, setIsAuthenticated, setUser } = useAuth();

  const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    // First attempt
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: "include",
    });

    if (res.status !== 401) return res;

    // ── 401: attempt token refresh ──────────────────────────
    try {
      // Deduplicate: if a refresh is already in flight, reuse it
      if (!pendingRefresh) {
        pendingRefresh = fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        }).finally(() => {
          pendingRefresh = null;
        });
      }

      const refreshRes = await pendingRefresh;

      if (!refreshRes.ok) {
        setAccessToken(null);
        setIsAuthenticated(false);
        setUser(null);
        throw new Error("Session expired. Please log in again.");
      }

      const refreshData = await refreshRes.json();
      const newToken: string = refreshData.accessToken ?? refreshData.data?.accessToken;

      setAccessToken(newToken);
      setIsAuthenticated(true);

      // Retry original request with new token
      return fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${newToken}`,
        },
        credentials: "include",
      });
    } catch (err) {
      setAccessToken(null);
      setIsAuthenticated(false);
      setUser(null);
      throw err;
    }
  };

  return apiFetch;
}