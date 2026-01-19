
const isDev = process.env.NODE_ENV === "development";

export const API_URL = (isDev ? process.env.NEXT_PUBLIC_DEV_API_URL : process.env.NEXT_PUBLIC_API_URL);