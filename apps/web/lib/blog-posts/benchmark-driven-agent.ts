import type { BlogPost } from '../blog-types';

export const benchmarkDrivenAgent: BlogPost = {
  slug: 'benchmark-driven-agent-iteration',
  date: '2026-09-23',
  author: 'jo32',
  translations: {
    zh: {
      title: '我如何用 Benchmark 迭代 Agent',
      description: '我通过调用记录定位了 MiMo 的工具参数错误，修改 DeepDeck 接口后复测，对比错误率、耗时、轮次和费用。',
      category: '开发手记 · Agent 评测',
      introduction: [
        '我用 DeepDeck Bench 比较几个模型完成浏览器任务的成本、耗时，以及开启 WebMCP 后的步骤变化。MiMo 的工具调用错误较多，我进一步检查了调用记录，想确认问题出在模型决策还是工具接口。',
        '我保持模型不变，修改了 DeepDeck 的工具调用接口，再复测原来错误较多的用例。MiMo 在这组题上的耗时明显下降，Luna 的总耗时基本持平。下面是问题定位、修改和复测的过程。',
      ],
      sections: [
        {
          id: 'question', title: '初测：MiMo 成本低，但耗时较长',
          paragraphs: [
            'DeepDeck 是基于 DeepSeek Harness 构建的桌面客户端。Harness 提供模型执行任务所需的环境，包括可见信息、工具接口、错误反馈和结果检查。',
            'DeepDeck Bench 当时覆盖 8 个本地网站、49 道浏览器任务。每个模型都分别跑开启和关闭 WebMCP 的两组。WebMCP 让网站把“查询订单”“筛选目录”这类操作直接提供成工具；关闭时，Agent 需要通过其他浏览器操作完成任务。两组对照用于评估 WebMCP 对任务完成情况和资源用量的影响。',
            '初测中，MiMo V2.6 Flash 的成本低，但耗时较长，开启 WebMCP 后节省的步骤也少于预期。我最初认为它使用工具不够高效，但还需要从调用记录中确认原因。',
            '我按工具发现、工具选择、参数填写和结果确认几个阶段检查记录，寻找耗时和错误集中的步骤。',
          ],
        },
        {
          id: 'trace', title: '调用记录：模型混淆了目录标识和工具版本',
          paragraphs: [
            '调用记录显示，MiMo 会发现并调用 WebMCP 工具。其中一类重复错误是把工具目录的 digest 当成某个工具的 revision。前者是整份目录的缓存标识，后者是工具版本，两者不能混用。',
            '旧接口要求模型提供业务参数，同时填写工具名、frameId、documentId，以及适用时的 revision。即使选对了工具，定位信息填写错误也会导致调用被拒绝。模型随后重新发现工具、再次尝试，增加了耗时和 token 用量。',
            '这类错误说明，接口设计也影响了模型表现。工具定位信息可以由程序保存和校验，旧接口却要求模型每次填写。Luna 较少填错，但这项要求对完成业务任务并无必要。',
          ],
        },
        {
          id: 'change', title: '修改：不用模型重复填写页面和版本编号', figure: 'tool-reference',
          paragraphs: [
            '我让 DeepDeck 在列出工具时，为每个工具生成一个短编号，叫 toolRef。同时，DeepDeck 保存这个编号对应的页面、页面内区域和工具版本。模型从清单中选择工具后，只需提供工具编号和查询内容。原来要由模型抄写的定位信息，改由 DeepDeck 自动取出并检查。',
            '模型仍然负责选择工具和填写业务参数。工具定位信息由 DeepDeck 管理，不再要求模型重复填写。',
            '页面或工具变化后，旧引用失效，调用会被拒绝。旧格式的调用仍保留严格的身份校验。',
            '我还把错误分成两类：“没有派发操作”和“操作可能已经执行，但结果未知”。前一种可以重新发现工具；后一种要先检查业务状态。例如提交订单后页面跳转了，不能因为没拿到返回值，就自动再提交一次。',
            '这些修改放在 DeepDeck 的 browser 插件里，没有直接改上游 Harness 源码。单元测试和真实 Electron 验证先确认了调用、导航失效和工具版本替换的行为，再做模型复测。',
          ],
        },
        {
          id: 'experiment', title: '复测：两个模型、六道题，每题三次',
          paragraphs: [
            '这轮没有重跑全部 49 题。我挑了 6 个 WebMCP 调用错误较多的用例：权限边界、目录筛选、服务查询、课程报名、活动地点和订单查询。MiMo、Luna 各题各跑 3 次，共 36 次正式运行。',
            '这些题在旧版里最终也通过了，中间有工具调用错误。因此，本轮比较的是调用错误、执行轮次、耗时和费用，不能据此声称任务成功率提高。',
            '正式对照核对了题库、模型配置、上下文窗口、最大输出配置，以及可用工具名称集合。计时使用 Agent 执行时间，不把网站启动、重置和评分算进去。',
            '旧基线每题只有一次，新版每题三次，而且不是同一时间随机交替运行。这种历史对照无法排除运行时间和模型输出波动的影响，不能把所有差异都归因于代码修改。',
          ],
        },
        {
          id: 'results', title: '结果：MiMo 耗时下降，Luna 基本持平', figure: 'retest',
          paragraphs: [
            '36 次正式运行全部通过。下面的时间、轮次和费用，都是完成这 6 题的一组总量：旧版是一轮，新版是三轮的平均。WebMCP 错误率则按各组全部工具调用计算，不是任务失败率。',
            'MiMo 的总耗时从 20.04 分钟降至 5.75 分钟，执行轮次从 108 降至 60.3，估算费用下降约 53%。Luna 的工具错误也减少了，但总耗时几乎没变。',
            '一个具体例子是查询 Yoga Class 是否存在。MiMo 旧版花了 150.5 秒，有 6 次 WebMCP 调用错误；新版三次复测都没有这类错误，平均 14.0 秒完成。',
            'MiMo 旧订单题有一次接近 590 秒的慢运行，放大了整体耗时差异。去掉这题，其余 5 题的总耗时仍从 612.5 秒降到平均 304.8 秒，约减少一半，但仍受旧基线只有一次的限制。',
          ],
        },
        {
          id: 'counterexamples', title: '退步用例和剩余错误',
          paragraphs: [
            '权限边界题中，MiMo 的平均执行轮次从 25 增至 26.7，费用也增加了；Luna 在这题上从 24.5 秒变成平均 55.5 秒。Luna 的课程报名题同样变慢。这次修改没有解决模型反复探索、未及时停止的问题。',
            '两模型仍有 14 次调用使用了过期引用，另有 8 次在操作中遇到路由变化，无法直接确认结果。后续需要改进导航后的工具发现，以及页面跳转后的业务状态确认。',
            '对于课程和订单题，我还检查了工具返回的业务证据，确认报名和首课访问实际发生，以及注册得到的订单号确实用同一个邮箱查询过。完成情况以这些记录为依据。',
          ],
        },
        {
          id: 'accounting', title: '缓存计费与异常运行',
          paragraphs: [
            '费用按实际未缓存输入、缓存输入、输出，以及适用的缓存写入分别计算，统一使用原报告的美元单价。Luna 这里是 API 等价估算，不是 ChatGPT 订阅的实际增量账单。缺失用量不能直接当作零。',
            '这次 MiMo 的输入缓存命中比例从 92.54% 降至 90.50%，Luna 从 76.19% 到 76.07%。新版的整体缓存命中比例没有提高。不过，重复运行仍可能改变服务端缓存，费用差异不能全部归因于代码修改。',
            '过程中也有需要排除的运行。MiMo 最初 9 次预检没有匹配旧配置，单独归档后重新跑正式组；Luna 的 3 次订单题遇到评分端凭据过期，原始失败保留，修复评分环境后整组三次重跑，而不是挑一个成功结果。',
            '正式比较用了 36 次运行，实际记录了 48 次。被排除的运行同样消耗了资源，因此也计入账本：本次所有已记录运行的 API 等价估算合计约 $0.244。',
          ],
        },
        {
          id: 'workflow', title: '后续迭代流程',
          paragraphs: [
            '这次评测帮助我定位了反复发生的参数错误，并通过复测检查接口修改的效果。',
            '后续迭代按以下步骤进行：',
          ],
          points: [
            '先保留旧版本、题库和运行配置，让下一次还有可比较的基线。',
            '从耗时、成本和失败记录中选择问题，再检查对应的调用过程。',
            '围绕一个明确原因修改接口或执行流程，先验证程序行为，再让模型重跑。',
            '同时报告改善、退步和环境异常；把中间调用错误与最终任务失败分开。',
            '用同样的任务和计费口径检查结果，再决定是否扩大到全量回归。',
          ],
        },
        {
          id: 'baseline', title: '保留旧 Harness 作为对照基线',
          paragraphs: [
            '修复合入 main 前，我把旧版本保存到了 deepdeck-bench 分支。这样以后继续比较模型时，可以选择相同的 Harness；如果要评估 Harness 本身的进步，也可以明确地比较新旧版本。',
            '如果模型和 Harness 同时变化，就无法区分两者对结果的影响。除代码版本外，题库、配置、运行条件和费用口径也需要记录。',
            '这次修复已合入 main。复测支持它在这组选定用例上减少调用错误、降低 MiMo 执行成本；全题库表现还需要进一步验证。',
          ],
        },
      ],
    },
    en: {
      title: 'How I use benchmarks to improve an agent',
      description: 'I traced repeated tool-argument errors in MiMo to the DeepDeck interface, changed it, and compared errors, time, steps, and cost in a retest.',
      category: 'Engineering notes · Agent evaluation',
      introduction: [
        'I used DeepDeck Bench to compare browser agents on cost, time, and the effect of enabling WebMCP. MiMo made frequent tool-call errors, so I inspected the traces to distinguish model decisions from interface problems.',
        'I kept the models unchanged, modified the tool-calling interface, and reran tasks with frequent tool errors. MiMo became substantially faster on this selection; Luna’s total time barely changed. This article describes the diagnosis, implementation, and retest.',
      ],
      sections: [
        { id: 'question', title: 'Initial results: MiMo costs less but takes longer', paragraphs: [
          'DeepDeck is a desktop client built on DeepSeek Harness. A harness is the environment around the model: what it can observe, which tools it can call, how errors are reported, and how it checks that an action worked. The model makes decisions; the harness gives it ways to carry them out.',
          'The benchmark covered 49 tasks across eight local websites, with WebMCP on and off for each model. WebMCP exposes operations such as looking up an order or filtering a directory as callable tools. With it disabled, the agent completes tasks through other browser operations. The paired runs help show whether the tools actually help.',
          'MiMo V2.6 Flash was inexpensive, but slower, and enabling WebMCP did not save as many steps as I expected. I initially attributed this to inefficient tool use, then checked the calls to identify the cause.',
          'I examined tool discovery, selection, arguments, and result verification to locate repeated errors and delays.',
        ] },
        { id: 'trace', title: 'The traces showed identifiers being copied incorrectly', paragraphs: [
          'MiMo was discovering and calling WebMCP tools. One recurring mistake was specific: it used the tool catalog digest as an individual tool revision. The digest identifies the catalog for caching; the revision identifies a tool version. They are not interchangeable.',
          'The old interface required the model to copy the tool name, frameId, documentId, and revision where applicable, alongside the business inputs. It could understand that it needed to check an order and still have its call rejected for copying the wrong identifier. Discovery and retries then consumed more time and tokens.',
          'The interface contributed to these errors by requiring models to supply identifiers that code could store and validate. Luna made fewer mistakes, but requiring it to copy those identifiers was still unnecessary.',
        ] },
        { id: 'change', title: 'Change: stop asking the model to copy page and version identifiers', figure: 'tool-reference', paragraphs: [
          'DeepDeck now assigns each discovered tool a short reference called toolRef and saves its document, frame, and version. The model selects a tool from the list and sends its reference with the business inputs. DeepDeck retrieves and validates the saved identifiers instead of asking the model to copy them.',
          'The model still decides which tool to use and what to ask it to do. It no longer has to transcribe all the routing identifiers for every call.',
          'The shorter interface preserves the checks. A page or tool change invalidates the old reference; it never silently redirects an action to a new tool. Legacy explicit-identity calls remain strictly validated.',
          'Errors also distinguish an action that was not dispatched from one whose outcome is unknown. The first calls for rediscovery. The second calls for checking business state: if submitting an order causes navigation, a missing return value must not trigger an automatic second submission.',
          'The change lives in DeepDeck’s browser plugin, without modifying upstream Harness source. Unit tests and a real Electron check covered execution, navigation invalidation, and tool-version replacement before the model retest.',
        ] },
        { id: 'experiment', title: 'Rerun the tasks that exposed the problem', paragraphs: [
          'I selected six WebMCP ON tasks with frequent call errors: an access boundary, directory filtering, a service lookup, course enrollment, an event location, and an order lookup. Each model ran each task three times: 36 formal attempts across MiMo and Luna.',
          'These tasks had ultimately passed in the old run too. The failures occurred during tool calls. This experiment tests whether the agent can complete the same task with fewer errors, steps, seconds, and dollars. It does not demonstrate a higher task success rate.',
          'The formal comparison checked the corpus, model configuration, context window, maximum-output configuration, and available tool-name set against each model’s baseline. Timing includes agent execution, excluding environment startup, resets, and scoring.',
          'The old baseline has one attempt per task, while the new run has three. This is a historical comparison, not a contemporaneous randomized A/B test. It provides evidence for an improvement, but cannot attribute every difference to the code change.',
        ] },
        { id: 'results', title: 'Results: MiMo is faster; Luna’s time is similar', figure: 'retest', paragraphs: [
          'All 36 formal attempts passed. Time, steps, and cost below are totals for completing the six-task suite: one old run versus the average of three new runs. The WebMCP error rate uses all calls in each group, not the number of failed tasks.',
          'MiMo went from 20.04 to 5.75 minutes, from 108 to 60.3 steps, and used about 53% less estimated cost. Luna also made fewer tool errors, but its total time barely changed.',
          'For the Yoga Class existence check, old MiMo took 150.5 seconds and made six WebMCP call errors. The three new attempts had none of those errors and averaged 14.0 seconds.',
          'The old MiMo order task took almost 590 seconds, making the aggregate time reduction look larger. Even excluding that task, the other five went from 612.5 to an average of 304.8 seconds, roughly half the time. The single-attempt historical baseline remains a limitation.',
        ] },
        { id: 'counterexamples', title: 'Regressions and remaining errors', paragraphs: [
          'The access-boundary task remained difficult. MiMo’s average steps increased from 25 to 26.7, and cost rose. Luna went from 24.5 to an average of 55.5 seconds on that task, and also became slower on course enrollment. The change did not resolve repeated exploration or delayed stopping.',
          'Across both models, 14 remaining WebMCP errors involved stale references and eight involved navigation during an operation, leaving the outcome unknown. Those traces identify concrete follow-ups: refreshing discovery after navigation and confirming business state after an action changes the page.',
          'I also inspected tool-return evidence for the course and order tasks. Enrollment and the first lesson had to actually occur; the returned order reference had to be checked with the same email. A final answer saying “done” is not sufficient evidence.',
        ] },
        { id: 'accounting', title: 'Account for caching and the evaluation environment', paragraphs: [
          'Costs use recorded uncached input, cached input, output, and cache writes where applicable, at the original report’s fixed USD rates. Luna costs are API-equivalent estimates, not incremental ChatGPT subscription charges. Missing usage cannot be treated as zero.',
          'MiMo’s input cache-hit share fell from 92.54% to 90.50%; Luna’s changed from 76.19% to 76.07%. The lower overall cost did not come with a higher aggregate cache-hit share. Repeated runs can still affect server-side caching, so I would not attribute every cost difference to the code.',
          'Nine initial MiMo calibration attempts did not match the old model configuration and were archived separately. Three Luna order attempts hit expired evaluator credentials. Their original failures were retained, then the entire group was rerun after refreshing evaluator authentication, rather than selecting a successful attempt.',
          'The formal comparison has 36 attempts; the experiment recorded 48. Excluded runs also consumed resources, so the ledger includes them. All recorded runs together cost approximately $0.244 on an API-equivalent basis.',
        ] },
        { id: 'workflow', title: 'The process for subsequent iterations', paragraphs: [
          'The benchmark identified repeated argument errors and provided tasks for checking whether the interface change reduced them.',
          'For subsequent iterations, I will use these steps:',
        ], points: [
          'Preserve the old version, task corpus, and run configuration before changing anything.',
          'Use time, cost, and failure records to select a concrete problem, then inspect the calls.',
          'Change an interface or execution path around a specific cause; test the code before rerunning the model.',
          'Report improvements, regressions, and environment failures; distinguish call errors from failed tasks.',
          'Compare the same tasks and cost definitions, then decide whether to expand to a full regression run.',
        ] },
        { id: 'baseline', title: 'Preserve the old harness as a baseline', paragraphs: [
          'Before merging the fix into main, I saved the previous version on deepdeck-bench. Future model comparisons can use the same harness, while harness improvements can be evaluated explicitly as version comparisons.',
          'Changing the model and harness together makes their effects difficult to distinguish. Comparisons need recorded code versions, corpus, configuration, run conditions, and pricing definitions.',
          'The fix has been merged into main. The retest supports fewer tool-call errors and lower MiMo execution cost on this selection. Its effect on the full task suite still needs evaluation.',
        ] },
      ],
    },
  },
  sources: [
    { href: 'https://github.com/jo32/DeepDeck/pull/8', label: { zh: '修复代码与验证：PR #8', en: 'Implementation and validation: PR #8' } },
    { href: 'https://github.com/jo32/DeepDeck/blob/a607ab5aab48500072b29506ec4a0580792bb9d7/docs/benchmarks/webmcp-reference-retest-2026-09-23.md', label: { zh: '完整复测报告与逐题结果', en: 'Full retest report and per-task results' } },
    { href: '/research/benchmarks/webmcp-reference-retest-2026-09-23.json', label: { zh: '复核数据：逐次用量、费用与排除记录（JSON）', en: 'Per-attempt usage, costs, and exclusions (JSON)' } },
    { href: 'https://github.com/jo32/DeepDeck/tree/031f6bfbf85add92f7b8f1d87dc37394a27f724d', label: { zh: 'deepdeck-bench 保存的旧版提交', en: 'Pre-fix commit preserved by deepdeck-bench' } },
  ],
};
