import { useEffect, useRef, useState } from "react";

import { API_ORIGIN, ApiError, apiLogin, apiRegister } from "../lib/api";
import type { AuthResponse, AuthStore, AuthUser, LoginRequest, RegisterRequest, RegisterResponse } from "../types";

type AuthPageProps = {
  onLoginSuccess: (response: AuthResponse) => void;
  onRegisterSuccess: (response: RegisterResponse) => void;
  /** When set, the right panel shows the pending approval view instead of the login form */
  pendingInfo?: { user: AuthUser; store: AuthStore } | null;
  onBackFromPending?: () => void;
};

const defaultLoginForm: LoginRequest = {
  email: "",
  password: "",
};

const defaultRegisterForm: RegisterRequest = {
  name: "",
  email: "",
  password: "",
  storeName: "",
  storePhone: "",
  zipNo: "",
  roadAddress: "",
  jibunAddress: "",
  addressDetail: "",
};

export function AuthPage({ onLoginSuccess, onRegisterSuccess, pendingInfo, onBackFromPending }: AuthPageProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addressHint, setAddressHint] = useState<string | null>(null);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  // Controls the CSS transition: "form" | "pending"
  const [view, setView] = useState<"form" | "pending">(pendingInfo ? "pending" : "form");
  const emailRef = useRef<HTMLInputElement>(null);

  // Sync view when pendingInfo changes from outside (e.g. login returns PENDING)
  useEffect(() => {
    if (pendingInfo) {
      setView("pending");
    } else {
      setView("form");
    }
  }, [pendingInfo]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== API_ORIGIN) return;
      const data = event.data as { type?: string; payload?: Partial<RegisterRequest> };
      if (data?.type !== "deeporder.juso.selected" || !data.payload) return;
      const payload = data.payload;
      setRegisterForm((current) => ({
        ...current,
        zipNo: payload.zipNo ?? current.zipNo,
        roadAddress: payload.roadAddress ?? current.roadAddress,
        jibunAddress: payload.jibunAddress ?? current.jibunAddress,
        addressDetail: payload.addressDetail ?? current.addressDetail,
      }));
      setAddressHint(null);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function switchTab(next: "login" | "register") {
    setTab(next);
    setErrorMessage(null);
    setAddressHint(null);
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await apiLogin({
        email: loginForm.email.trim(),
        password: loginForm.password,
      });
      onLoginSuccess(response);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await apiRegister({
        name: registerForm.name.trim(),
        email: registerForm.email.trim(),
        password: registerForm.password,
        storeName: registerForm.storeName.trim(),
        storePhone: registerForm.storePhone.trim(),
        zipNo: registerForm.zipNo.trim(),
        roadAddress: registerForm.roadAddress.trim(),
        jibunAddress: registerForm.jibunAddress.trim(),
        addressDetail: registerForm.addressDetail.trim(),
      });
      onRegisterSuccess(response);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddressSearch() {
    const popupUrl = `${API_ORIGIN}/api/address/juso-popup?origin=${encodeURIComponent(window.location.origin)}`;
    const popup = window.open(
      popupUrl,
      "deeporder-juso-popup",
      "width=570,height=620,noopener=no,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      setAddressHint("팝업이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.");
    } else {
      popup.focus();
    }
  }

  function handleBack() {
    setView("form");
    onBackFromPending?.();
  }

  const info = pendingInfo;

  return (
    <main className="auth-shell">
      {/* ── Left: brand panel ── */}
      <section className="auth-hero" aria-hidden="true">
        <div className="auth-hero-top">
          <div className="auth-brand">
            <div className="auth-brand-icon">D</div>
            <span className="auth-brand-name">DeepOrder KDS</span>
          </div>

          <div className="auth-hero-headline">
            <h1>주방을 더<br />스마트하게.</h1>
            <p>실시간 주문 접수부터 AI 분석까지. 매장 운영에 꼭 필요한 것만 담았습니다.</p>
          </div>
        </div>

        <p className="auth-hero-footer">© 2025 DeepOrder. All rights reserved.</p>
      </section>

      {/* ── Right: form panel ── */}
      <section className="auth-card">
        <div className="auth-form-wrap">

          {/* ── Pending approval view ── */}
          <div className={`auth-view${view === "pending" ? " auth-view--visible" : ""}`} aria-hidden={view !== "pending"}>
            <div className="pending-head">
              <span className="status-badge">승인 대기</span>
              <h2>가입 신청 완료</h2>
              <p>관리자 검토 후 승인되면 로그인할 수 있습니다.</p>
            </div>

            <div className="pending-summary">
              <div className="pending-row">
                <span>매장명</span>
                <strong>{info?.store.storeName ?? "-"}</strong>
              </div>
              <div className="pending-row">
                <span>이름</span>
                <strong>{info?.user.name ?? "-"}</strong>
              </div>
            </div>

            <button className="btn-outline auth-submit" onClick={handleBack} type="button">
              이전으로
            </button>
          </div>

          {/* ── Auth form view (login / register) ── */}
          <div className={`auth-view${view === "form" ? " auth-view--visible" : ""}`} aria-hidden={view !== "form"}>
            {/* Tab switcher */}
            <div className="auth-tabs" role="tablist" aria-label="인증 화면 선택">
              <button
                className={tab === "login" ? "auth-tab active" : "auth-tab"}
                onClick={() => switchTab("login")}
                role="tab"
                aria-selected={tab === "login"}
                type="button"
              >
                로그인
              </button>
              <button
                className={tab === "register" ? "auth-tab active" : "auth-tab"}
                onClick={() => switchTab("register")}
                role="tab"
                aria-selected={tab === "register"}
                type="button"
              >
                매장 가입
              </button>
            </div>

            {/* Error */}
            {errorMessage ? <div className="banner error" role="alert">{errorMessage}</div> : null}

            {tab === "login" ? (
              <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
                <div className="field">
                  <label htmlFor="login-email">이메일</label>
                  <input
                    id="login-email"
                    ref={emailRef}
                    autoComplete="email"
                    name="email"
                    onChange={(e) => setLoginForm((c) => ({ ...c, email: e.target.value }))}
                    required
                    type="email"
                    value={loginForm.email}
                  />
                </div>

                <div className="field">
                  <label htmlFor="login-password">비밀번호</label>
                  <input
                    id="login-password"
                    autoComplete="current-password"
                    minLength={8}
                    name="password"
                    onChange={(e) => setLoginForm((c) => ({ ...c, password: e.target.value }))}
                    required
                    type="password"
                    value={loginForm.password}
                  />
                </div>

                <div className="login-options">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e) => setRememberEmail(e.target.checked)}
                    />
                    아이디 저장
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={autoLogin}
                      onChange={(e) => setAutoLogin(e.target.checked)}
                    />
                    자동 로그인
                  </label>
                </div>

                <button className="auth-submit" disabled={submitting} type="submit">
                  {submitting ? "로그인 중…" : "로그인"}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleRegisterSubmit} noValidate>
                {/* 이름 */}
                <div className="field">
                  <label htmlFor="reg-name">이름</label>
                  <input
                    id="reg-name"
                    name="name"
                    onChange={(e) => setRegisterForm((c) => ({ ...c, name: e.target.value }))}
                    required
                    value={registerForm.name}
                  />
                </div>

                {/* 이메일 */}
                <div className="field">
                  <label htmlFor="reg-email">이메일</label>
                  <input
                    id="reg-email"
                    autoComplete="email"
                    name="email"
                    onChange={(e) => setRegisterForm((c) => ({ ...c, email: e.target.value }))}
                    required
                    type="email"
                    value={registerForm.email}
                  />
                </div>

                {/* 비밀번호 */}
                <div className="field">
                  <label htmlFor="reg-password">비밀번호</label>
                  <input
                    id="reg-password"
                    autoComplete="new-password"
                    minLength={8}
                    name="password"
                    onChange={(e) => setRegisterForm((c) => ({ ...c, password: e.target.value }))}
                    required
                    type="password"
                    value={registerForm.password}
                  />
                </div>

                {/* 매장명 + 매장 연락처 */}
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="reg-store-name">매장명</label>
                    <input
                      id="reg-store-name"
                      name="storeName"
                      onChange={(e) => setRegisterForm((c) => ({ ...c, storeName: e.target.value }))}
                      required
                      value={registerForm.storeName}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="reg-phone">연락처</label>
                    <input
                      id="reg-phone"
                      name="storePhone"
                      onChange={(e) => setRegisterForm((c) => ({ ...c, storePhone: e.target.value }))}
                      value={registerForm.storePhone}
                    />
                  </div>
                </div>

                {/* 매장주소 + 주소검색 */}
                <div className="field">
                  <label htmlFor="reg-store-address">매장주소</label>
                  <div className="field-inline">
                    <input
                      id="reg-store-address"
                      name="roadAddress"
                      readOnly
                      value={registerForm.roadAddress}
                      onChange={(e) => setRegisterForm((c) => ({ ...c, roadAddress: e.target.value }))}
                    />
                    <button className="btn-outline" onClick={handleAddressSearch} type="button">
                      주소 검색
                    </button>
                  </div>
                </div>

                {/* 상세주소 */}
                <div className="field">
                  <label htmlFor="reg-address-detail">상세주소</label>
                  <input
                    id="reg-address-detail"
                    name="addressDetail"
                    onChange={(e) => setRegisterForm((c) => ({ ...c, addressDetail: e.target.value }))}
                    value={registerForm.addressDetail}
                  />
                </div>

                {addressHint ? <div className="banner" role="status">{addressHint}</div> : null}

                <button className="auth-submit" disabled={submitting} type="submit">
                  {submitting ? "신청 중…" : "가입 신청"}
                </button>
              </form>
            )}
          </div>

        </div>
      </section>
    </main>
  );
}
