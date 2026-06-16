import { useEffect, useMemo, useState } from "react";

import { API_ORIGIN, ApiError, apiLogin, apiRegister } from "../lib/api";
import type { AuthResponse, LoginRequest, RegisterRequest, RegisterResponse } from "../types";

type AuthPageProps = {
  onLoginSuccess: (response: AuthResponse) => void;
  onRegisterSuccess: (response: RegisterResponse) => void;
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

export function AuthPage({ onLoginSuccess, onRegisterSuccess }: AuthPageProps) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loginForm, setLoginForm] = useState(defaultLoginForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addressHint, setAddressHint] = useState<string | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== API_ORIGIN) {
        return;
      }
      const data = event.data as { type?: string; payload?: Partial<RegisterRequest> };
      if (data?.type !== "deeporder.juso.selected" || !data.payload) {
        return;
      }
      const payload = data.payload;

      setRegisterForm((current) => ({
        ...current,
        zipNo: payload.zipNo ?? current.zipNo,
        roadAddress: payload.roadAddress ?? current.roadAddress,
        jibunAddress: payload.jibunAddress ?? current.jibunAddress,
        addressDetail: payload.addressDetail ?? current.addressDetail,
      }));
      setAddressHint("주소 검색 결과를 반영했습니다. 상세주소만 필요하면 수정해주세요.");
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const title = useMemo(
    () => (tab === "login" ? "매장 계정 로그인" : "매장 가입 신청"),
    [tab],
  );

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
      setAddressHint("팝업이 차단되었습니다. 브라우저 팝업 차단을 해제한 뒤 다시 시도해주세요.");
      return;
    }

    popup.focus();
    setAddressHint("주소 검색 팝업을 열었습니다. 검색 후 자동으로 폼에 반영됩니다.");
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <p className="eyebrow">KITCHEN DISPLAY SYSTEM</p>
        <h1>DeepOrder KDS</h1>
        <p className="auth-copy">
          로그인한 매장 계정에 연결된 주문만 조회합니다. 더 이상 고정 `storeId` 없이 인증된 매장 컨텍스트로
          진입합니다.
        </p>
      </section>

      <section className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="인증 화면 선택">
          <button
            className={tab === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setTab("login");
              setErrorMessage(null);
            }}
            type="button"
          >
            로그인
          </button>
          <button
            className={tab === "register" ? "auth-tab active" : "auth-tab"}
            onClick={() => {
              setTab("register");
              setErrorMessage(null);
            }}
            type="button"
          >
            가입 신청
          </button>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-form-head">
            <h2>{title}</h2>
            <p>
              {tab === "login"
                ? "승인된 매장 계정은 바로 KDS로 진입하고, 미승인 계정은 승인 대기 화면으로 이동합니다."
                : "매장 정보와 계정 정보를 입력하면 승인 대기 상태로 등록됩니다."}
            </p>
          </div>

          {errorMessage ? <div className="banner error">{errorMessage}</div> : null}

          {tab === "login" ? (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label className="field">
                <span>이메일</span>
                <input
                  autoComplete="email"
                  name="email"
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="owner@example.com"
                  required
                  type="email"
                  value={loginForm.email}
                />
              </label>
              <label className="field">
                <span>비밀번호</span>
                <input
                  autoComplete="current-password"
                  minLength={8}
                  name="password"
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="8자 이상"
                  required
                  type="password"
                  value={loginForm.password}
                />
              </label>
              <button disabled={submitting} type="submit">
                {submitting ? "로그인 중" : "로그인"}
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleRegisterSubmit}>
              <div className="field-grid two">
                <label className="field">
                  <span>담당자 이름</span>
                  <input
                    name="name"
                    onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="홍길동"
                    required
                    value={registerForm.name}
                  />
                </label>
                <label className="field">
                  <span>매장명</span>
                  <input
                    name="storeName"
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, storeName: event.target.value }))
                    }
                    placeholder="딥오더 테스트 매장"
                    required
                    value={registerForm.storeName}
                  />
                </label>
              </div>

              <div className="field-grid two">
                <label className="field">
                  <span>이메일</span>
                  <input
                    autoComplete="email"
                    name="email"
                    onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="owner@example.com"
                    required
                    type="email"
                    value={registerForm.email}
                  />
                </label>
                <label className="field">
                  <span>비밀번호</span>
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    name="password"
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, password: event.target.value }))
                    }
                    placeholder="8자 이상"
                    required
                    type="password"
                    value={registerForm.password}
                  />
                </label>
              </div>

              <div className="field-grid two">
                <label className="field">
                  <span>매장 연락처</span>
                  <input
                    name="storePhone"
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, storePhone: event.target.value }))
                    }
                    placeholder="010-0000-0000"
                    value={registerForm.storePhone}
                  />
                </label>
                <div className="field field-action">
                  <span>주소 검색</span>
                  <button className="secondary-button" onClick={handleAddressSearch} type="button">
                    주소 검색
                  </button>
                </div>
              </div>

              {addressHint ? <div className="banner">{addressHint}</div> : null}

              <div className="field-grid two">
                <label className="field">
                  <span>우편번호</span>
                  <input
                    name="zipNo"
                    onChange={(event) => setRegisterForm((current) => ({ ...current, zipNo: event.target.value }))}
                    placeholder="12345"
                    value={registerForm.zipNo}
                  />
                </label>
                <label className="field">
                  <span>상세주소</span>
                  <input
                    name="addressDetail"
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, addressDetail: event.target.value }))
                    }
                    placeholder="101호"
                    value={registerForm.addressDetail}
                  />
                </label>
              </div>

              <label className="field">
                <span>도로명주소</span>
                <input
                  name="roadAddress"
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, roadAddress: event.target.value }))
                  }
                  placeholder="서울시 강남구 ..."
                  value={registerForm.roadAddress}
                />
              </label>
              <label className="field">
                <span>지번주소</span>
                <input
                  name="jibunAddress"
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, jibunAddress: event.target.value }))
                  }
                  placeholder="서울시 강남구 ... (지번)"
                  value={registerForm.jibunAddress}
                />
              </label>

              <button disabled={submitting} type="submit">
                {submitting ? "가입 신청 중" : "가입 신청"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
