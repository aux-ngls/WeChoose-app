
const isDev = process.env.NODE_ENV === "development";
const devFallback = "http://127.0.0.1:8080";
const prodFallback = "https://api.wechoose.dury.dev";

export const API_URL = isDev
  ? (process.env.NEXT_PUBLIC_DEV_API_URL ?? devFallback)
  : (process.env.NEXT_PUBLIC_API_URL ?? prodFallback);
