export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("token");
}

function emitSessionChanged(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("qulte-session-changed"));
}

export function getStoredOnboardingCompleted(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = localStorage.getItem("hasCompletedOnboarding");
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return null;
}

export function getStoredTutorialCompleted(): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = localStorage.getItem("hasCompletedTutorial");
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  return null;
}

export function persistStoredSession(
  token: string,
  username: string,
  hasCompletedOnboarding: boolean,
  hasCompletedTutorial: boolean,
): void {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
  localStorage.setItem(
    "hasCompletedOnboarding",
    hasCompletedOnboarding ? "true" : "false",
  );
  localStorage.setItem(
    "hasCompletedTutorial",
    hasCompletedTutorial ? "true" : "false",
  );
  emitSessionChanged();
}

export function clearStoredSession(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("hasCompletedOnboarding");
  localStorage.removeItem("hasCompletedTutorial");
  emitSessionChanged();
}

export function markOnboardingCompleted(): void {
  localStorage.setItem("hasCompletedOnboarding", "true");
  emitSessionChanged();
}

export function markTutorialCompleted(): void {
  localStorage.setItem("hasCompletedTutorial", "true");
  emitSessionChanged();
}

export function buildAuthHeaders(token: string, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set("Authorization", `Bearer ${token}`);
  return mergedHeaders;
}
