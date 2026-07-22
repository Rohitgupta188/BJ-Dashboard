"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Eye, EyeOff, Mail, Lock, User, Loader2,
  AlertCircle, UserPlus, CheckCircle2, XCircle,
} from "lucide-react";

interface FieldError { field: string; message: string; }

function getFieldError(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

interface PasswordRule { label: string; test: (p: string) => boolean; }
const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 6 characters", test: (p) => p.length >= 6 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const strength = passed <= 2 ? "Weak" : passed <= 4 ? "Fair" : "Strong";
  const colors = { Weak: "bg-destructive", Fair: "bg-yellow-500", Strong: "bg-green-500" };
  return (
    <div className="space-y-2 mt-2">
      {/* Bar */}
      <div className="flex gap-1 h-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-all duration-300 ${i <= passed ? colors[strength] : "bg-border"}`}
          />
        ))}
      </div>
      {/* Rules */}
      <div className="grid grid-cols-1 gap-0.5">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <div key={rule.label} className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? "text-green-500" : "text-muted-foreground/60"}`}>
              {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {rule.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setGlobalError(null);
    setFieldErrors([]);

    if (password !== confirmPassword) {
      setFieldErrors([{ field: "confirmPassword", message: "Passwords do not match" }]);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.details && Array.isArray(json.details)) {
          setFieldErrors(json.details);
        } else {
          setGlobalError(json.error || "Registration failed. Please try again.");
        }
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setGlobalError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const usernameError = getFieldError(fieldErrors, "username");
  const emailError = getFieldError(fieldErrors, "email");
  const passwordError = getFieldError(fieldErrors, "password");
  const confirmError = getFieldError(fieldErrors, "confirmPassword");

  const inputBase = (hasError: boolean) =>
    `w-full bg-background/50 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 transition-all duration-200 disabled:opacity-60 ${
      hasError
        ? "border-destructive/60 focus:ring-destructive/25"
        : "border-border focus:border-primary/50 focus:ring-primary/15"
    }`;

  return (
    <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl shadow-[0_8px_60px_rgba(0,0,0,0.4)] p-8">
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Create account</h2>
        <p className="text-sm text-muted-foreground mt-1">Set up your dashboard access</p>
      </div>

      {/* Global Error */}
      {globalError && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl px-4 py-3 mb-5 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Username */}
        <div className="space-y-1.5">
          <label htmlFor="reg-username" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Username
          </label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="reg-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe"
              disabled={isLoading}
              className={`${inputBase(!!usernameError)} pr-4`}
            />
          </div>
          {usernameError && <p className="text-xs text-destructive pl-1">{usernameError}</p>}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="reg-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              className={`${inputBase(!!emailError)} pr-4`}
            />
          </div>
          {emailError && <p className="text-xs text-destructive pl-1">{emailError}</p>}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="reg-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className={`${inputBase(!!passwordError)} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              tabIndex={-1}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {passwordError && <p className="text-xs text-destructive pl-1">{passwordError}</p>}
          <PasswordStrength password={password} />
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label htmlFor="reg-confirm-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="reg-confirm-password"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className={`${inputBase(!!confirmError)} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((p) => !p)}
              tabIndex={-1}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmError && <p className="text-xs text-destructive pl-1">{confirmError}</p>}
        </div>

        {/* Submit */}
        <button
          id="register-submit"
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold tracking-wide hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(197,160,89,0.25)] mt-2"
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
          ) : (
            <><UserPlus className="w-4 h-4" /> Create account</>
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Login link */}
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-primary font-semibold hover:underline underline-offset-4 transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
