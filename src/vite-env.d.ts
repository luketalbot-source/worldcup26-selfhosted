/// <reference types="vite/client" />

// Compile-time build identifier (git SHA + UTC build time) injected via
// vite.config.ts `define` — surfaced in the profile diagnostics panel.
declare const __BUILD_ID__: string;
