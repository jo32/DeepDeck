import { useEffect, useState, type CSSProperties } from "react";
import type { DesktopBranding } from "../shared/branding.js";
import type { HarnessRuntimeStatus } from "../shared/runtime.js";

const initialBranding: DesktopBranding = {
  id: "openworkbuddy",
  name: "OpenWorkBuddy",
  tagline: "你的本地智能工作伙伴",
  accentColor: "#635BFF",
  accentColorSoft: "#EEEAFE",
  markDataUrl: "",
};

const initialStatus: HarnessRuntimeStatus = {
  state: "starting",
  message: "正在连接 OpenWorkBuddy…",
};

export function App(): React.JSX.Element {
  const [branding, setBranding] = useState(initialBranding);
  const [status, setStatus] = useState(initialStatus);
  const [restarting, setRestarting] = useState(false);

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

  return (
    <main className="shell" style={style}>
      <section className="card" aria-live="polite">
        <div className="mark" aria-hidden="true">
          {branding.markDataUrl ? <img src={branding.markDataUrl} alt="" /> : null}
        </div>
        <p className="eyebrow">LOCAL AI WORKSPACE</p>
        <h1>{branding.name}</h1>
        <p className="tagline">{branding.tagline}</p>
        <div className={`status status-${status.state}`}>
          <span className="status-dot" />
          <span>{status.message}</span>
        </div>
        {status.details ? <pre className="details">{status.details}</pre> : null}
        {status.state === "error" ? (
          <button type="button" disabled={restarting} onClick={() => void restart()}>
            {restarting ? "正在重试…" : "重新启动"}
          </button>
        ) : null}
        <p className="hint">本地智能服务就绪后会自动打开工作区。</p>
      </section>
    </main>
  );
}
