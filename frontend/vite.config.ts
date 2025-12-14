import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ✅ จับเฉพาะ /api/ (มี slash ต่อท้าย) ไม่จับ /api-test
      "^/api/": {
        target: "http://localhost:4000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
