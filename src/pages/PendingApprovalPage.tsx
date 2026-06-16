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

  const address = [store.zipNo, store.roadAddress, store.addressDetail].filter(Boolean).join(" ") || "-";

  return (
    <div className="status-shell">
      <section className="status-card" aria-label="승인 대기 상태">
        <div className="status-card-head">
          <span className="status-badge">승인 대기</span>
          <h1>검토 중입니다</h1>
          <p>관리자 승인 후 KDS를 이용할 수 있습니다. 승인이 완료되면 다시 로그인해주세요.</p>
        </div>

        <hr className="status-divider" />

        <div className="summary-grid">
          <SummaryItem label="담당자" value={user.name} />
          <SummaryItem label="이메일" value={user.email} />
          <SummaryItem label="매장명" value={store.storeName} />
          <SummaryItem label="매장 ID" value={store.storeId} />
          <SummaryItem label="주소" value={address} />
        </div>

        <div className="action-row">
          {registrationOnly ? (
            <button onClick={onBackToLogin} type="button">
              로그인으로 돌아가기
            </button>
          ) : (
            <>
              <button disabled={refreshing} onClick={handleRefresh} type="button">
                {refreshing ? "확인 중…" : "상태 새로고침"}
              </button>
              <button className="btn-outline" disabled={loggingOut} onClick={handleLogout} type="button">
                {loggingOut ? "로그아웃 중…" : "로그아웃"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
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
