import * as React from "react";
import { useEffect, useState, type CSSProperties } from "react";
import type { DesktopBranding } from "../shared/branding.js";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";

const initialBranding: DesktopBranding = {
  id: "deepdeck",
  name: "DeepDeck",
  tagline: "你的本地智能工作伙伴",
  accentColor: "#635BFF",
  accentColorSoft: "#EEEAFE",
  markDataUrl: "",
};

const initialStatus: HarnessRuntimeStatus = {
  state: "starting",
  message: "正在连接 DeepDeck…",
};

export const CONNECTION_STATUS_DELAY_MS = 3_000;

export function App(): React.JSX.Element {
  const [branding, setBranding] = useState(initialBranding);
  const [status, setStatus] = useState(initialStatus);
  const [restarting, setRestarting] = useState(false);
  const [showConnectionStatus, setShowConnectionStatus] = useState(false);
  const hasError = status.state === "error";

  useEffect(() => {
    let active = true;
    void window.deepseekDesktop.branding.get().then((next) => {
      if (active) setBranding(next);
    });
    const removeListener = window.deepseekDesktop.runtime.onStatus((next) => {
      if (active) setStatus(next);
    });
    void window.deepseekDesktop.runtime.get().then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
      removeListener();
    };
  }, []);

  useEffect(() => {
    if (hasError) {
      setShowConnectionStatus(false);
      return;
    }
    setShowConnectionStatus(false);
    const timer = window.setTimeout(() => {
      setShowConnectionStatus(true);
    }, CONNECTION_STATUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hasError]);

  const restart = async (): Promise<void> => {
    setRestarting(true);
    try {
      setStatus(await window.deepseekDesktop.runtime.restart());
    } finally {
      setRestarting(false);
    }
  };

  const style = {
    "--brand-accent": branding.accentColor,
    "--brand-accent-soft": branding.accentColorSoft,
  } as CSSProperties;

  const connectionState = status.state === "ready" ? "starting" : status.state;
  const connectionMessage = status.state === "ready"
    ? `正在打开 ${branding.name}…`
    : status.message;

  return (
    <main className="shell" style={style} data-desktop-splash>
      <aside className="skeleton-sidebar" aria-hidden="true" data-splash-sidebar>
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">
            {branding.markDataUrl ? (
              <img src={branding.markDataUrl} alt="" />
            ) : (
              <span className="sidebar-brand-fallback" />
            )}
          </span>
          <span className="sidebar-brand-name">{branding.name}</span>
        </div>
        <span className="skeleton-block sidebar-primary" />
        <div className="sidebar-section">
          <span className="skeleton-block sidebar-caption" />
          <span className="skeleton-block sidebar-row sidebar-row-wide" />
          <span className="skeleton-block sidebar-row" />
          <span className="skeleton-block sidebar-row sidebar-row-short" />
        </div>
        <div className="sidebar-footer">
          <span className="skeleton-block sidebar-footer-row" />
          <span className="skeleton-block sidebar-footer-row" />
        </div>
      </aside>

      <section className="workspace-shell">
        <header className="workspace-header">
          <div className="header-skeleton" aria-hidden="true">
            <span className="skeleton-block header-icon" />
            <span className="skeleton-block header-title" />
          </div>
          {showConnectionStatus ? (
            <div
              className={`status status-${connectionState}`}
              role="status"
              aria-live="polite"
            >
              <span className="status-dot" />
              <span>{connectionMessage}</span>
            </div>
          ) : null}
        </header>

        {hasError ? (
          <div className="error-state" data-splash-error>
            <span className="error-symbol" aria-hidden="true">!</span>
            <h1>无法打开工作区</h1>
            <p className="error-message">{status.message}</p>
            {status.details ? <pre className="details">{status.details}</pre> : null}
            <button
              className="retry-button"
              type="button"
              disabled={restarting}
              onClick={() => void restart()}
            >
              {restarting ? "正在重试…" : "重新启动"}
            </button>
            <p className="hint">重试后，工作区会在本地服务就绪时自动打开。</p>
          </div>
        ) : (
          <div className="skeleton-stage" aria-hidden="true" data-splash-skeleton>
            <div className="conversation-skeleton">
              <div className="message-skeleton message-user">
                <div className="message-lines message-lines-user">
                  <span className="skeleton-block line line-medium" />
                  <span className="skeleton-block line line-short" />
                </div>
              </div>
              <div className="message-skeleton message-assistant">
                <span className="skeleton-block message-avatar" />
                <div className="message-lines">
                  <span className="skeleton-block line line-wide" />
                  <span className="skeleton-block line" />
                  <span className="skeleton-block line line-medium" />
                </div>
              </div>
              <div className="message-skeleton message-assistant message-assistant-last">
                <span className="skeleton-block message-avatar" />
                <div className="message-lines">
                  <span className="skeleton-block line line-wide" />
                  <span className="skeleton-block line line-short" />
                </div>
              </div>
            </div>

            <div className="composer-skeleton" data-splash-composer>
              <span className="skeleton-block composer-placeholder" />
              <div className="composer-actions">
                <div className="composer-actions-left">
                  <span className="skeleton-block composer-circle" />
                  <span className="skeleton-block composer-pill" />
                </div>
                <span className="skeleton-block composer-send" />
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
