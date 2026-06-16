import { useState } from "react";

import type { AuthStore, AuthUser } from "../types";

type PendingApprovalPageProps = {
  store: AuthStore;
  user: AuthUser;
  registrationOnly: boolean;
  onBackToLogin: () => void;
  onLogout: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
};

export function PendingApprovalPage({
  store,
  user,
  registrationOnly,
  onBackToLogin,
  onLogout,
  onRefreshStatus,
}: PendingApprovalPageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefreshStatus();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="status-card wide">
        <p className="eyebrow">APPROVAL STATUS</p>
        <h1>승인 대기 중입니다.</h1>
        <p className="auth-copy">
          관리자 승인 전까지 KDS 주문 조회는 차단됩니다. 승인 완료 후 다시 로그인하거나 아래에서 상태를 새로
          확인하세요.
        </p>

        <div className="summary-grid">
          <SummaryItem label="담당자" value={user.name} />
          <SummaryItem label="이메일" value={user.email} />
          <SummaryItem label="매장명" value={store.storeName} />
          <SummaryItem label="매장 ID" value={store.storeId} />
          <SummaryItem label="승인 상태" value={user.approvalStatus} />
          <SummaryItem label="주소" value={formatAddress(store)} />
        </div>

        <div className="action-row">
          {registrationOnly ? (
            <button onClick={onBackToLogin} type="button">
              로그인 화면으로 돌아가기
            </button>
          ) : (
            <>
              <button disabled={refreshing} onClick={handleRefresh} type="button">
                {refreshing ? "확인 중" : "승인 상태 다시 확인"}
              </button>
              <button className="secondary-button" disabled={loggingOut} onClick={handleLogout} type="button">
                {loggingOut ? "로그아웃 중" : "로그아웃"}
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatAddress(store: AuthStore) {
  return [store.zipNo, store.roadAddress, store.jibunAddress, store.addressDetail].filter(Boolean).join(" / ") || "-";
}
