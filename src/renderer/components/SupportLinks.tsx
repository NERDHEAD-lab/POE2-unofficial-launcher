import { ChangelogItem } from "../../shared/types";
import { SUPPORT_URLS } from "../../shared/urls";

interface SupportLinksProps {
  onShowAllChangelogs?: (logs: ChangelogItem[]) => void;
}

const SupportLinks: React.FC<SupportLinksProps> = ({ onShowAllChangelogs }) => {
  const linkStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    color: "#ccc",
    textDecoration: "none",
    fontSize: "14px",
    padding: "6px 10px",
    transition: "color 0.2s",
    gap: "8px",
  };

  const hoverStyle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = "var(--theme-accent, #dfcf99)";
  };

  const leaveStyle = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.color = "#ccc";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        marginTop: "10px",
      }}
    >
      <a
        href={SUPPORT_URLS.DONATION}
        target="_blank"
        rel="noreferrer"
        style={linkStyle}
        onMouseEnter={hoverStyle}
        onMouseLeave={leaveStyle}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          local_cafe
        </span>
        후원하기
      </a>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          window.electronAPI.getAllChangelogs().then((logs) => {
            onShowAllChangelogs?.(logs);
          });
        }}
        style={linkStyle}
        onMouseEnter={hoverStyle}
        onMouseLeave={leaveStyle}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          history
        </span>
        패치 노트
      </a>
      <a
        href={SUPPORT_URLS.ISSUES}
        target="_blank"
        rel="noreferrer"
        style={linkStyle}
        onMouseEnter={hoverStyle}
        onMouseLeave={leaveStyle}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          bug_report
        </span>
        기능 건의/버그 제보
      </a>
    </div>
  );
};

export default SupportLinks;
