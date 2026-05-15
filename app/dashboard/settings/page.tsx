"use client";

import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { User, Lock, Bell, Trash2, Save, CheckCircle2 } from "lucide-react";
import { apiFetch } from "../../lib/auth";

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saved, setSaved] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaved, setPwSaved] = useState(false);

  const saveProfile = async () => {
    await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify({ name }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const changePassword = async () => {
    if (!currentPw || !newPw) return;
    await apiFetch("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
    setCurrentPw(""); setNewPw("");
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2500);
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Settings</h1>
        <p className="text-white/40 text-sm">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <section className="pm-card p-6 mb-5">
        <div className="flex items-center gap-3 mb-5">
          <User size={16} className="text-[#c8f04d]" />
          <h2 className="font-bold">Profile</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">Display Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="pm-input" />
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">Email</label>
            <input value={user?.email || ""} disabled className="pm-input opacity-40 cursor-not-allowed" />
          </div>
          <button onClick={saveProfile}
            className="flex items-center gap-2 bg-[#c8f04d] text-[#050810] font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-[#d4f86e] transition-colors">
            {saved ? <><CheckCircle2 size={14} /> Saved!</> : <><Save size={14} /> Save Changes</>}
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="pm-card p-6 mb-5">
        <div className="flex items-center gap-3 mb-5">
          <Lock size={16} className="text-[#c8f04d]" />
          <h2 className="font-bold">Change Password</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">Current Password</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="pm-input" />
          </div>
          <div>
            <label className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1.5 block">New Password</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="pm-input" />
          </div>
          <button onClick={changePassword}
            className="flex items-center gap-2 bg-[#c8f04d] text-[#050810] font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-[#d4f86e] transition-colors">
            {pwSaved ? <><CheckCircle2 size={14} /> Updated!</> : <><Lock size={14} /> Update Password</>}
          </button>
        </div>
      </section>

      {/* Danger */}
      <section className="pm-card p-6 border-red-500/20">
        <div className="flex items-center gap-3 mb-5">
          <Trash2 size={16} className="text-red-400" />
          <h2 className="font-bold text-red-400">Danger Zone</h2>
        </div>
        <p className="text-white/40 text-sm mb-4">
          Permanently delete your account and all your documents. This cannot be undone.
        </p>
        <button
          onClick={() => { if (confirm("Delete your account permanently?")) logout(); }}
          className="flex items-center gap-2 border border-red-500/30 text-red-400 text-sm px-5 py-2.5 rounded-lg hover:bg-red-500/5 transition-colors">
          <Trash2 size={14} /> Delete Account
        </button>
      </section>
    </div>
  );
}