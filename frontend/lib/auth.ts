export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

export function persistStoredSession(
  token: string,
  username: string,
  hasCompletedOnboarding: boolean,
): void {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
  localStorage.setItem(
    "hasCompletedOnboarding",
    hasCompletedOnboarding ? "true" : "false",
  );
}

export function clearStoredSession(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("hasCompletedOnboarding");
}

export function markOnboardingCompleted(): void {
  localStorage.setItem("hasCompletedOnboarding", "true");
}

export function buildAuthHeaders(token: string, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set("Authorization", `Bearer ${token}`);
  return mergedHeaders;
}
