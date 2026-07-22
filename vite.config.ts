import { defineConfig } from 'vite';

// base './' hält alle Asset-Pfade relativ – wichtig für das spätere
// native Packaging (Tauri lädt die Seite aus dem Dateisystem).
export default defineConfig({
  base: './',
});
