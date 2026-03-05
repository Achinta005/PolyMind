"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthContextValue {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  setAccessToken: (token: string | null) => void;
  setIsAuthenticated: (val: boolean) => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // 🔄 Restore session on page load
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Try /me first — if access token cookie is still valid
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setAccessToken(data.accessToken);
          setUser(data.user);
          setIsAuthenticated(true);
        } else {
          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
            credentials: "include",
          });

          if (!refreshRes.ok) throw new Error("Refresh failed");

          const data = await refreshRes.json();
          setAccessToken(data.accessToken);
          setUser(data.user);
          setIsAuthenticated(true);
        }
      } catch {
        setIsAuthenticated(false);
        setUser(null);
        setAccessToken(null);
      } finally {
        setIsAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        user,
        isAuthenticated,
        isAuthLoading,
        setAccessToken,
        setIsAuthenticated,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}