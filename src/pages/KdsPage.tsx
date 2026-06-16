import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, apiGetKdsOrders, apiUpdateOrderStatus } from "../lib/api";
import type { AnalysisAction, AuthSession, Order, OrderAIAnalysis, OrderStatus } from "../types";

const POLLING_INTERVAL_MS = 3000;
type BoardTab = "RECEIVED" | "DONE";

// ── DEV 샘플 주문 데이터 ──────────────────────────────────────────────────────
// 삭제 방법: 아래 MOCK_ORDERS 상수와 fetchOrders 내 "|| MOCK_ORDERS" 부분을 제거
const _now = new Date();
const _ago = (min: number) => new Date(_now.getTime() - min * 60 * 1000).toISOString();

const MOCK_ORDERS: Order[] = [
  {
    id: 1001,
    platform: "store",
    store_id: "DEV-001",
    external_order_id: "ext-1001",
    order_number: "1",
    status: "NEW",
    customer_request: "젓가락 빼주세요",
    delivery_request: null,
    ordered_at: _ago(3),
    created_at: _ago(3),
    updated_at: _ago(3),
    items: [
      { id: 1, name: "제육볶음", quantity: 2, options: [], unit_price: 9000, total_price: 18000 },
      { id: 2, name: "된장찌개", quantity: 1, options: ["공기밥 추가", "라면 사리 추가"], unit_price: 8000, total_price: 8000 },
      { id: 3, name: "소머리국밥", quantity: 1, options: [], unit_price: 11000, total_price: 11000 },
    ],
    aiAnalysis: null,
  },
  {
    id: 1002,
    platform: "delivery",
    store_id: "DEV-001",
    external_order_id: "ext-1002",
    order_number: "2",
    status: "COOKING",
    customer_request: "매운 거 잘 못 먹어서 떡볶이는 안맵게 조절 부탁드려요",
    delivery_request: "문 앞에 놔주세요",
    ordered_at: _ago(11),
    created_at: _ago(11),
    updated_at: _ago(8),
    items: [
      { id: 4, name: "[세트메뉴] 떡볶이 + 순대", quantity: 1, options: ["소스 추가"], unit_price: 14000, total_price: 14000 },
      { id: 5, name: "목은지 김치찜", quantity: 2, options: [], unit_price: 12000, total_price: 24000 },
    ],
    aiAnalysis: {
      summary: "매운맛 조절 요청",
      tags: ["맵기조절"],
      cookingNotes: ["떡볶이 덜 맵게"],
      packingNotes: [],
      deliveryNotes: ["문 앞"],
      kitchenActions: [
        {
          type: "TASTE_ADJUSTMENT",
          label: "맵기 조절",
          target: "떡볶이",
          displayText: "떡볶이 덜 맵게",
          severity: "LOW",
          requiresHumanCheck: false,
          source: "customer_request",
          sourceText: "안맵게 조절",
          matchedMenuItemIds: [4],
        },
      ],
      packingActions: [],
      ignoredRequests: [],
      riskLevel: "LOW",
      warnings: [],
      needsHumanCheck: false,
      analysisStatus: "COMPLETED",
    },
  },
  {
    id: 1003,
    platform: "takeout",
    store_id: "DEV-001",
    external_order_id: "ext-1003",
    order_number: "3",
    status: "COOKING",
    customer_request: "견과류 알레르기 있어요. 땅콩 절대 안됩니다",
    delivery_request: null,
    ordered_at: _ago(17),
    created_at: _ago(17),
    updated_at: _ago(12),
    items: [
      { id: 6, name: "잡채", quantity: 1, options: [], unit_price: 9000, total_price: 9000 },
      { id: 7, name: "궁중 떡볶이", quantity: 2, options: ["치즈 추가"], unit_price: 10000, total_price: 20000 },
    ],
    aiAnalysis: {
      summary: "견과류 알레르기 주의",
      tags: ["알레르기"],
      cookingNotes: ["땅콩 사용 금지"],
      packingNotes: [],
      deliveryNotes: [],
      kitchenActions: [
        {
          type: "ALLERGY",
          label: "알레르기",
          target: "견과류",
          displayText: "땅콩 제외 (알레르기)",
          severity: "HIGH",
          requiresHumanCheck: true,
          source: "customer_request",
          sourceText: "견과류 알레르기 있어요",
          matchedMenuItemIds: [6, 7],
        },
      ],
      packingActions: [],
      ignoredRequests: [],
      riskLevel: "HIGH",
      warnings: ["알레르기 위험 항목 포함"],
      needsHumanCheck: true,
      analysisStatus: "COMPLETED",
    },
  },
  {
    id: 1004,
    platform: "store",
    store_id: "DEV-001",
    external_order_id: "ext-1004",
    order_number: "4",
    status: "DONE",
    customer_request: null,
    delivery_request: null,
    ordered_at: _ago(32),
    created_at: _ago(32),
    updated_at: _ago(25),
    items: [
      { id: 8, name: "뚝배기 불고기", quantity: 1, options: [], unit_price: 13000, total_price: 13000 },
      { id: 9, name: "참치마요 주먹밥", quantity: 3, options: [], unit_price: 3000, total_price: 9000 },
      { id: 10, name: "라면", quantity: 1, options: ["사리 추가"], unit_price: 5000, total_price: 5000 },
    ],
    aiAnalysis: null,
  },
];
// ─────────────────────────────────────────────────────────────────────────────

