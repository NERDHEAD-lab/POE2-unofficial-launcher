import DOMPurify from "dompurify";
import { marked } from "marked";
import React, { useEffect } from "react";
import "github-markdown-css/github-markdown-dark.css";

import { ChangelogItem } from "../../../shared/types";
import { filterChangelogBody } from "../../utils/string";
import "./ChangelogView.css";

interface ChangelogViewProps {
  changelogs: ChangelogItem[];
  className?: string; // For additional styling/scrolling control
}

const ChangelogView: React.FC<ChangelogViewProps> = ({
  changelogs,
  className = "",
}) => {
  useEffect(() => {
    // Configure marked to open links in new tab (external browser)
    marked.use({
      gfm: true,
      breaks: true,
      renderer: {
        link(token) {
          const { href, title, text } = token;
          const isExternal = href.startsWith("http");
          const target = isExternal
            ? ' target="_blank" rel="noopener noreferrer"'
            : "";
          const titleAttr = title ? ` title="${title}"` : "";
          return `<a href="${href}"${target}${titleAttr}>${text}</a>`;
        },
      },
    });
  }, []);

  return (
    <div className={`changelog-content ${className}`}>
      {changelogs.map((log) => {
        const filteredBody = filterChangelogBody(log.body || "");

        return (
          <div key={log.version} className="changelog-item">
            <div className="changelog-item-header">
              <div className="changelog-version-info">
                <span className="changelog-version">v{log.version}</span>
                <span className="changelog-date">
                  {new Date(log.date).toLocaleDateString()}
                </span>
              </div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.open(log.htmlUrl, "_blank");
                }}
                className="changelog-github-link"
              >
                GitHub에서 보기 &rarr;
              </a>
            </div>
            <div className="markdown-body changelog-markdown-body">
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(
                    marked.parse(filteredBody) as string,
                    {
                      ADD_ATTR: ["target", "rel"],
                    },
                  ),
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ChangelogView;
