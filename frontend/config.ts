
const isDev = process.env.NODE_ENV === "development";
const fallback = "http://localhost:8000";

export const API_URL = (isDev ? process.env.NEXT_PUBLIC_DEV_API_URL??fallback : process.env.NEXT_PUBLIC_API_URL??fallback);