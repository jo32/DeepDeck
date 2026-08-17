# Orb Animation · React + Three.js + TypeScript

> 仓库定位：这是独立的设计原型与预览页面，不属于桌面 app 或 Cordis
> 插件的运行时依赖。产品代码不应直接引用此目录中的设计阶段产物。

这是从当前角色球页面中拆出的独立动画项目。它不包含站点部署逻辑，下载后可以直接运行、修改或嵌入其他 React 项目。

项目包含两种外观：

- Spider：黑色球体和蜘蛛侠眼睛。
- Blue Orb：蓝色球体和两只大圆眼。

两种外观共用完全相同的 Three.js 场景、灯光、镜头、液体动画、表情状态机和交互。

## 运行

需要 Node.js 22.12 或更高版本。

~~~bash
npm install
npm run dev
~~~

生产构建：

~~~bash
npm run build
npm run preview
~~~

## 核心文件

| 文件 | 作用 |
| --- | --- |
| src/SpiderOrbThree.tsx | Three.js 场景、程序化眼睛、表情动画、Marching Cubes 液体效果、拖拽旋转与资源释放 |
| src/orb-expressions.ts | 表情名称和 TypeScript 联合类型 |
| src/App.tsx | 外观切换、表情按钮和复位控制 |
| src/styles.css | 画布布局、加载占位、控制面板和响应式样式 |

## 动画是怎样工作的

每一帧会经过以下步骤：

1. resolveExpression 根据当前选择决定实际表情。Auto 模式每 2.45 秒切换一次。
2. dynamicTarget 从 POSES 读取目标姿态，再叠加眨眼、呼吸、扫描、困倦或惊讶脉冲等时间函数。
3. approachPose 使用指数缓动把当前姿态逼近目标姿态。它与帧率无关，切换表情时不会突然跳变。
4. updateEyePatch 直接改写眼睛 BufferGeometry 的顶点，使眼睛贴在球面上并随表情变形。Blue Orb 的眼睛会始终保持圆形比例。
5. updateLiquidGlyph 使用 MarchingCubes 构建 Thinking、Doing 和 Surprised 的液体符号。它先显示流体连接，再逐渐收敛到稳定几何。
6. applyPose 更新球体缩放、轻微漂浮、头部姿态和拖拽目标四元数，最后由 WebGLRenderer 绘制。

## 可以直接调整的参数

在 src/SpiderOrbThree.tsx 中搜索以下名称：

- POSES：每种表情的眼睛开合、头部缩放、旋转和位移。
- AUTO_SEQUENCE：Auto 模式的播放顺序。
- WHALE_OUTLINE：蓝色版本圆眼的大小。目前半径是 0.18。
- EYE_CENTER_X / EYE_CENTER_Y：两只眼睛在球面的中心位置。
- sphereMaterial：球体颜色、粗糙度和清漆参数。
- lensMaterial / rimMaterial：眼睛颜色与高光。
- liquidMaterial：液体符号的材质。
- applyPose：闲置漂浮、呼吸和头部微动幅度。
- rotateTarget：拖拽旋转灵敏度。

## 性能与清理

- 像素比限制为 2，避免高分屏过度渲染。
- 页面不可见或组件离开视口时暂停 requestAnimationFrame。
- prefers-reduced-motion 开启时使用静态姿态。
- React 组件卸载时会释放几何、材质、渲染列表和 WebGLRenderer。
- ResizeObserver 负责同步画布尺寸，不依赖固定宽高。

## 集成到其他项目

复制以下三个文件即可：

- src/SpiderOrbThree.tsx
- src/orb-expressions.ts
- src/styles.css 中以 orb- 开头的样式

组件需要三个动画控制参数：

~~~tsx
<SpiderOrbThree
  appearance="whale"
  expression="auto"
  expressionEpoch={performance.now()}
  repositionSignal={0}
/>
~~~

appearance 可取 spider 或 whale。expression 的完整类型定义在 orb-expressions.ts。
