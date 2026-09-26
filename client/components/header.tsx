'use client';

import * as React from 'react';
import { UserButton } from '@clerk/nextjs';
import { Menu } from 'lucide-react';
import { Button } from './ui/button';

export function Header({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4 lg:px-6 bg-background">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onMenuToggle} className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-xl">GP-RAG</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}
