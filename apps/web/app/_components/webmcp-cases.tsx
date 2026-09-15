import Image from "next/image";
import type { SiteLocale } from "../../lib/locale";
import styles from "./webmcp-cases.module.css";

const images = {
  declined: "/webmcp/cases/figma-declined.png",
  completed: "/webmcp/cases/figma-completed.png",
  cat: "/webmcp/cases/blockbench-cat.png",
} as const;

const copy = {
  zh: {
    label: "真实任务 · FIGMA",
    title: "Figma Agent 不帮你做的，",
    titleEnd: "DeepDeck + WebMCP 帮你做。",
    intro: "新建一个页面，制作 OpenAI logo。这次任务，Figma Agent 表示暂不支持编辑矢量形状或路径。DeepDeck + WebMCP 完成了它。",
    request: "任务：新建页面，制作 OpenAI logo",
    declined: "暂不支持编辑矢量路径",
    declinedBody: "Figma Agent 建议改用工具栏中的 Draw 工具。",
    completed: "已创建可编辑的矢量 logo",
    completedBody: "在新建的 OpenAI 页面中，创建了 360 × 360 的矢量图形。",
    declinedAlt: "Figma Agent 的任务对话：用户要求新建页面制作 OpenAI logo，Agent 回复暂不支持编辑矢量形状或路径。",
    completedAlt: "DeepDeck 完成任务后，Figma 的 OpenAI 页面显示被选中的 360 × 360 矢量 logo。",
    full: "查看完整截图",
    note: "本次任务记录。DeepDeck 的执行过程同时使用了 WebMCP 与浏览器工具。",
    catLabel: "另一个创作案例 · BLOCKBENCH",
    catTitle: "做一只橘猫，交付可编辑的 3D 项目。",
    catBody: "DeepDeck 创建了带有绿眼睛、胡须和卷尾巴的橘猫，并在 Blockbench 中打开。模型按身体、头部、耳朵、爪子和尾巴分组，方便继续修改。",
    catAlt: "Blockbench 画布中的橘猫 3D 模型，带有绿眼睛、胡须、爪子和卷尾巴。",
    filesAlt: "DeepDeck 交付 ginger-cat.bbmodel 可编辑项目和 ginger-cat-preview.png 预览图。",
    files: "项目文件与预览图",
    action: "下载 DeepDeck，试试你的任务",
  },
  en: {
    label: "REAL TASK · FIGMA",
    title: "Figma Agent declined the task.",
    titleEnd: "DeepDeck + WebMCP did it.",
    intro: "Create a new page and make the OpenAI logo. For this task, Figma Agent said it couldn't edit vector shapes or paths yet. DeepDeck + WebMCP completed it.",
    request: "The task: create a new page and make the OpenAI logo",
    declined: "Vector editing not supported yet",
    declinedBody: "Figma Agent suggested using the Draw tool in the toolbar.",
    completed: "Editable vector logo created",
    completedBody: "A 360 × 360 vector graphic on a newly created OpenAI page.",
    declinedAlt: "Figma Agent conversation: the user asks for an OpenAI logo on a new page; the agent says it cannot edit vector shapes or paths yet.",
    completedAlt: "After DeepDeck completes the task, Figma shows a selected 360 × 360 vector logo on the OpenAI page.",
    full: "View full screenshot",
    note: "A record of this task. DeepDeck used WebMCP alongside browser tools during execution.",
    catLabel: "ANOTHER CREATIVE TASK · BLOCKBENCH",
    catTitle: "Make a ginger cat. Deliver an editable 3D project.",
    catBody: "DeepDeck created a ginger cat with green eyes, whiskers, and a curled tail, then opened it in Blockbench. The body, head, ears, paws, and tail are grouped for further editing.",
    catAlt: "A ginger cat model on the Blockbench canvas, with green eyes, whiskers, paws, and a curled tail.",
    filesAlt: "DeepDeck delivers the editable ginger-cat.bbmodel project and a ginger-cat-preview.png image.",
    files: "Project file and preview",
    action: "Download DeepDeck and try your task",
  },
} as const;

