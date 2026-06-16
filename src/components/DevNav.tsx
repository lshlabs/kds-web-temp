/**
 * DEV ONLY — 개발용 페이지 이동 버튼.
 * 삭제 방법: 이 파일을 삭제하고 각 페이지에서 <DevNav /> import/사용 제거.
 */

type Page = "auth" | "pending" | "kds";

type DevNavProps = {
  current: Page;
  onNavigate: (page: Page) => void;
};

const PAGES: { id: Page; label: string }[] = [
  { id: "auth", label: "Auth" },
  { id: "pending", label: "Pending" },
  { id: "kds", label: "KDS" },
];

export function DevNav({ current, onNavigate }: DevNavProps) {
  return (
    <div
      aria-label="개발용 페이지 이동"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        display: "flex",
        gap: 4,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: "4px 6px",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.35)",
          alignSelf: "center",
          paddingRight: 6,
          textTransform: "uppercase",
        }}
      >
        DEV
      </span>
      {PAGES.map(({ id, label }) => (
        <button
          key={id}
          disabled={current === id}
          onClick={() => onNavigate(id)}
          type="button"
          style={{
            background: current === id ? "rgba(249,115,22,0.85)" : "transparent",
            border: "none",
            borderRadius: 5,
            color: current === id ? "#fff" : "rgba(255,255,255,0.6)",
            cursor: current === id ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 600,
            height: 26,
            padding: "0 10px",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (current !== id) (e.currentTarget as HTMLButtonElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            if (current !== id) (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.6)";
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
