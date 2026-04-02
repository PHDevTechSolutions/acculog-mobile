"use client"

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { Eye, EyeOff, ArrowRight, Shield, Fingerprint } from "lucide-react";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [Email, setEmail] = useState("");
  const [Password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [isPinLogin, setIsPinLogin] = useState(false);
  const [otp, setOtp] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  function getDeviceId() {
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem("deviceId", deviceId);
    }
    return deviceId;
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      const deviceId = getDeviceId();
      e.preventDefault();
      if (!isPinLogin && (!Email || !Password)) {
        toast.error("Email and Password are required!");
        return;
      }
      if (isPinLogin && !pin) {
        toast.error("PIN is required!");
        return;
      }
      setLoading(true);
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            Email: isPinLogin ? undefined : Email, 
            Password: isPinLogin ? undefined : Password, 
            email: isPinLogin ? Email : undefined,
            pin, 
            isPinLogin, 
            deviceId, 
            otp 
          }),
        });
        const result = await response.json();

        if (response.ok && result.twoFactorRequired) {
          setTwoFactorRequired(true);
          toast.info("Verification code sent to your email.");
          return;
        }

        if (response.ok && result.userId) {
          toast.success("Login successful!");
          setTimeout(() => {
            router.push(`/activity-planner?id=${encodeURIComponent(result.userId)}`);
          }, 800);
        } else {
          toast.error(result.message || "Login failed!");
        }
      } catch {
        toast.error("An error occurred while logging in!");
      } finally {
        setLoading(false);
      }
    },
    [Email, Password, router]
  );

  const handleBiometricLogin = useCallback(async () => {
    setBiometricLoading(true);
    const deviceId = getDeviceId();

    try {
      // 1. Get challenge from local (standard WebAuthn)
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      // 2. Request credential from device
      // Note: We don't provide allowCredentials, which triggers "Discoverable Credentials" flow
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          userVerification: "required",
        }
      }) as any;

      if (!credential) throw new Error("Biometric authentication failed.");

      // 3. Send to API (without Email, backend will find user by credential.id)
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          credentialId: credential.id, 
          deviceId 
        }),
      });

      const result = await response.json();
      if (response.ok && result.userId) {
        toast.success("Biometric login successful!");
        setTimeout(() => {
          router.push(`/activity-planner?id=${encodeURIComponent(result.userId)}`);
        }, 800);
      } else {
        toast.error(result.message || "Biometric login failed!");
      }
    } catch (err: any) {
      console.error("Biometric login error:", err);
      if (err.name !== "NotAllowedError") {
        toast.error(err.message || "An error occurred during biometric login.");
      }
    } finally {
      setBiometricLoading(false);
    }
  }, [router]);

  return (
    <div className={cn("min-h-screen w-full flex", className)} {...props}>

      {/* ── Left Panel — Branding ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #CC1318 0%, #7A0B0E 60%, #4A0608 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/[0.04] pointer-events-none" />
        <div className="absolute top-1/3 -left-16 w-64 h-64 rounded-full bg-white/[0.03] pointer-events-none" />
        <div className="absolute -bottom-24 right-16 w-96 h-96 rounded-full bg-white/[0.03] pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-lg">
              <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="8" width="14" height="2" rx="1" fill="#CC1318" />
                <rect x="2" y="4" width="9" height="2" rx="1" fill="#CC1318" />
                <rect x="2" y="12" width="11" height="2" rx="1" fill="#CC1318" />
              </svg>
            </div>
            <span className="text-white text-[16px] font-bold tracking-[0.1em]">ACCULOG</span>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-16">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-2 mb-6">
              <Shield size={13} className="text-white/80" />
              <span className="text-white/80 text-[12px] font-medium tracking-wide">Secure Time Tracking</span>
            </div>
            <h2 className="text-white text-[40px] font-bold leading-[1.1] mb-5">
              Track time.<br />
              Stay on field.<br />
              <span className="text-white/50">Stay accountable.</span>
            </h2>
            <p className="text-white/55 text-[15px] leading-relaxed max-w-sm">
              A unified platform for field attendance, site visits, and timesheet management — built for your team's daily operations.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-3">
            {[
              { label: "Real-time GPS tracking", sub: "Know where your team is" },
              { label: "Client visit logs", sub: "Track every site interaction" },
              { label: "Automated timesheets", sub: "Hours calculated automatically" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/40 flex-shrink-0" />
                <div>
                  <span className="text-white text-[13px] font-semibold">{f.label} </span>
                  <span className="text-white/45 text-[13px]">— {f.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-white/30 text-[11px] tracking-wider">
            © {new Date().getFullYear()} ACCULOG · Time Tracker Activity
          </p>
        </div>
      </div>

      {/* ── Right Panel — Login Form ── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F9F6F4] px-6 py-12 relative">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-[#CC1318] rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="8" width="14" height="2" rx="1" fill="white" />
              <rect x="2" y="4" width="9" height="2" rx="1" fill="white" />
              <rect x="2" y="12" width="11" height="2" rx="1" fill="white" />
            </svg>
          </div>
          <span className="text-[#CC1318] text-[15px] font-bold tracking-[0.1em]">ACCULOG</span>
        </div>

        <div className="w-full max-w-sm">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-gray-900 mb-2 leading-tight">Welcome back</h1>
            <p className="text-[14px] text-gray-400 leading-relaxed">
              Sign in to your account to continue tracking your field activity.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={Email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@acculog.com"
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-[#CC1318] focus:ring-2 focus:ring-[#CC1318]/10 transition-all"
              />
            </div>

            {/* OTP Verification (only if 2FA required) */}
            {twoFactorRequired && (
              <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <label htmlFor="otp" className="text-[11px] font-bold text-[#CC1318] uppercase tracking-widest flex items-center gap-2">
                  <Shield size={12} /> Verification Code
                </label>
                <input
                  id="otp"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter 6-digit code"
                  required
                  className="w-full rounded-2xl border-2 border-[#CC1318]/20 bg-white px-4 py-3.5 text-center text-[20px] font-bold tracking-[8px] text-gray-900 placeholder:text-gray-300 placeholder:tracking-normal outline-none focus:border-[#CC1318] focus:ring-4 focus:ring-[#CC1318]/5 transition-all"
                />
                <p className="text-[11px] text-gray-400 text-center">
                  Check your email for the code
                </p>
              </div>
            )}

            {/* Password or PIN */}
            {!twoFactorRequired && (
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor={isPinLogin ? "pin" : "password"} className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                    {isPinLogin ? "Login PIN" : "Password"}
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPinLogin(!isPinLogin)}
                    className="text-[11px] font-bold text-[#CC1318] hover:underline transition-all"
                  >
                    {isPinLogin ? "Use Password" : "Use PIN Login"}
                  </button>
                </div>
                <div className="relative">
                  {isPinLogin ? (
                    <input
                      id="pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter 6-digit PIN"
                      required
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-center text-[20px] font-bold tracking-[8px] text-gray-900 placeholder:text-gray-300 placeholder:tracking-normal outline-none focus:border-[#CC1318] focus:ring-2 focus:ring-[#CC1318]/10 transition-all"
                    />
                  ) : (
                    <>
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={Password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        autoComplete="current-password"
                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 pr-12 text-[14px] text-gray-900 placeholder:text-gray-300 outline-none focus:border-[#CC1318] focus:ring-2 focus:ring-[#CC1318]/10 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || biometricLoading}
              className={[
                "mt-2 w-full rounded-2xl py-4 text-[15px] font-semibold flex items-center justify-center gap-2 transition-all",
                loading || biometricLoading
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : "bg-[#CC1318] text-white hover:bg-[#A8100F] active:scale-[0.98] shadow-lg shadow-red-200",
              ].join(" ")}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {twoFactorRequired ? "Verifying..." : "Signing in..."}
                </>
              ) : (
                <>
                  {twoFactorRequired ? "Complete Sign In" : "Sign In"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Back to password option if 2FA is active */}
            {twoFactorRequired && (
              <button
                type="button"
                onClick={() => {
                  setTwoFactorRequired(false);
                  setOtp("");
                }}
                className="text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Back to Password
              </button>
            )}

            {/* Biometric login button */}
            {!twoFactorRequired && (
              <>
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-100" />
                  </div>
                  <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
                    <span className="bg-[#F9F6F4] px-3 text-gray-300 font-semibold">Or</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={loading || biometricLoading}
                  className={[
                    "w-full rounded-2xl py-4 text-[15px] font-semibold flex items-center justify-center gap-2 transition-all border border-gray-200",
                    loading || biometricLoading
                      ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                      : "bg-white text-gray-700 hover:bg-gray-50 active:scale-[0.98] hover:border-gray-300",
                  ].join(" ")}
                >
                  {biometricLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-gray-200 border-t-[#CC1318] rounded-full animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Fingerprint size={18} className="text-[#CC1318]" />
                      Login with Fingerprint
                    </>
                  )}
                </button>
              </>
            )}
          </form>

          {/* Security note */}
          <div className="mt-6 flex items-center gap-2 justify-center">
            <Shield size={12} className="text-gray-300" />
            <p className="text-[11px] text-gray-400 text-center">
              Your session is secured with device authentication
            </p>
          </div>
        </div>

        {/* Mobile footer */}
        <p className="lg:hidden absolute bottom-6 text-[11px] text-gray-300">
          © {new Date().getFullYear()} Acculog Time Tracker Activity
        </p>
      </div>
    </div>
  );
}