// Show a focused region without altering the evidence. Each image links to its
// original, unmodified capture; the crop scales with the available width.
function ScreenshotRegion({ src, alt, fullLabel, width, height, crop, sizes }: {
  src: string;
  alt: string;
  fullLabel: string;
  width: number;
  height: number;
  crop: readonly [number, number, number, number];
  sizes: string;
}) {
  const [x, y, cropWidth, cropHeight] = crop;
  return (
    <a className={styles.imageLink} href={src} target="_blank" rel="noreferrer" aria-label={`${fullLabel}: ${alt}`}>
      <div className={styles.viewport} style={{ aspectRatio: `${cropWidth} / ${cropHeight}` }}>
        <Image src={src} alt={alt} width={width} height={height} sizes={sizes}
          style={{ width: `${width / cropWidth * 100}%`, left: `${-x / cropWidth * 100}%`, top: `${-y / cropHeight * 100}%` }} />
      </div>
      <span className={styles.expand}>{fullLabel} <span aria-hidden="true">↗</span></span>
    </a>
  );
}

export function WebMCPCases({ locale }: { locale: SiteLocale }) {
  const content = copy[locale];
  return (
    <div className={styles.cases}>
      <section id="figma-case" className={styles.figma} aria-labelledby="figma-case-title">
        <p className={styles.eyebrow}>{content.label}</p>
        <h3 id="figma-case-title" className={styles.title}>{content.title} <span>{content.titleEnd}</span></h3>
        <p className={styles.intro}>{content.intro}</p>
        <p className={styles.request}>{content.request}</p>
        <div className={styles.comparison}>
          <figure className={styles.result}>
            <figcaption>
              <span className={styles.product}>Figma Agent</span>
              <h4>{content.declined}</h4>
              <p>{content.declinedBody}</p>
            </figcaption>
            <ScreenshotRegion src={images.declined} alt={content.declinedAlt} fullLabel={content.full}
              width={2880} height={1880} crop={[90, 300, 720, 600]} sizes="(max-width: 720px) 380vw, 2400px" />
          </figure>
          <figure className={`${styles.result} ${styles.success}`}>
            <figcaption>
              <span className={styles.product}>DeepDeck + WebMCP</span>
              <h4>{content.completed}</h4>
              <p>{content.completedBody}</p>
            </figcaption>
            <ScreenshotRegion src={images.completed} alt={content.completedAlt} fullLabel={content.full}
              width={2880} height={1880} crop={[580, 510, 1080, 900]} sizes="(max-width: 720px) 250vw, 1600px" />
          </figure>
        </div>
        <p className={styles.note}>{content.note}</p>
      </section>

      <section id="blockbench-case" className={styles.blockbench} aria-labelledby="blockbench-case-title">
        <div className={styles.catCopy}>
          <p className={styles.eyebrow}>{content.catLabel}</p>
          <h3 id="blockbench-case-title">{content.catTitle}</h3>
          <p>{content.catBody}</p>
          <p className={styles.fileLabel}>{content.files}</p>
          <ScreenshotRegion src={images.cat} alt={content.filesAlt} fullLabel={content.full}
            width={3456} height={2166} crop={[2660, 1120, 760, 650]} sizes="(max-width: 720px) 430vw, 1900px" />
        </div>
        <div className={styles.catImage}>
          <ScreenshotRegion src={images.cat} alt={content.catAlt} fullLabel={content.full}
            width={3456} height={2166} crop={[900, 540, 1000, 900]} sizes="(max-width: 720px) 325vw, 2500px" />
        </div>
      </section>
      <a className="text-link" href="https://github.com/jo32/DeepDeck/releases/latest" target="_blank" rel="noreferrer">
        {content.action} <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
