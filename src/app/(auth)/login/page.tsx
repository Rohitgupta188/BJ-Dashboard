"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle, LogIn } from "lucide-react";

interface FieldError {
  field: string;
  message: string;
}

function getFieldError(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setGlobalError(null);
    setFieldErrors([]);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.details && Array.isArray(json.details)) {
          setFieldErrors(json.details);
        } else {
          setGlobalError(json.error || "Login failed. Please try again.");
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

  const emailError = getFieldError(fieldErrors, "email");
  const passwordError = getFieldError(fieldErrors, "password");

  return (
    <div className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl shadow-[0_8px_60px_rgba(0,0,0,0.4)] p-8">
      <div className="mb-7">
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground mt-1">Sign in to your account to continue</p>
      </div>

      {globalError && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl px-4 py-3 mb-5 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isLoading}
              className={`w-full bg-background/50 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 transition-all duration-200 disabled:opacity-60
                ${emailError
                  ? "border-destructive/60 focus:ring-destructive/25"
                  : "border-border focus:border-primary/50 focus:ring-primary/15"
                }`}
            />
          </div>
          {emailError && <p className="text-xs text-destructive pl-1">{emailError}</p>}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Password
            </label>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isLoading}
              className={`w-full bg-background/50 border rounded-xl pl-10 pr-11 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 transition-all duration-200 disabled:opacity-60
                ${passwordError
                  ? "border-destructive/60 focus:ring-destructive/25"
                  : "border-border focus:border-primary/50 focus:ring-primary/15"
                }`}
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
        </div>

      
        <button
          id="login-submit"
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold tracking-wide hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(197,160,89,0.25)] mt-2"
        >
          {isLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
          ) : (
            <><LogIn className="w-4 h-4" /> Sign in</>
          )}
        </button>
      </form>

      
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      
      <p className="text-center text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link
          href="/register"
          className="text-primary font-semibold hover:underline underline-offset-4 transition-colors"
        >
          Create account
        </Link>
      </p>
    </div>
  );
}
