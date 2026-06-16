import { useEffect, useState } from "react";

import { ApiError, apiGetCurrentUser, apiLogin, apiLogout, apiRefresh, apiRegister } from "./lib/api";
import { clearStoredTokens, loadStoredTokens, saveAccessToken, saveStoredTokens } from "./lib/auth";
import { DevNav } from "./components/DevNav";
import { AuthPage } from "./pages/AuthPage";
import { KdsPage } from "./pages/KdsPage";
import type { AuthResponse, AuthSession, CurrentUserResponse, RegisterResponse } from "./types";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [registeredPending, setRegisteredPending] = useState<RegisterResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  // DEV ONLY — 삭제 방법: devPage state와 DevNav 렌더링 코드 제거
  const [devPage, setDevPage] = useState<"auth" | "pending" | "kds" | null>(null);

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

  // DEV ONLY — mock props for forced navigation
  const mockPendingStore = { storeId: "DEV-001", storeName: "개발 테스트 매장", zipNo: "12345", roadAddress: "서울시 강남구 테헤란로 1", jibunAddress: "", addressDetail: "1층" };
  const mockPendingUser = { userId: "dev-user", name: "개발자", email: "dev@example.com", approvalStatus: "PENDING" as const };
  const mockSession = { accessToken: "dev", refreshToken: "dev", user: { ...mockPendingUser, approvalStatus: "APPROVED" as const }, store: mockPendingStore };

  function resolveCurrentPage(): "auth" | "pending" | "kds" {
    if (devPage) return devPage;
    if (booting) return "auth";
    if (registeredPending || !session) return "auth";
    if (session.user.approvalStatus !== "APPROVED") return "pending";
    return "kds";
  }

  const currentPage = resolveCurrentPage();

  if (booting && !devPage) {
    return (
      <div className="status-shell">
        <section className="status-card">
          <div className="status-card-head">
            <h1>불러오는 중…</h1>
          </div>
        </section>
      </div>
    );
  }

  if (currentPage === "pending") {
    const pendingStore = registeredPending?.store ?? session?.store ?? mockPendingStore;
    const pendingUser = registeredPending?.user ?? session?.user ?? mockPendingUser;
    return (
      <>
        <DevNav current="pending" onNavigate={setDevPage} />
        <AuthPage
          onLoginSuccess={handleLoginSuccess}
          onRegisterSuccess={handleRegisterSuccess}
          pendingInfo={{ user: pendingUser, store: pendingStore }}
          onBackFromPending={() => { setRegisteredPending(null); setSession(null); setDevPage(null); }}
        />
      </>
    );
  }

  if (currentPage === "kds") {
    const kdsSession = session ?? mockSession;
    return (
      <>
        <DevNav current="kds" onNavigate={setDevPage} />
        <KdsPage onLogout={handleLogout} onUnauthorized={reauthorize} session={kdsSession} />
      </>
    );
  }

  // auth (default)
  return (
    <>
      <DevNav current="auth" onNavigate={setDevPage} />
      {bootError ? <div className="boot-banner error">{bootError}</div> : null}
      <AuthPage onLoginSuccess={handleLoginSuccess} onRegisterSuccess={handleRegisterSuccess} />
    </>
  );
}

function createSession(current: CurrentUserResponse, accessToken: string, refreshToken: string): AuthSession {
  return {
    accessToken,
    refreshToken,
    user: current.user,
    store: current.store,
  };
}
