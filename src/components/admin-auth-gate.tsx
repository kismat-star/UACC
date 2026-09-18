"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const AUTH_KEY = "uacc_admin_auth";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours full-day session

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check existing login session
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.expiresAt && Date.now() < data.expiresAt) {
          setIsAuthenticated(true);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setIsAuthenticated(false);

    // Listen for logout events
    const handleLogout = () => {
      localStorage.removeItem(AUTH_KEY);
      setIsAuthenticated(false);
    };

    window.addEventListener("uacc_logout", handleLogout);
    return () => window.removeEventListener("uacc_logout", handleLogout);
  }, []);

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");

    const trimmed = password.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter the admin password.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      if (trimmed === "uacc") {
        const expiresAt = Date.now() + SESSION_DURATION_MS;
        localStorage.setItem(
          AUTH_KEY,
          JSON.stringify({
            authenticated: true,
            expiresAt,
            loggedInAt: Date.now(),
          })
        );
        setIsAuthenticated(true);
      } else {
        setError("Incorrect password. Please try again.");
      }
      setLoading(false);
    }, 250);
  };

  // Loading state while checking localStorage
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-emerald-600" />
      </div>
    );
  }

  // If already authenticated for the day, show Admin Dashboard
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Otherwise show Login Screen
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Top bar with theme toggle */}
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="relative overflow-hidden rounded-3xl border border-emerald-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-8 shadow-2xl backdrop-blur-xl">
          {/* Decorative glowing gradient backdrop */}
          <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 h-36 w-36 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

          <div className="relative flex flex-col items-center text-center">
            {/* Logo */}
            <div className="relative mb-4">
              <img
                src="/logo.png"
                alt="Umiya College Logo"
                className="h-20 w-20 rounded-full bg-white object-contain p-1.5 shadow-md ring-2 ring-emerald-500/20 drop-shadow-sm"
              />
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm ring-2 ring-white dark:ring-slate-900">
                <Lock className="h-3 w-3" />
              </span>
            </div>

            {/* College Title */}
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Umiya Arts &amp; Commerce College
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Shree Umiya K.V.C. Education Trust · Print Desk
            </p>

            <div className="mt-4 mb-6 inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Staff &amp; Admin Access
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="w-full space-y-4 text-left">
              <div className="space-y-1.5">
                <label
                  htmlFor="admin-password"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Desk Password
                </label>
                <div className="relative">
                  <Input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    autoFocus
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    className={`h-11 pr-10 text-base font-medium transition-all ${
                      error
                        ? "border-rose-500 focus-visible:ring-rose-500/30"
                        : "focus-visible:ring-emerald-500/30"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-medium text-rose-500"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                disabled={loading || !password}
                className="h-11 w-full bg-emerald-600 font-semibold text-white shadow-md hover:bg-emerald-700 transition-all active:scale-[0.99]"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Unlocking...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5">
                    Unlock Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                🔒 Full-day login: Stays active for 24 hours on this browser.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
