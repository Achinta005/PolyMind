const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

// ─── Token Storage ─────────────────────────────────────────
export const tokenStorage = {
  getAccess: (): string | null =>
    typeof window !== "undefined"
      ? localStorage.getItem("pm_access_token")
      : null,
  getRefresh: (): string | null =>
    typeof window !== "undefined"
      ? localStorage.getItem("pm_refresh_token")
      : null,
  set: (tokens: AuthTokens) => {
    localStorage.setItem("pm_access_token", tokens.accessToken);
    localStorage.setItem("pm_refresh_token", tokens.refreshToken);
  },
  clear: () => {
    localStorage.removeItem("pm_access_token");
    localStorage.removeItem("pm_refresh_token");
    localStorage.removeItem("pm_user");
  },
  getUser: (): User | null => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem("pm_user");
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser: (user: User) =>
    localStorage.setItem("pm_user", JSON.stringify(user)),
};

// ─── Auto-refresh fetch wrapper ─────────────────────────────
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function doRefresh(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      tokenStorage.clear();
      window.location.href = "/login";
      return null;
    }
    const data: AuthTokens = await res.json();
    tokenStorage.set(data);
    return data.accessToken;
  } catch {
    tokenStorage.clear();
    window.location.href = "/login";
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const makeReq = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

  let accessToken = tokenStorage.getAccess();
  let res = await makeReq(accessToken);

  if (res.status === 401) {
    if (isRefreshing) {
      const newToken = await new Promise<string>((resolve) =>
        refreshQueue.push(resolve),
      );
      res = await makeReq(newToken);
    } else {
      isRefreshing = true;
      const newToken = await doRefresh();
      isRefreshing = false;
      if (newToken) {
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];
        res = await makeReq(newToken);
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Auth API ───────────────────────────────────────────────
export const authApi = {
  register: async (
    name: string,
    email: string,
    password: string,
  ): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).message || "Registration failed",
      );
    return res.json();
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).message || "Login failed",
      );
    return res.json();
  },

  logout: async () => {
    const refreshToken = tokenStorage.getRefresh();
    if (refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    tokenStorage.clear();
  },

  getOAuthUrl: (provider: "google" | "github"): string =>
    `${API_BASE}/auth/oauth/${provider}?redirect=${encodeURIComponent(window.location.origin + "/oauth/callback")}`,

  handleOAuthCallback: async (
    code: string,
    provider: string,
  ): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/oauth/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, provider }),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).message || "OAuth failed",
      );
    return res.json();
  },

  me: (): Promise<User> => apiFetch("/auth/me"),
};