type KdsPageProps = {
  session: AuthSession;
  onLogout: () => Promise<void>;
  onUnauthorized: () => Promise<string | null>;
};

export function KdsPage({ session, onLogout, onUnauthorized }: KdsPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<BoardTab>("RECEIVED");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(message: string, type: "error" | "info" = "error") {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }

  const fetchOrders = useCallback(async () => {
    try {
      const data = await requestWithReauth(session.accessToken, onUnauthorized, apiGetKdsOrders);
      // DEV: API 결과가 비어 있으면 샘플 데이터 사용 — 삭제 방법: "|| MOCK_ORDERS" 부분 제거
      setOrders(data.orders.length > 0 ? data.orders : MOCK_ORDERS);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        showToast("로그인이 만료되었습니다.");
        return;
      }
      // DEV: API 실패 시에도 샘플 데이터 표시 — 삭제 방법: 아래 setOrders(MOCK_ORDERS) 제거
      setOrders(MOCK_ORDERS);
      showToast(error instanceof Error ? error.message : "주문 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, session.accessToken]);

  useEffect(() => {
    fetchOrders();
    const pollingTimer = window.setInterval(fetchOrders, POLLING_INTERVAL_MS);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(pollingTimer);
      window.clearInterval(clockTimer);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [fetchOrders]);

  // Close account popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const counts = useMemo(
    () => ({
      NEW: orders.filter((o) => o.status === "NEW").length,
      COOKING: orders.filter((o) => o.status === "COOKING").length,
      DONE: orders.filter((o) => o.status === "DONE").length,
    }),
    [orders],
  );

  const receivedOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === "NEW" || o.status === "COOKING")
        .sort((a, b) => statusWeight(a.status) - statusWeight(b.status) || b.id - a.id),
    [orders],
  );

  const doneOrders = useMemo(
    () => orders.filter((o) => o.status === "DONE").sort((a, b) => b.id - a.id),
    [orders],
  );

  async function updateOrderStatus(orderId: number, status: OrderStatus) {
    setUpdatingOrderId(orderId);
    try {
      await requestWithReauth(session.accessToken, onUnauthorized, (token) =>
        apiUpdateOrderStatus(token, orderId, status),
      );
      await fetchOrders();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "주문 상태를 변경하지 못했습니다.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setAccountOpen(false);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  const activeOrders = activeTab === "RECEIVED" ? receivedOrders : doneOrders;
  const initials = (session.user.name ?? session.store.storeName ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="kds-shell">
      {/* ── Sidebar ── */}
      <nav className={`kds-sidebar${sidebarOpen ? " open" : ""}`} aria-label="메인 내비게이션">
        {/* Toggle button */}
        <button
          aria-label={sidebarOpen ? "메뉴 닫기" : "메뉴 열기"}
          className="kds-sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            {sidebarOpen ? (
              <>
                <line x1="3" y1="3" x2="15" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="15" y1="3" x2="3" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1="3" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="3" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            )}
          </svg>
          {sidebarOpen && <span className="kds-sidebar-toggle-label">닫기</span>}
        </button>

        {/* Nav items */}
        <div className="kds-sidebar-nav">
          <button
            className={`kds-sidebar-item${activeTab === "RECEIVED" ? " active" : ""}`}
            onClick={() => { setActiveTab("RECEIVED"); setSidebarOpen(false); }}
            type="button"
            title="접수"
          >
            {/* Order icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="3" y="2" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <line x1="6" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="6" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            {sidebarOpen && (
              <span>
                접수
                {counts.NEW + counts.COOKING > 0 && (
                  <em className="kds-sidebar-badge">{counts.NEW + counts.COOKING}</em>
                )}
              </span>
            )}
            {!sidebarOpen && counts.NEW + counts.COOKING > 0 && (
              <em className="kds-sidebar-dot" aria-hidden="true" />
            )}
          </button>

          <button
            className={`kds-sidebar-item${activeTab === "DONE" ? " active" : ""}`}
            onClick={() => { setActiveTab("DONE"); setSidebarOpen(false); }}
            type="button"
            title="완료"
          >
            {/* Check icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5.5 9L8 11.5L12.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {sidebarOpen && (
              <span>
                완료
                {counts.DONE > 0 && (
                  <em className="kds-sidebar-badge secondary">{counts.DONE}</em>
                )}
              </span>
            )}
          </button>
        </div>

        {/* Account section (bottom) */}
        <div className="kds-sidebar-account" ref={accountRef}>
          {accountOpen && (
            <div className="kds-account-popover">
              <div className="kds-account-popover-info">
                <div className="kds-account-avatar large">{initials}</div>
                <div>
                  <p className="kds-account-name">{session.user.name ?? session.store.storeName}</p>
                  <p className="kds-account-email">{session.user.email}</p>
                </div>
              </div>
              <div className="kds-account-popover-divider" />
              <button
                className="kds-account-popover-item signout"
                disabled={loggingOut}
                onClick={handleLogout}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M11 11l3-3-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="14" y1="8" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {loggingOut ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>
          )}

          <button
            className={`kds-account-trigger${accountOpen ? " active" : ""}`}
            onClick={() => setAccountOpen((v) => !v)}
            type="button"
            title={session.store.storeName}
            aria-expanded={accountOpen}
          >
            <div className="kds-account-avatar">{initials}</div>
            {sidebarOpen && (
              <span className="kds-account-trigger-name">{session.store.storeName}</span>
            )}
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="kds-main">
        {/* Top bar */}
        <header className="kds-topbar">
          <div className="kds-topbar-tabs" role="tablist">
            <button
              aria-selected={activeTab === "RECEIVED"}
              className={`kds-tab${activeTab === "RECEIVED" ? " active" : ""}`}
              onClick={() => setActiveTab("RECEIVED")}
              role="tab"
              type="button"
            >
              접수
              <span className="kds-tab-count">{receivedOrders.length}</span>
            </button>
            <button
              aria-selected={activeTab === "DONE"}
              className={`kds-tab${activeTab === "DONE" ? " active" : ""}`}
              onClick={() => setActiveTab("DONE")}
              role="tab"
              type="button"
            >
              완료
              <span className="kds-tab-count">{doneOrders.length}</span>
            </button>
          </div>

          <div className="kds-topbar-right">
            <button
              aria-label="주문 새로고침"
              className={`kds-refresh-btn${loading ? " spinning" : ""}`}
              disabled={loading}
              onClick={fetchOrders}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Board */}
        <section className="kds-board" aria-label="주문 보드">
          {activeOrders.length === 0 ? (
            <div className="kds-empty">
              {activeTab === "RECEIVED" ? "접수된 주문이 없습니다" : "완료된 주문이 없습니다"}
            </div>
          ) : (
            <div className="kds-lane">
              {activeOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  now={now}
                  onUpdateStatus={updateOrderStatus}
                  order={order}
                  updating={updatingOrderId === order.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`kds-toast${toast.type === "error" ? " error" : ""}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.type === "error" && (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
              <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button
            className="kds-toast-close"
            onClick={() => setToast(null)}
            type="button"
            aria-label="닫기"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

async function requestWithReauth<T>(
  accessToken: string,
  onUnauthorized: () => Promise<string | null>,
  request: (token: string) => Promise<T>,
) {
  try {
    return await request(accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const next = await onUnauthorized();
    if (!next) throw error;
    return request(next);
  }
}

/* ── Order Card ── */

function OrderCard({
  now,
  onUpdateStatus,
  order,
  updating,
}: {
  now: number;
  onUpdateStatus: (orderId: number, status: OrderStatus) => Promise<void>;
  order: Order;
  updating: boolean;
}) {
  const elapsed = formatElapsed(now, order.ordered_at ?? order.created_at);
  const elapsedMinutes = getElapsedMinutes(now, order.ordered_at ?? order.created_at);
  const allergyRiskItemIds = getAllergyRiskItemIds(order.aiAnalysis);
  const isUrgent = elapsedMinutes >= 15;
  const isWarning = elapsedMinutes >= 8 && elapsedMinutes < 15;
  const orderTypeLabel = getOrderTypeLabel(order.platform);

  return (
    <article className={`kds-card ${order.status.toLowerCase()}${isUrgent ? " urgent" : isWarning ? " warning" : ""}`}>
      <div className="kds-card-head">
        <div className="kds-card-head-left">
          <span className="kds-order-num">#{order.order_number ?? order.id}</span>
          <span className={`kds-elapsed-badge${isUrgent ? " urgent" : isWarning ? " warning" : ""}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {elapsed} 경과
          </span>
        </div>
        <span className="kds-order-type">{orderTypeLabel}</span>
      </div>

      <div className="kds-items">
        {order.items.map((item) => (
          <div
            className={`kds-item${allergyRiskItemIds.has(item.id) ? " allergy-risk" : ""}`}
            key={item.id}
          >
            <span className="kds-item-qty">{item.quantity}</span>
            <div className="kds-item-body">
              <span className="kds-item-name">{item.name}</span>
              {item.options.length > 0 && (
                <ul className="kds-item-options">
                  {item.options.map((opt, i) => (
                    <li key={`${item.id}-${i}`}>{opt}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      <RequestPanel analysis={order.aiAnalysis} customerRequest={order.customer_request} />

      {order.status === "NEW" && (
        <button
          className="kds-action-btn"
          disabled={updating}
          onClick={() => onUpdateStatus(order.id, "COOKING")}
          type="button"
        >
          {updating ? "변경중…" : "조리 시작"}
        </button>
      )}
      {order.status === "COOKING" && (
        <button
          className="kds-action-btn complete"
          disabled={updating}
          onClick={() => onUpdateStatus(order.id, "DONE")}
          type="button"
        >
          {updating ? "변경중…" : "완료"}
        </button>
      )}
    </article>
  );
}

/* ── Request / AI panel ── */

function RequestPanel({
  analysis,
  customerRequest,
}: {
  analysis: OrderAIAnalysis | null;
  customerRequest: string | null;
}) {
  const rawText = customerRequest?.trim() ?? "";
  if (!analysis && !rawText) return null;

  if (!analysis) {
    return (
      <div className="kds-request-panel">
        <span className="kds-request-label">요청사항</span>
        <p className="kds-request-text">{rawText}</p>
      </div>
    );
  }

  const actions = analysis.kitchenActions ?? [];
  const hasActions = actions.length > 0;
  const hasRaw = !!rawText;
  if (!hasActions && !hasRaw) return null;

  return (
    <div className={`kds-request-panel${analysis.needsHumanCheck ? " needs-check" : ""}`}>
      {analysis.needsHumanCheck ? (
        <span className="kds-request-label urgent">AI 주의 요청</span>
      ) : (
        <span className="kds-request-label">요청사항</span>
      )}
      {hasActions && (
        <div className="kds-action-chips">
          {actions.map((action, i) => (
            <span className={`kds-chip ${getActionTone(action)}`} key={`${action.displayText}-${i}`}>
              {action.displayText}
            </span>
          ))}
        </div>
      )}
      {hasRaw && <p className="kds-request-text">{rawText}</p>}
    </div>
  );
}

/* ── Pure helpers ── */

function getOrderTypeLabel(platform: string) {
  const p = platform?.toLowerCase() ?? "";
  if (p.includes("delivery") || p.includes("배달")) return "배달";
  if (p.includes("takeout") || p.includes("포장") || p.includes("take")) return "포장";
  return "매장";
}

function getActionTone(action: AnalysisAction) {
  if (action.type === "ALLERGY" || action.type === "SAFETY_CHECK" || action.severity === "HIGH") return "danger";
  if (action.type === "COOKING_REQUEST" || action.type === "TASTE_ADJUSTMENT") return "cook";
  if (action.type === "EXCLUDE_INGREDIENT") return "exclude";
  return "neutral";
}

function getAllergyRiskItemIds(analysis: OrderAIAnalysis | null) {
  const ids = new Set<number>();
  analysis?.kitchenActions
    ?.filter((a) => a.type === "ALLERGY")
    .forEach((a) => a.matchedMenuItemIds?.forEach((id) => ids.add(id)));
  return ids;
}

function getElapsedMinutes(now: number, timestamp: string) {
  const start = parseApiTimestamp(timestamp).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.floor((now - start) / 60000);
}

function formatElapsed(now: number, timestamp: string) {
  const start = parseApiTimestamp(timestamp).getTime();
  if (Number.isNaN(start)) return "-";
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  return `${Math.floor(minutes / 60)}시간`;
}

function parseApiTimestamp(timestamp: string) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(timestamp)) return new Date(timestamp);
  return new Date(`${timestamp}Z`);
}

function statusWeight(status: OrderStatus) {
  if (status === "NEW") return 0;
  if (status === "COOKING") return 1;
  if (status === "DONE") return 2;
  return 3;
}
