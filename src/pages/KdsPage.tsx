import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiGetKdsOrders, apiUpdateOrderStatus } from "../lib/api";
import type { AnalysisAction, AuthSession, Order, OrderAIAnalysis, OrderStatus } from "../types";

const POLLING_INTERVAL_MS = 3000;
type BoardTab = "RECEIVED" | "DONE";

type KdsPageProps = {
  session: AuthSession;
  onLogout: () => Promise<void>;
  onUnauthorized: () => Promise<string | null>;
};

export function KdsPage({ session, onLogout, onUnauthorized }: KdsPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<BoardTab>("RECEIVED");

  const fetchOrders = useCallback(async () => {
    try {
      const data = await requestWithReauth(session.accessToken, onUnauthorized, apiGetKdsOrders);
      setOrders(data.orders);
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setErrorMessage("로그인이 만료되었습니다. 다시 로그인해주세요.");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "주문 목록을 불러오지 못했습니다.");
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
    };
  }, [fetchOrders]);

  const counts = useMemo(
    () => ({
      NEW: orders.filter((o) => o.status === "NEW").length,
      COOKING: orders.filter((o) => o.status === "COOKING").length,
      DONE: orders.filter((o) => o.status === "DONE").length,
      CANCELLED: orders.filter((o) => o.status === "CANCELLED").length,
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
      setErrorMessage(error instanceof Error ? error.message : "주문 상태를 변경하지 못했습니다.");
    } finally {
      setUpdatingOrderId(null);
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

  const activeOrders = activeTab === "RECEIVED" ? receivedOrders : doneOrders;

  return (
    <div className="kds-shell">
      {/* ── Compact top bar ── */}
      <header className="kds-topbar">
        <div className="kds-topbar-brand">
          <span className="kds-brand-dot" />
          <span className="kds-brand-name">{session.store.storeName}</span>
        </div>

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
          <div className="kds-stat-row">
            <StatPill label="신규" value={counts.NEW} tone="new" />
            <StatPill label="조리중" value={counts.COOKING} tone="cooking" />
            <StatPill label="완료" value={counts.DONE} tone="done" />
          </div>
          <button
            className="kds-logout-btn"
            disabled={loggingOut}
            onClick={handleLogout}
            type="button"
          >
            {loggingOut ? "…" : "로그아웃"}
          </button>
        </div>
      </header>

      {/* ── Inline error / loading (minimal) ── */}
      {errorMessage ? (
        <div className="kds-notice error" role="alert">{errorMessage}</div>
      ) : loading ? (
        <div className="kds-notice">불러오는 중…</div>
      ) : null}

      {/* ── Order board ── */}
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

function StatPill({ label, value, tone }: { label: string; value: number; tone: "new" | "cooking" | "done" }) {
  return (
    <div className={`kds-stat-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
      {/* Card header */}
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

      {/* Items */}
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

      {/* Request / AI panel */}
      <RequestPanel analysis={order.aiAnalysis} customerRequest={order.customer_request} />

      {/* Action button */}
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

  // Nothing to show
  if (!analysis && !rawText) return null;

  // AI not ready yet — show raw request only
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
      {analysis.needsHumanCheck && (
        <span className="kds-request-label urgent">AI 주의 요청</span>
      )}
      {!analysis.needsHumanCheck && (hasActions || hasRaw) && (
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

      {hasRaw && (
        <p className="kds-request-text">{rawText}</p>
      )}
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
