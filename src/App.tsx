import { useEffect, useState } from "react";

import { ApiError, apiGetCurrentUser, apiLogin, apiLogout, apiRefresh, apiRegister } from "./lib/api";
import { clearStoredTokens, loadStoredTokens, saveAccessToken, saveStoredTokens } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import { KdsPage } from "./pages/KdsPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import type { AuthResponse, AuthSession, CurrentUserResponse, RegisterResponse } from "./types";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [registeredPending, setRegisteredPending] = useState<RegisterResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  async function bootstrapSession() {
    const tokens = loadStoredTokens();
    if (!tokens.accessToken) {
      setBooting(false);
      return;
    }

    try {
      const current = await apiGetCurrentUser(tokens.accessToken);
      setSession(createSession(current, tokens.accessToken, tokens.refreshToken ?? ""));
      setRegisteredPending(null);
      setBootError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && tokens.refreshToken) {
        const nextAccessToken = await reauthorize(tokens.refreshToken);
        if (nextAccessToken) {
          return;
        }
      }
      clearStoredTokens();
      setSession(null);
      setBootError(error instanceof Error ? error.message : "세션을 복원하지 못했습니다.");
    } finally {
      setBooting(false);
    }
  }

  async function reauthorize(overrideRefreshToken?: string) {
    const refreshToken = overrideRefreshToken ?? loadStoredTokens().refreshToken;
    if (!refreshToken) {
      clearStoredTokens();
      setSession(null);
      return null;
    }

    try {
      const refreshed = await apiRefresh(refreshToken);
      saveAccessToken(refreshed.accessToken);
      const current = await apiGetCurrentUser(refreshed.accessToken);
      setSession(createSession(current, refreshed.accessToken, refreshToken));
      setBootError(null);
      return refreshed.accessToken;
    } catch {
      clearStoredTokens();
      setSession(null);
      return null;
    }
  }

  function handleLoginSuccess(response: AuthResponse) {
    saveStoredTokens(response.accessToken, response.refreshToken);
    setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
      store: response.store,
    });
    setRegisteredPending(null);
    setBootError(null);
  }

  function handleRegisterSuccess(response: RegisterResponse) {
    clearStoredTokens();
    setSession(null);
    setRegisteredPending(response);
    setBootError(null);
  }

  async function handleLogout() {
    const refreshToken = session?.refreshToken ?? loadStoredTokens().refreshToken;
    try {
      if (refreshToken) {
        await apiLogout(refreshToken);
      }
    } catch {
      // Logout should clear the local session even if revoke fails.
    } finally {
      clearStoredTokens();
      setSession(null);
      setRegisteredPending(null);
    }
  }

  async function refreshPendingApprovalStatus() {
    const nextAccessToken = await reauthorize();
    if (!nextAccessToken) {
      setBootError("세션이 만료되어 다시 로그인해야 합니다.");
    }
  }

  if (booting) {
    return (
      <main className="auth-shell">
        <section className="status-card">
          <p className="eyebrow">AUTH SESSION</p>
          <h1>세션 확인 중</h1>
          <p className="auth-copy">저장된 토큰을 확인하고 매장 계정 상태를 복원하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (registeredPending) {
    return (
      <PendingApprovalPage
        onBackToLogin={() => setRegisteredPending(null)}
        onLogout={handleLogout}
        onRefreshStatus={async () => {}}
        registrationOnly
        store={registeredPending.store}
        user={registeredPending.user}
      />
    );
  }

  if (!session) {
    return (
      <>
        {bootError ? <div className="boot-banner error">{bootError}</div> : null}
        <AuthPage onLoginSuccess={handleLoginSuccess} onRegisterSuccess={handleRegisterSuccess} />
      </>
    );
  }

  if (session.user.approvalStatus !== "APPROVED") {
    return (
      <PendingApprovalPage
        onBackToLogin={() => setSession(null)}
        onLogout={handleLogout}
        onRefreshStatus={refreshPendingApprovalStatus}
        registrationOnly={false}
        store={session.store}
        user={session.user}
      />
    );
  }

  return <KdsPage onLogout={handleLogout} onUnauthorized={reauthorize} session={session} />;
}

function createSession(current: CurrentUserResponse, accessToken: string, refreshToken: string): AuthSession {
  return {
    accessToken,
    refreshToken,
    user: current.user,
    store: current.store,
  };
}
