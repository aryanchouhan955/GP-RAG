'use client';

import * as React from 'react';
import { UserButton } from '@clerk/nextjs';
import { Menu, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

export function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="relative flex h-14 items-center justify-between border-b border-border/60 px-4 lg:px-6 bg-background/80 backdrop-blur-md z-30">
      {/* Subtle gradient line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuToggle}
          className="lg:hidden text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>

        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-sm tracking-wide gradient-text">GP-RAG</span>
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
              Document AI
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-muted-foreground font-medium">Gemini Powered</span>
        </div>
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}
