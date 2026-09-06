// Use the upstream Markdown renderer unchanged, including its native anchors.
import { createRoot } from 'react-dom/client';
import { MarkdownText } from '../../../vendor/deepseek-harness/packages/client/ui-primitives/src/markdown/MarkdownText';

const site = new URL(location.href).searchParams.get('site')!;
createRoot(document.getElementById('root')!).render(<main>
  <h2>Site Agent link verification</h2>
  <MarkdownText text={`- [Open cited article](${site}/article?source=agent#details)
- [Open background article](${site}/background)
- [Open by keyboard](${site}/keyboard)
- [Protected Harness URL](${location.origin}/private)
- [Unsafe file URL](file:///etc/passwd)`} />
  <p><a href={`${site}/same-window`}>Open same-window link</a></p>
  <textarea aria-label="Agent draft" defaultValue="Keep this unsent draft" />
</main>);
