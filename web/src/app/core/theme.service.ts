import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'theme';

// Light/dark theme, persisted to localStorage and falling back to the system
// preference (prefers-color-scheme) when the user hasn't chosen explicitly.
// Applied via a `data-theme` attribute on <html> that styles.scss keys off.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly theme = signal<Theme>(this.isBrowser ? initialTheme() : 'dark');

  constructor() {
    effect(() => {
      const theme = this.theme();
      if (!this.isBrowser) return;
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Storage unavailable (private browsing, etc.) — theme still applies for this load.
      }
    });
  }

  toggle(): void {
    this.theme.set(this.theme() === 'dark' ? 'light' : 'dark');
  }
}

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable — fall through to the system preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
