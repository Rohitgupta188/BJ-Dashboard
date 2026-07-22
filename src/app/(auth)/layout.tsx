import React from "react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-150 h-150 rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-125 h-125 rounded-full bg-primary/8 blur-[100px] pointer-events-none" />

      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(197,160,89,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(197,160,89,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 shadow-[0_0_30px_rgba(197,160,89,0.15)] mb-4">
            <span className="font-serif font-bold text-xl text-primary">BJ</span>
          </div>
          <h1 className="font-serif text-2xl font-bold text-primary tracking-widest uppercase">
            Brahammand Jewels
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-[4px] mt-1 font-semibold">
            Enterprise Dashboard
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}
