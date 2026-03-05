"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export default function VerifiedPage() {
    const router = useRouter();
    const { setAccessToken, setIsAuthenticated, setUser } = useAuth();
    const [error, setError] = useState("");

    useEffect(() => {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);

        const accessToken =
            params.get("access_token") ||
            new URLSearchParams(window.location.search).get("access_token");

        const refreshToken =
            params.get("refresh_token") ||
            new URLSearchParams(window.location.search).get("refresh_token");

        const type = params.get("type") ?? "signin";
        const errorDesc = params.get("error_description");

        if (errorDesc) {
            setError(decodeURIComponent(errorDesc));
            return;
        }

        if (!accessToken || !refreshToken) {
            setError("Missing tokens from OAuth provider.");
            return;
        }

        const verify = async () => {
            try {
                const res = await fetch("/api/auth/verify-callback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        type,
                    }),
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.message || "Verification failed");
                }

                const data = await res.json();

                // Main server returns { success, accessToken, user }
                setAccessToken(data.accessToken ?? data.data?.accessToken ?? accessToken);
                setUser(data.user ?? data.data?.user);
                setIsAuthenticated(true);
                router.push("/dashboard");
            } catch (err: any) {
                setError(err.message || "Authentication failed");
            }
        };

        verify();
    }, [router, setAccessToken, setIsAuthenticated, setUser]);

    return (
        <div className="min-h-screen bg-[#050810] flex items-center justify-center">
            <div className="text-center">
                {!error ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative w-14 h-14">
                            <div className="absolute inset-0 rounded-full border-2 border-[#c8f04d]/20" />
                            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#c8f04d] animate-spin" />
                            <div
                                className="absolute inset-2 rounded-full border border-transparent border-t-[#c8f04d]/40 animate-spin"
                                style={{ animationDuration: "1.5s", animationDirection: "reverse" }}
                            />
                        </div>
                        <div>
                            <p className="font-bold text-lg">Authenticating...</p>
                            <p className="text-white/40 text-sm font-mono mt-1">Verifying your identity</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 max-w-sm">
                        <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center">
                            <span className="text-red-400 text-2xl">✕</span>
                        </div>
                        <p className="font-bold text-lg">Authentication Failed</p>
                        <p className="text-white/40 text-sm">{error}</p>
                        <button
                            onClick={() => router.push("/login")}
                            className="bg-[#c8f04d] text-[#050810] font-bold px-6 py-2.5 rounded-lg text-sm hover:bg-[#d4f86e] transition-colors"
                        >
                            Back to Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}