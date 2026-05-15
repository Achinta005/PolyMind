"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Email is required"); return; }

    setError("");
    setSubmitting(true);

    try {
      await forgotPassword(email.trim().toLowerCase());
      setSubmitted(true);
    } catch (err: any) {
      // Always show success — never reveal if email exists
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050810] flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-black mb-1">Forgot password?</h1>
        <p className="text-white/40 text-sm mb-8">
          Enter your email and we'll send a reset link
        </p>

        {submitted ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-400 text-sm">
              If an account exists for <strong>{email}</strong>, you'll receive
              a reset link shortly.
            </div>
            <button
              onClick={() => router.push("/login")}
              className="pm-btn-primary w-full"
            >
              Back to Login
            </button>
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
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pm-input"
                  autoComplete="email"
                />
              </div>

              <button type="submit" disabled={submitting} className="pm-btn-primary mt-2">
                {submitting ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <p className="text-center text-white/30 text-sm mt-6">
              Remember it?{" "}
              <Link href="/login" className="text-[#c8f04d] hover:text-[#d4f86e] font-semibold">
                Back to Login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}