import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, getMe, login as apiLogin, signup as apiSignup } from '../api/client';
import { clearSession, loadSession, saveSession } from './storage';
import { registerForPushNotifications, unregisterCurrentPushToken } from '../notifications/push';
import type { SessionState } from '../types';

interface AuthContextValue {
  session: SessionState | null;
  isBootstrapping: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  refreshOnboardingState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      const storedSession = await loadSession();
      if (active) {
        setSession(storedSession);
        setIsBootstrapping(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.token) {
      return;
    }

    void registerForPushNotifications(session.token).catch(() => undefined);
  }, [session?.token]);

  const persistSession = async (nextSession: SessionState | null) => {
    setSession(nextSession);
    if (nextSession) {
      await saveSession(nextSession);
      return;
    }
    await clearSession();
  };

  const signIn = async (username: string, password: string) => {
    const payload = await apiLogin(username, password);
    await persistSession({
      token: payload.access_token,
      username,
      hasCompletedOnboarding: Boolean(payload.has_completed_onboarding),
      hasCompletedTutorial: Boolean(payload.has_completed_tutorial),
    });
  };

  const signUp = async (username: string, password: string) => {
    const payload = await apiSignup(username, password);
    await persistSession({
      token: payload.access_token,
      username,
      hasCompletedOnboarding: Boolean(payload.has_completed_onboarding),
      hasCompletedTutorial: Boolean(payload.has_completed_tutorial),
    });
  };

  const signOut = async () => {
    if (session) {
      await unregisterCurrentPushToken(session.token).catch(() => undefined);
    }
    await persistSession(null);
  };

  const completeOnboarding = async () => {
    if (!session) {
      return;
    }

    await persistSession({
      ...session,
      hasCompletedOnboarding: true,
    });
  };

  const refreshOnboardingState = async () => {
    if (!session) {
      return;
    }

    try {
      const payload = await getMe(session.token);
      await persistSession({
        ...session,
        hasCompletedOnboarding: Boolean(payload.has_completed_onboarding),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await persistSession(null);
      }
      throw error;
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isBootstrapping,
      signIn,
      signUp,
      signOut,
      completeOnboarding,
      refreshOnboardingState,
    }),
    [session, isBootstrapping],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit etre utilise dans AuthProvider');
  }
  return context;
}
