import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relativer Base-Pfad, damit der Build auch in einem Unterordner
  // (z. B. GitHub Pages) funktioniert.
  base: './',
})
