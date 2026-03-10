export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

export function buildAuthHeaders(token: string, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set("Authorization", `Bearer ${token}`);
  return mergedHeaders;
}
