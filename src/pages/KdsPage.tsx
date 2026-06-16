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
      NEW: orders.filter((order) => order.status === "NEW").length,
      COOKING: orders.filter((order) => order.status === "COOKING").length,
      DONE: orders.filter((order) => order.status === "DONE").length,
      CANCELLED: orders.filter((order) => order.status === "CANCELLED").length,
    }),
    [orders],
  );
  const receivedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === "NEW" || order.status === "COOKING")
        .sort((left, right) => statusWeight(left.status) - statusWeight(right.status) || right.id - left.id),
    [orders],
  );
  const doneOrders = useMemo(
    () => orders.filter((order) => order.status === "DONE").sort((left, right) => right.id - left.id),
    [orders],
  );

  async function updateOrderStatus(orderId: number, status: OrderStatus) {
    setUpdatingOrderId(orderId);
    try {
      await requestWithReauth(session.accessToken, onUnauthorized, (accessToken) =>
        apiUpdateOrderStatus(accessToken, orderId, status),
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

  return (
    <main className="kds-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">현재 매장</p>
          <h1>{session.store.storeName}</h1>
          <p className="subtle-copy">
            {session.user.name} 계정으로 연결됨 · {session.user.email} · {session.store.storeId}
          </p>
        </div>
        <div className="top-bar-right">
          <div className="status-strip" aria-label="주문 현황">
            <StatusStat label="신규" value={counts.NEW} tone="new" />
            <StatusStat label="조리중" value={counts.COOKING} tone="cooking" />
            <StatusStat label="완료" value={counts.DONE} tone="done" />
          </div>
          <button className="secondary-button" disabled={loggingOut} onClick={handleLogout} type="button">
            {loggingOut ? "로그아웃 중" : "로그아웃"}
          </button>
        </div>
      </header>

      {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
      {loading ? <div className="banner">주문 목록을 불러오는 중입니다.</div> : null}
      {counts.CANCELLED > 0 ? (
        <div className="banner">
          취소 주문 {counts.CANCELLED}건은 보드에서 제외하고 상단 집계로만 관리합니다.
        </div>
      ) : null}

      <section className="board-shell" aria-label="KDS 주문 보드">
        <div className="board-tabs" role="tablist" aria-label="주문 보드 탭">
          <button
            aria-selected={activeTab === "RECEIVED"}
            className={activeTab === "RECEIVED" ? "board-tab active" : "board-tab"}
            onClick={() => setActiveTab("RECEIVED")}
            role="tab"
            type="button"
          >
            접수
            <span>{receivedOrders.length}</span>
          </button>
          <button
            aria-selected={activeTab === "DONE"}
            className={activeTab === "DONE" ? "board-tab active" : "board-tab"}
            onClick={() => setActiveTab("DONE")}
            role="tab"
            type="button"
          >
            완료
            <span>{doneOrders.length}</span>
          </button>
        </div>

        <div className="board-panel">
          {activeTab === "RECEIVED" ? (
            <OrderLane
              emptyLabel="접수 또는 조리중 주문이 없습니다"
              now={now}
              onUpdateStatus={updateOrderStatus}
              orders={receivedOrders}
              updatingOrderId={updatingOrderId}
            />
          ) : (
            <OrderLane
              emptyLabel="완료된 주문이 없습니다"
              now={now}
              onUpdateStatus={updateOrderStatus}
              orders={doneOrders}
              updatingOrderId={updatingOrderId}
            />
          )}
        </div>
      </section>
    </main>
  );
}

async function requestWithReauth<T>(
  accessToken: string,
  onUnauthorized: () => Promise<string | null>,
  request: (token: string) => Promise<T>,
) {
  try {
    return await request(accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const nextAccessToken = await onUnauthorized();
    if (!nextAccessToken) {
      throw error;
    }
    return request(nextAccessToken);
  }
}

function StatusStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "new" | "cooking" | "done";
}) {
  return (
    <div className={`status-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OrderLane({
  emptyLabel,
  now,
  onUpdateStatus,
  orders,
  updatingOrderId,
}: {
  emptyLabel: string;
  now: number;
  onUpdateStatus: (orderId: number, status: OrderStatus) => Promise<void>;
  orders: Order[];
  updatingOrderId: number | null;
}) {
  if (orders.length === 0) {
    return <div className="empty-state board-empty">{emptyLabel}</div>;
  }

  return (
    <div className="lane-track">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          now={now}
          onUpdateStatus={onUpdateStatus}
          order={order}
          updating={updatingOrderId === order.id}
        />
      ))}
    </div>
  );
}

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
  const total = order.items.reduce((sum, item) => sum + (item.total_price ?? 0), 0);
  const allergyRiskItemIds = getAllergyRiskItemIds(order.aiAnalysis);
  const itemGridClass = getItemGridClass(order.items.length);

  return (
    <article className={`order-card ${order.status.toLowerCase()}`}>
      <div className="card-head">
        <div>
          <p className="platform">{order.platform}</p>
          <h3>{order.order_number}</h3>
        </div>
        <div className="card-head-meta">
          <span className={`order-status-pill ${order.status.toLowerCase()}`}>{getStatusLabel(order.status)}</span>
          <span className="elapsed">{elapsed}</span>
        </div>
      </div>

      <div className={`items ${itemGridClass}`}>
        {order.items.map((item) => (
          <div
            className={`item-row ${allergyRiskItemIds.has(item.id) ? "allergy-risk" : ""}`}
            key={item.id}
          >
            <div>
              <strong>{item.name}</strong>
              {item.options.length > 0 ? (
                <div className="option-lines">
                  {item.options.map((option, index) => (
                    <p key={`${item.id}-${index}`}>{option}</p>
                  ))}
                </div>
              ) : null}
            </div>
            <span>{item.quantity}</span>
          </div>
        ))}
      </div>

      <AIAnalysisPanel analysis={order.aiAnalysis} customerRequest={order.customer_request} />

      <div className="card-foot">
        <span>{total > 0 ? `${total.toLocaleString("ko-KR")}원` : "금액 정보 없음"}</span>
        {order.status === "NEW" ? (
          <button disabled={updating} onClick={() => onUpdateStatus(order.id, "COOKING")}>
            {updating ? "변경중" : order.aiAnalysis?.needsHumanCheck ? "확인 후 조리 시작" : "조리 시작"}
          </button>
        ) : null}
        {order.status === "COOKING" ? (
          <button disabled={updating} onClick={() => onUpdateStatus(order.id, "DONE")}>
            {updating ? "변경중" : "완료"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AIAnalysisPanel({
  analysis,
  customerRequest,
}: {
  analysis: OrderAIAnalysis | null;
  customerRequest: string | null;
}) {
  const originalText = customerRequest?.trim() ?? "";

  if (!analysis) {
    if (!originalText) {
      return null;
    }
    return (
      <div className="ai-panel pending">
        <div className="ai-panel-head">
          <span>주의 요청</span>
        </div>
        <p>원문 요청을 먼저 확인하세요. AI 분석 결과는 아직 준비되지 않았습니다.</p>
        <OriginalRequest label="원문 요청" text={originalText} />
      </div>
    );
  }

  const kitchenActions = analysis.kitchenActions ?? [];
  const hasVisibleContent = kitchenActions.length > 0 || originalText;

  if (!hasVisibleContent && analysis.analysisStatus !== "PENDING" && analysis.analysisStatus !== "FAILED") {
    return null;
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <span>주의 요청</span>
      </div>

      {analysis.analysisStatus === "PENDING" ? (
        <>
          <p>원문 요청을 먼저 확인하세요. AI 분석 결과는 아직 준비되지 않았습니다.</p>
          <OriginalRequest label="원문 요청" text={originalText} />
        </>
      ) : analysis.analysisStatus === "FAILED" ? (
        <>
          <p>AI 분석에 실패했습니다. 원문 요청을 직접 확인해주세요.</p>
          <OriginalRequest label="원문 요청" text={originalText} />
        </>
      ) : (
        <>
          {kitchenActions.length > 0 ? (
            <div className="action-list">
              {kitchenActions.map((action, index) => (
                <span className={`action-chip ${getActionTone(action)}`} key={`${action.displayText}-${index}`}>
                  {action.displayText}
                </span>
              ))}
            </div>
          ) : (
            <p>조리 주의사항은 감지되지 않았습니다. 원문 요청만 참고하세요.</p>
          )}
          <OriginalRequest label="원문 참고" text={originalText} />
        </>
      )}
    </div>
  );
}

function OriginalRequest({ label, text }: { label: string; text: string }) {
  if (!text) {
    return null;
  }

  return (
    <p className="original-request">
      <span>{label}:</span>{" "}
      {text}
    </p>
  );
}

function getActionTone(action: AnalysisAction) {
  if (action.type === "ALLERGY" || action.type === "SAFETY_CHECK" || action.severity === "HIGH") {
    return "danger";
  }
  if (action.type === "COOKING_REQUEST" || action.type === "TASTE_ADJUSTMENT") {
    return "cook";
  }
  if (action.type === "EXCLUDE_INGREDIENT") {
    return "exclude";
  }
  return "neutral";
}

function getAllergyRiskItemIds(analysis: OrderAIAnalysis | null) {
  const ids = new Set<number>();
  analysis?.kitchenActions
    ?.filter((action) => action.type === "ALLERGY")
    .forEach((action) => action.matchedMenuItemIds?.forEach((id) => ids.add(id)));
  return ids;
}

function formatElapsed(now: number, timestamp: string) {
  const start = parseApiTimestamp(timestamp).getTime();
  if (Number.isNaN(start)) {
    return "-";
  }

  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) {
    return `${seconds}초`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}시간`;
}

function parseApiTimestamp(timestamp: string) {
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(timestamp)) {
    return new Date(timestamp);
  }
  return new Date(`${timestamp}Z`);
}

function getStatusLabel(status: OrderStatus) {
  if (status === "NEW") return "접수"
  if (status === "COOKING") return "조리중"
  if (status === "DONE") return "완료"
  return "취소"
}

function statusWeight(status: OrderStatus) {
  if (status === "NEW") return 0;
  if (status === "COOKING") return 1;
  if (status === "DONE") return 2;
  return 3;
}

function getItemGridClass(itemCount: number) {
  if (itemCount >= 6) {
    return "triple";
  }
  if (itemCount >= 3) {
    return "double";
  }
  return "single";
}
