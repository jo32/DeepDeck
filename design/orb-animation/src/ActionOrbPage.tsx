import { useState } from "react";
import SpiderOrbThree, {
  type OrbActionMode,
} from "./SpiderOrbThree";
import "./action-orb.css";

type PreviewScale = "detail" | "actual";

const ACTIONS: readonly {
  id: OrbActionMode;
  label: string;
  note: string;
}[] = [
  { id: "face", label: "Doing 正面", note: "0°" },
  { id: "send", label: "Send 背面", note: "180°" },
  { id: "doing", label: "Doing ↔ Stop", note: "360° loop" },
  { id: "stop", label: "Stop 背面", note: "180°" },
];

export default function ActionOrbPage() {
  const [actionMode, setActionMode] = useState<OrbActionMode>("doing");
  const [actionEpoch, setActionEpoch] = useState(() => performance.now());
  const [previewScale, setPreviewScale] = useState<PreviewScale>("detail");

  const chooseAction = (next: OrbActionMode) => {
    setActionMode(next);
    setActionEpoch(performance.now());
  };

  return (
    <main className="action-lab" data-preview-scale={previewScale}>
      <header className="lab-heading">
        <p className="eyebrow">DEEPDECK · ACTION ORB STUDY 02</p>
        <h1>同一颗球，转身完成操作</h1>
        <p className="lab-intro">
          正面是角色的 Doing 表情，白色 Send / Stop 是贴在球体背面的实体标记。
          过程中没有第二张卡片，也不替换 SVG。
        </p>
      </header>

      <section className="orb-specimen" aria-label="3D 操作球视觉原型">
        <div className="scene-note scene-note-front" aria-hidden="true">
          <span>FRONT</span>
          <strong>Doing</strong>
          <small>0° / 360°</small>
        </div>

        <div className="orb-object" data-preview-scale={previewScale}>
          <SpiderOrbThree
            appearance="alien"
            expression={actionMode === "doing" || actionMode === "face" ? "doing" : "neutral"}
            expressionEpoch={actionEpoch}
            repositionSignal={0}
            actionMode={actionMode}
            actionEpoch={actionEpoch}
          />
        </div>

        <div className="scene-note scene-note-back" aria-hidden="true">
          <span>BACK</span>
          <strong>{actionMode === "send" ? "Send" : "Stop"}</strong>
          <small>180°</small>
        </div>

        <div className="turn-path" aria-hidden="true">
          <span className="turn-tick">0°</span>
          <span className="turn-line" />
          <span className="turn-tick">180°</span>
          <span className="turn-line" />
          <span className="turn-tick">360°</span>
        </div>
      </section>

      <section className="design-controls" aria-label="视觉状态控制">
        <div className="control-copy">
          <span className="live-dot" aria-hidden="true" />
          <div>
            <strong>ONE WEBGL OBJECT</strong>
            <small>球体、眼睛和背面图标共享同一个 Three.js 根节点</small>
          </div>
        </div>

        <div className="action-switch" role="group" aria-label="操作状态">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              aria-pressed={actionMode === action.id}
              onClick={() => chooseAction(action.id)}
            >
              <span>{action.label}</span>
              <small>{action.note}</small>
            </button>
          ))}
        </div>

        <div className="scale-switch" role="group" aria-label="预览尺寸">
          <button
            type="button"
            aria-pressed={previewScale === "detail"}
            onClick={() => setPreviewScale("detail")}
          >
            Detail
          </button>
          <button
            type="button"
            aria-pressed={previewScale === "actual"}
            onClick={() => setPreviewScale("actual")}
          >
            <span>Compact</span>
            <small>48 × 60 / hit 34</small>
          </button>
        </div>
      </section>
    </main>
  );
}
