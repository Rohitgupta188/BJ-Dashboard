"use client";

import React from "react";
import { Layers } from "lucide-react";

interface MockupProps {
  tabName: string;
}

export default function OtherViews({ tabName }: MockupProps) {
  console.log(tabName);
  
  return (
    <div className="bg-card/50 rounded-2xl border border-dashed border-primary/20 p-20 text-center text-foreground shadow-[inset_0_0_30px_rgba(197,160,89,0.03)]">
      <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5 border border-primary/20 shadow-[0_0_15px_rgba(197,160,89,0.1)]">
        <Layers className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-base font-serif font-semibold text-foreground tracking-wide mb-1.5">{tabName} Workspace</h3>
      <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
        This atelier module is currently active. The collection interface is prepared to bind live inventory mutations.
      </p>
    </div>
  );
}
