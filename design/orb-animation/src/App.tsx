import { useState } from "react";
import SpiderOrbThree from "./SpiderOrbThree";
import {
  EXPRESSION_OPTIONS,
  type OrbExpression,
} from "./orb-expressions";

type Appearance = "spider" | "whale";

export default function App() {
  const [appearance, setAppearance] = useState<Appearance>("whale");
  const [expression, setExpression] = useState<OrbExpression>("auto");
  const [expressionEpoch, setExpressionEpoch] = useState(0);
  const [repositionSignal, setRepositionSignal] = useState(0);

  const chooseExpression = (next: OrbExpression) => {
    setExpression(next);
    setExpressionEpoch(performance.now());
  };

  return (
    <main className="app-shell" data-appearance={appearance}>
      <SpiderOrbThree
        key={appearance}
        appearance={appearance}
        expression={expression}
        expressionEpoch={expressionEpoch}
        repositionSignal={repositionSignal}
      />

      <section className="control-panel" aria-label="动画控制">
        <div className="appearance-switch" role="group" aria-label="外观">
          <button
            type="button"
            aria-pressed={appearance === "spider"}
            onClick={() => setAppearance("spider")}
          >
            Spider
          </button>
          <button
            type="button"
            aria-pressed={appearance === "whale"}
            onClick={() => setAppearance("whale")}
          >
            Blue Orb
          </button>
        </div>

        <button
          type="button"
          className="reset-button"
          onClick={() => setRepositionSignal((value) => value + 1)}
        >
          ↺ Reset
        </button>

        <div className="expression-list" role="group" aria-label="表情">
          {EXPRESSION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={expression === option.id}
              onClick={() => chooseExpression(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
