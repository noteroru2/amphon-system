// src/lib/api.ts
import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_URL?.replace(/\/+$/, "") ||
  "https://amphon-backend.onrender.com";

export const api = axios.create({
  baseURL,
  withCredentials: false,
});
