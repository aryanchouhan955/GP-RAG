'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Key, FileText, X, Eye, EyeOff, Check, Save } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import FileUploadComponent from './file-upload';

export function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const [apiKey, setApiKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) setApiKey(stored);
  }, []);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setSaved(false); // mark as unsaved when user edits
  };

  const handleSave = () => {
    localStorage.setItem('gemini_api_key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72
          flex flex-col
          glass border-r border-border/60
          transform transition-transform duration-300 ease-in-out
          lg:static lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 lg:hidden">
          <span className="font-semibold text-sm tracking-wide">Navigation</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">

          {/* ── API Key Section ────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              <Key className="h-3.5 w-3.5" />
              AI Configuration
            </h3>

            {/* Input row */}
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-…your Gemini API key"
                value={apiKey}
                onChange={handleKeyChange}
                onKeyDown={handleKeyDown}
                className="pr-10 bg-input/60 border-border/60 text-sm focus:border-primary/60 focus:ring-primary/20 placeholder:text-muted-foreground/40 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg
                text-xs font-semibold border transition-all duration-200
                disabled:opacity-40 disabled:cursor-not-allowed
                ${
                  saved
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                    : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50'
                }`}
            >
              {saved ? (
                <><Check className="h-3.5 w-3.5" />Saved!</>
              ) : (
                <><Save className="h-3.5 w-3.5" />Save API Key</>
              )}
            </button>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-1 w-1 rounded-full bg-emerald-400 inline-block" />
              Stored locally — never sent to our servers.
            </p>
          </section>

          {/* ── Divider ───────────────────────────────────── */}
          <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />

          {/* ── Documents Section ─────────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              <FileText className="h-3.5 w-3.5" />
              Documents
            </h3>
            <FileUploadComponent />
          </section>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="border-t border-border/60 px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Appearance</span>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-secondary/60 hover:bg-secondary border border-border/60
                text-muted-foreground hover:text-foreground
                transition-all duration-200"
            >
              <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 absolute" />
              <Moon className="h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="block dark:hidden ml-4">Dark</span>
              <span className="hidden dark:block">Light</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
