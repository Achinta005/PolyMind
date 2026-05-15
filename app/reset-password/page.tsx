"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invalid or missing reset token.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) { setError("Please fill in all fields"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/polymind/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword: password }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Reset failed");

      setSuccess(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#050810] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <p className="text-red-400 font-semibold mb-4">Invalid reset link</p>
          <button
            onClick={() => router.push("/forgot-password")}
            className="pm-btn-primary"
          >
            Request a new one
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050810] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-black mb-1">Set new password</h1>
        <p className="text-white/40 text-sm mb-8">
          Choose a strong password for your account
        </p>

        {success ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-400 text-sm">
            ✓ Password reset successful. Redirecting to login...
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pm-input"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="pm-input"
                  autoComplete="new-password"
                />
              </div>

              <button type="submit" disabled={submitting} className="pm-btn-primary mt-2">
                {submitting ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050810] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-white/40 font-semibold">Loading...</p>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}