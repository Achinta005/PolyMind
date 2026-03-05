"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";

const passwordRules = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
];

const OAUTH_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) { setError("Please fill in all fields"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Registration failed");
      }
      const data = await res.json();
      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    try {
      const res = await fetch(`/api/auth/oauth/${provider}`, {
        method: "GET",
      });

      if (!res.ok) throw new Error("Failed to initiate OAuth");

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("OAuth initiation failed", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#050810] flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(#c8f04d 1px, transparent 1px), linear-gradient(90deg, #c8f04d 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-[#c8f04d]/6 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#050810] to-transparent" />

        <Link href="/" className="relative z-10 flex items-center gap-2">
          <div className="w-9 h-9 bg-[#c8f04d] rounded-xl flex items-center justify-center">
            <span className="text-[#050810] font-black">PM</span>
          </div>
          <span className="font-black text-xl">PolyMind</span>
        </Link>

        <div className="relative z-10 space-y-4">
          {[
            { num: "01", title: "Upload your docs", desc: "PDF, TXT, DOCX — any format" },
            { num: "02", title: "Semantic indexing", desc: "SBERT embeds your content instantly" },
            { num: "03", title: "Ask questions", desc: "Get cited, grounded answers" },
          ].map((step) => (
            <div key={step.num} className="flex items-start gap-4">
              <span className="text-[#c8f04d] font-mono text-xs mt-1">{step.num}</span>
              <div>
                <p className="font-bold text-sm">{step.title}</p>
                <p className="text-white/40 text-xs">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 pm-card p-4">
          <p className="text-white/40 text-xs font-mono mb-1">ACTIVE RESEARCHERS</p>
          <p className="text-2xl font-black">2,400+</p>
          <p className="text-white/30 text-xs">documents analyzed this week</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-float-up">
          <Link href="/" className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#c8f04d] rounded-lg flex items-center justify-center">
              <span className="text-[#050810] font-black text-sm">PM</span>
            </div>
            <span className="font-black text-lg">PolyMind</span>
          </Link>

          <h1 className="text-3xl font-black mb-1">Create account</h1>
          <p className="text-white/40 text-sm mb-8">Start researching smarter today</p>

          {/* OAuth */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button onClick={() => handleOAuth("google")} className="pm-btn-ghost">
              <GoogleIcon /> Google
            </button>
            <button onClick={() => handleOAuth("github")} className="pm-btn-ghost">
              <GithubIcon /> GitHub
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs font-mono">OR</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-5">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="pm-input"
                autoComplete="name"
              />
            </div>

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

            <div>
              <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="pm-input pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength indicators */}
              {password && (
                <div className="flex gap-3 mt-2">
                  {passwordRules.map((rule) => (
                    <div key={rule.label} className="flex items-center gap-1">
                      <CheckCircle2
                        size={10}
                        className={rule.test(password) ? "text-[#c8f04d]" : "text-white/20"}
                      />
                      <span className={`text-xs font-mono ${rule.test(password) ? "text-[#c8f04d]/70" : "text-white/20"}`}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={submitting} className="pm-btn-primary mt-2">
              {submitting ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
                  <span className="animate-spin"
                    style={{ width: 16, height: 16, border: "2px solid rgba(5,8,16,0.3)", borderTopColor: "#050810", borderRadius: "50%", display: "inline-block" }}
                  />
                  Creating account...
                </span>
              ) : "Create Free Account"}
            </button>
          </form>

          <p className="text-center text-white/30 text-xs mt-6">
            By registering, you agree to our{" "}
            <span className="text-[#c8f04d]/60 cursor-pointer hover:text-[#c8f04d]">Terms</span>
            {" "}and{" "}
            <span className="text-[#c8f04d]/60 cursor-pointer hover:text-[#c8f04d]">Privacy Policy</span>.
          </p>

          <p className="text-center text-white/30 text-sm mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-[#c8f04d] hover:text-[#d4f86e] transition-colors font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#EA4335" d="M5.26 9.77A7.18 7.18 0 0 1 12 4.8c1.73 0 3.29.6 4.51 1.58L19.97 3A11.93 11.93 0 0 0 12 0C7.39 0 3.42 2.69 1.38 6.64l3.88 3.13z" />
      <path fill="#34A853" d="M16.04 18.01A7.19 7.19 0 0 1 12 19.2c-2.96 0-5.5-1.79-6.74-4.39l-3.88 3.13C3.43 21.32 7.39 24 12 24c2.93 0 5.72-1.03 7.83-2.88l-3.79-3.11z" />
      <path fill="#FBBC04" d="M19.83 21.12C22.34 18.84 24 15.6 24 12c0-.77-.1-1.57-.24-2.4H12v4.8h6.73c-.33 1.57-1.2 2.84-2.48 3.71l3.58 2.98v.03z" />
      <path fill="#4285F4" d="M5.26 14.81A7.22 7.22 0 0 1 4.8 12c0-.99.18-1.94.46-2.83L1.38 6.04A11.97 11.97 0 0 0 0 12c0 2.09.54 4.05 1.38 5.77l3.88-2.96z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.31 3.44 9.82 8.21 11.41.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 3-.4c1.02 0 2.04.14 3 .4 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}