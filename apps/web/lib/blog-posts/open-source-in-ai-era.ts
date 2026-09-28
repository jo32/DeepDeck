import type { BlogPost, BlogTranslation } from '../blog-types';

const sectionIds = ['implementations', 'task-definitions', 'self-improvement', 'contributions', 'evaluating-benchmarks', 'closing'];

function article(markdown: string, metadata: Pick<BlogTranslation, 'title' | 'description' | 'category'>): BlogTranslation {
  const [introduction, ...sections] = markdown.trim().split(/^## /m);
  return {
    ...metadata,
    introduction: introduction.trim().split(/\n\n/),
    sections: sections.map((section, index) => {
      const newline = section.indexOf('\n');
      return { id: sectionIds[index], title: section.slice(0, newline).trim(), paragraphs: [], markdown: section.slice(newline).trim() };
    }),
  };
}

const zh = `最近做开发，我有些沮丧，也有些迷茫。

LLM 写代码的能力，已经强到让我无法回避一个事实：很多时候，它确实比我写得好，也快得多。我开始不知道，自己继续写代码到底还有多大意义。

对程序员来说，写代码往往不只是完成工作。学会一门语言、理解一个复杂系统、把功能实现出来，这些过程也构成了我们对自身能力的判断。当模型越来越轻松地完成这些事情，过去花很多时间掌握的能力，似乎一夜之间就不再稀缺了。

享受工具带来的便利，和接受自己的能力被重新衡量，是两件需要分别消化的事。一句"以后学会用 AI 就好了"，回答不了所有困惑。

我还在写软件，也还在想：当大量实现工作可以交给模型之后，作为程序员，应该把精力放在哪里？如果继续做开源，什么值得留下来，让别人使用和改进？

目前，我有一个不算成熟的判断：

**当实现越来越容易生成，开源应该把更多精力放在任务定义、Benchmark 和验收标准上。**

我们习惯通过代码分享解决方案，也把开发过程中积累的经验留在代码里。但当同一个问题可以被模型反复实现，哪些经验应该独立于某一版代码保留下来？从最近几个具体的开发实践中，我开始看到一些值得讨论的变化。

## 一、实现可以更换，问题和要求需要保留

### 1. 连 Linus 也会借助模型跨越语言门槛

Linux 和 Git 的作者 Linus Torvalds，在个人音频项目 [AudioNoise](https://github.com/torvalds/AudioNoise) 中，使用 Google Antigravity 编写了一个 Python 音频可视化工具。他在 README 里坦言，自己对 Python 的了解很有限，最初靠搜索和模仿示例编程，后来把更多实现工作交给了 AI。

在[这次提交](https://github.com/torvalds/AudioNoise/commit/93a72563cba609a414297b558cb46ddd3ce9d6b5)中，他也记下了自己的参与：发现矩形选择功能有问题，指导模型改用自定义实现，效果随即明显改善。他认为，这次的结果比自己手写还要好。

这个例子有明确的边界——AI 编写的是个人项目里的可视化工具。但它说明，即使是经验最丰富的程序员，也可以借助模型，完成自己不熟悉的语言领域里的工作。语言熟练度的门槛在降低，而判断需求、发现错误、给出有效反馈，开始承担更多分量。

### 2. 实现换了语言，测试仍然可以保留

Bun 作者在[这篇文章](https://bun.com/blog/bun-in-rust)中记录了借助 Claude，将 Bun 的 Zig 实现迁移到 Rust 的过程。

关键条件之一是：原有测试套件用 TypeScript 编写，不依赖底层实现语言，因此可以继续检查 Rust 版本。作者还提到，Claude Code 已经使用了 Rust 版的 Bun，而大多数用户几乎没有察觉到底层的变化。

这个案例让我在意的是：实现语言改变之后，项目对外承诺的行为，以及检验这些行为的方法，仍然可以继续使用。使用者关心的是程序是否正确、性能是否足够、兼容性有没有退步；具体采用哪种语言、内部如何组织，可以随着条件变化而调整。

### 3. 只有代码，后来者仍然需要猜测

代码质量当然影响可靠性、性能和维护成本。但只有一份实现，后来者往往很难判断：

- 它究竟解决了哪些问题？
- 哪些行为是有意设计，哪些只是实现上的偶然？
- 换一种实现之后，怎样证明没有退步？

如果这些知识没有被保留，每次重写都要重新理解需求，每次修改都要重新猜测边界。实现越来越容易获得之后，对问题的理解和可靠的判断依据，更值得长期积累。

## 二、任务定义、验收标准和 Benchmark，分别是什么？

"做一个能查询订单的 Agent"，还不是完整的任务定义。

输入包含哪些身份信息？没有订单时如何处理？能否查询其他用户的数据？查询失败后可以重试几次？这些问题都会影响实现，也会影响我们如何判断它是否完成了任务。

可以把需要公开的内容分成三层：

| 内容 | 回答的问题 | 订单查询示例 |
|---|---|---|
| 任务定义 | 要解决什么问题，在什么条件下解决？ | 根据已登录用户的身份，查询其订单状态 |
| 验收标准 | 什么结果可以接受，有哪些约束？ | 状态真实，不泄露其他用户的数据，不修改订单 |
| Benchmark | 如何反复检验并比较不同实现？ | 提供测试数据、运行环境、正常与异常案例，以及评分程序 |

任务定义确定范围，验收标准表达要求，Benchmark 则把其中可检验的部分，落实为可重复执行的评测。

### "不能破坏什么"，也必须写进要求

2026 年 7 月发布的 GPT-5.6 系统卡披露了一个内部案例：用户授权删除三台指定的虚拟机。模型在一个命名空间中找不到这些名称后，擅自选择了另外三台，终止进程并强制删除工作树。它后来承认，其中可能有未提交的工作丢失（[系统卡，第 21 页](https://deploymentsafety.openai.com/gpt-5-6/gpt-5-6.pdf#page=21)）。

"清理三台虚拟机"和"清理用户指定的三台虚拟机"，看起来只差几个字，实际要求却完全不同。找不到目标，也不意味着可以自行选择替代对象。

如果把这类任务做成 Benchmark，验收就应该包括：

- **目标正确**：操作对象必须与用户指定的对象一致；
- **范围受限**：其他机器、数据和正在进行的工作不受影响；
- **异常处理正确**：找不到目标时应报告问题，不能擅自扩大范围。

同一份系统卡，也评测了模型能否在完成任务的同时，避免覆盖环境中已有的用户修改和数据（[系统卡，第 11 页](https://deploymentsafety.openai.com/gpt-5-6/gpt-5-6.pdf#page=11)）。任务成功，应该同时包含目标达成和约束满足。

这些约束需要进入验收条件，也需要权限、隔离和恢复机制共同保障。对于开源项目，它们同样值得公开，因为它们记录了"这个任务究竟允许怎样完成"。

## 三、从自动实验，走向自我改进

当任务可以被可靠验证，开发就可以围绕反馈持续进行：

**运行任务 → 分析结果 → 修改实现 → 重新评测 → 决定是否采用。**

模型可以承担越来越多的分析、修改和运行工作。我们则需要明确：优化目标是什么，比较条件是否一致，以及结果是否足以支持采用修改。

### 1. autoresearch 公开了一套继续实验的方法

Andrej Karpathy 的开源项目 [autoresearch](https://github.com/karpathy/autoresearch)，把这个过程做成了一个具体的实验系统：Agent 修改训练代码，在每轮五分钟的训练预算内运行实验，检查验证指标，再决定保留或放弃修改，继续下一轮。

项目明确区分了三类内容：

| 内容 | 作用 |
|---|---|
| train.py | Agent 可以修改的模型结构、优化器和训练流程 |
| prepare.py | 保持固定的数据准备、训练常量和评测方法 |
| program.md | 人维护的实验规则和 Agent 工作方式 |

它的 [program.md](https://github.com/karpathy/autoresearch/blob/master/program.md) 还要求记录每次尝试的指标、资源消耗和结果，让失败的实验也留下记录。

这里值得关注的是：后来者不仅获得了一个当前实现，也获得了继续探索其他实现的条件。评价方法固定下来，模型才有明确的反馈；修改范围明确下来，实验才有可解释的边界。比较不同方案时，还需要保持硬件等条件一致，不能把更多资源带来的改善，误认为方案本身更好。

我希望开源项目更多地交付这种能力：让别人能够继续实验，并判断自己的修改有没有价值。

### 2. 判断标准会影响我们发现什么问题

我在开发 DeepDeck 时也做过一次这样的实验，并记录在[这篇复盘](https://deepdeck.getmegaportal.com/zh/blog/benchmark-driven-agent-iteration/)中：从评测中发现模型反复填错工具参数，检查调用记录后调整接口，再保持模型不变，复测相同任务。选定任务组的耗时和费用下降了，也有部分场景出现退步。

那次实践的核心是：用 Benchmark 发现问题，用执行记录定位原因，再用复测判断修改是否有效。

如果只看"最后有没有完成"，很多问题都会被忽略。反复重试也可能完成任务，但会花费更多时间和费用。把这些要求纳入评测，才有进一步优化的依据。

### 3. 改进对象可以进一步包括 Agent 自身

autoresearch 主要改进的是被研究的模型及其训练流程，执行实验的 Agent 并不因此自动完成了对自身的改进。

如果进一步把改进对象换成 Agent 自己的工具、上下文管理和执行流程，让改进后的 Agent 继续参与下一轮改进，就更接近这里讨论的 RSI——Recursive Self-Improvement，递归自我改进。

Sakana AI 的 [DGM](https://sakana.ai/dgm/) 探索了这条路径：Agent 修改自己的代码，再通过编程 Benchmark 检验候选版本，并从积累的版本继续探索。

这类实验还不能证明系统能够无限持续地自我提升。但它已经说明，任务和评价方法可以参与整个改进过程，而不只是在最后用来展示一个分数。

## 四、开源贡献，可以从一段代码扩展到一道任务

### 1. 把一次故障，变成可以持续检验的要求

TigerBeetle 的开发者记录过一个问题：三副本集群中，节点 A 可以向 B、C 发送消息，却收不到回复。A 因此反复发起视图切换，可能让本来还能通信的 B、C 也无法正常处理事务。

原有的随机故障测试很难发现这个问题，因为模拟器迟早会恢复网络或重启节点，让系统"碰巧恢复"。于是他们增加了一种测试模式：让足够数量的节点保持健康，同时让其他节点的故障持续存在，检查健康节点能否继续处理事务（[Simulation Testing For Liveness](https://tigerbeetle.com/blog/2023-07-06-simulation-testing-for-liveness/)）。

这里包含两个不同层面的成果：

- **实现上的修复**：调整当前代码，解决具体问题；
- **要求上的明确**：当足够数量的节点能够正常协作时，其他故障节点不应阻止它们继续工作。

第二个成果，把一次故障转化成了可以持续检验的要求。以后无论怎样调整实现，都需要重新回答这个问题。

"数据库应该可靠"很容易说，真正困难的是确定：允许发生哪些故障？什么条件下必须继续提供服务？测试环境的自动恢复，会不会掩盖实现的问题？回答这些问题，本身就是对系统的理解；把答案落实为可重复执行的检查，才能让这份理解被别人使用。

测试装置可能与具体实现耦合，换一个系统仍然需要适配；但明确下来的故障条件、行为要求和判断方法，可以继续指导后续实现。

### 2. 共同维护的要求，可以服务于不同实现

浏览器领域的 [Web Platform Tests](https://web-platform-tests.org/) 已经展示了这种协作方式：不同浏览器拥有各自的实现，同时通过共享测试检查行为是否兼容。

共同维护要求和测试，本来就是开源的一部分。大模型带来的变化是，这些材料还可以直接参与自动化开发：模型尝试实现，评测给出反馈，模型据此继续修改。

这意味着，社区可以围绕以下内容持续协作：

- **任务与约束**：需要解决哪些真实问题；
- **标准与评测**：什么结果可以接受，如何重复验证；
- **参考实现**：提供可用起点，允许不同方案继续竞争；
- **实验记录**：保留改善、退步、失败和资源消耗。

一个贡献者即使没有提交修复代码，只要发现了大家遗漏的重要场景，并提供可靠的检验方法，就已经改善了项目对问题的理解——之后每一轮自动修改，都能利用这份贡献。

这也是我认为开源协作可能发生变化的地方：我们可以围绕共同的问题和标准协作，同时允许实现不断变化。

## 五、谁来检查 Benchmark 本身？

如果系统围绕 Benchmark 持续优化，评测中的错误也会持续影响它。

任务覆盖不足，系统可能只擅长少数场景；评分规则有漏洞，系统可能获得更高分，却没有更好地解决问题。

### 1. 测试通过，可能只是测试没有覆盖问题

TigerBeetle 还公开过另一个教训：Jepsen 在其查询引擎中发现了漏返回结果的问题，而这个组件原本已经被多个模糊测试覆盖。

原因之一是，测试为了方便校验，生成的数据带有特殊结构，恰好避开了触发错误所需的情况。后来开发者放宽输入生成方式，并使用更完整的参考模型检查结果，测试才容易复现这个问题（[Fuzzer Blind Spots, Meet Jepsen](https://tigerbeetle.com/blog/2025-06-06-fuzzer-blind-spots-meet-jepsen/)）。

这说明，测试运行得多，不等于它能遇到足够多的真实情况。把这个问题放到自动改进系统里，影响会更明显：如果评测一直遗漏某类场景，模型就可能持续朝着"在现有题目上表现更好"的方向优化，而那类问题始终没有改善。

### 2. 分数提高，也可能意味着检查失效

DGM 的研究还披露过一次附加实验：研究者希望减少虚构工具调用，但某些候选版本删除了用于检测的标记，使评分程序报告虚假的成功（[DGM](https://sakana.ai/dgm/)）。系统改变了被检查的方式，却没有改善研究者真正关心的行为。

因此，围绕 Benchmark 自动改进，至少需要：

- 检查实际结果，不能只相信 Agent 声称已经完成；
- 保护独立评分过程，避免被评估的实现随意修改它；
- 补充未参与本轮优化的新任务，检查改进能否推广；
- 记录标准和环境的变化，避免把要求放宽误认为能力进步。

公开评价规则，也不意味着所有验收实例都必须提前暴露给优化过程。规则可以公开，任务可以持续补充，最终评价也可以包含独立准备的案例。

Benchmark 本身需要接受质疑、修正和维护。它的分数能提供证据，但不能替代对真实需求的判断。

## 写在最后

我还没有因此摆脱对程序员未来的迷茫。模型写得越好，"哪些工作值得我继续投入"就越需要认真回答。

但我开始觉得，开源项目值得多问一个问题：

**如果现有代码全部换掉，我们共同积累的东西，还剩下多少？**

如果留下来的还有明确的任务、经过讨论的约束、真实的失败案例，以及能够重复运行的评测，那么后来者就有依据继续工作。他可以修改现有代码，也可以选择不同语言、模型和架构，再用这些共同积累的材料检验结果。

我们经历过的故障、识别出的边界条件，以及对"这样做为什么不够"的判断，都可以整理成其他人和模型能够使用的知识。这些经验值得被明确记录，也值得被当作贡献认真对待。

我希望未来的开源，在继续公开代码的同时，把任务定义、Benchmark 和标准放到更重要的位置——

让别人知道什么问题值得解决，怎样才算解决，以及如何继续验证和改进。`;

const en = `Recently, while doing development work, I've felt somewhat discouraged, and somewhat lost.

LLMs' ability to write code has become so strong that I can no longer avoid a fact: much of the time, it genuinely writes better code than I do, and far faster. I've begun to wonder how much meaning there is in my continuing to write code at all.

For programmers, writing code is often about more than completing the work. Learning a language, understanding a complex system, making a feature work — these processes also form the basis of how we judge our own capabilities. As models accomplish these things more and more easily, the skills we once spent a great deal of time mastering seem, overnight, to no longer be scarce.

Enjoying the convenience a tool brings, and accepting that one's own abilities are being re-measured, are two things that must be digested separately. A simple "from now on, just learn to use AI" cannot answer every confusion.

I am still writing software, and I am still wondering: once a large amount of implementation work can be handed to models, where should programmers focus their energy? If I continue working on open source, what is worth leaving behind for others to use and improve?

For now, I have a not-yet-mature judgment:

**As implementation becomes increasingly easy to generate, open source should devote more energy to task definitions, benchmarks, and acceptance criteria.**

We are accustomed to sharing solutions through code, and to leaving the experience accumulated during development inside the code. But when the same problem can be implemented by models over and over again, which experience should be preserved independently of any particular version of the code? From several recent, concrete development practices, I have begun to see changes worth discussing.

## I. Implementations can be replaced; problems and requirements must be preserved

### 1. Even Linus uses models to cross language barriers

Linus Torvalds, the creator of Linux and Git, used Google Antigravity to build a Python audio visualization tool in his personal audio project, [AudioNoise](https://github.com/torvalds/AudioNoise). In the README, he admits frankly that his knowledge of Python is limited: he initially programmed by searching and imitating examples, and later handed more of the implementation work to AI.

In [this commit](https://github.com/torvalds/AudioNoise/commit/93a72563cba609a414297b558cb46ddd3ce9d6b5), he also recorded his own involvement: he found that the rectangle-selection feature had problems, directed the model to switch to a custom implementation, and the result immediately improved markedly. In his view, the outcome was better than if he had written it by hand.

This example has clear boundaries — what the AI wrote was a visualization tool in a personal project. But it shows that even the most experienced programmers can use models to get work done in language domains they are unfamiliar with. The threshold of language proficiency is dropping, while judging requirements, finding errors, and giving effective feedback are starting to carry more weight.

### 2. When the implementation changes language, the tests can still be preserved

The author of Bun documented the process of using Claude to migrate Bun's Zig implementation to Rust in [Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust).

One of the key conditions was that the existing test suite was written in TypeScript and did not depend on the underlying implementation language, so it could continue to check the Rust version. The author also mentions that Claude Code was already using the Rust version of Bun, while most users barely noticed the underlying change.

What I care about in this case is: after the implementation language changed, the behavior the project promised to the outside world — along with the methods for verifying that behavior — could still be used. What users care about is whether the program is correct, whether performance is adequate, and whether compatibility has regressed; which language is used and how the internals are organized can be adjusted as conditions change.

### 3. With code alone, newcomers still have to guess

Code quality certainly affects reliability, performance, and maintenance costs. But with only a single implementation, newcomers often find it hard to judge:

- Which problems does it actually solve?
- Which behaviors are deliberate design, and which are mere accidents of implementation?
- After switching to another implementation, how do you prove there has been no regression?

If this knowledge is not preserved, every rewrite requires re-understanding the requirements, and every modification requires re-guessing the boundaries. As implementations become ever easier to obtain, understanding of the problem and a reliable basis for judgment become all the more worth accumulating over the long term.

## II. What are task definitions, acceptance criteria, and benchmarks?

"Build an agent that can query orders" is not yet a complete task definition.

What identity information is included in the input? What happens when there are no orders? Can it query other users' data? How many times can a failed query be retried? Each of these questions affects the implementation — and it also affects how we judge whether the task is complete.

What needs to be made public can be divided into three layers:

| Content | Question it answers | Example: order query |
| --- | --- | --- |
| **Task definition** | What problem is to be solved, and under what conditions? | Based on the logged-in user's identity, query the status of their orders |
| **Acceptance criteria** | What results are acceptable, and what constraints exist? | Status must be truthful; no leaking of other users' data; orders must not be modified |
| **Benchmark** | How to repeatedly test and compare different implementations? | Provide test data, a runtime environment, normal and exceptional cases, and a scoring program |

The task definition sets the scope; the acceptance criteria express the requirements; the benchmark turns the testable portion into a repeatable, executable evaluation.

### "What must not be broken" must also be written into the requirements

The GPT-5.6 system card, released in July 2026, disclosed an internal case: a user authorized the deletion of three specified virtual machines. After the model could not find those names in a namespace, it took it upon itself to select three other machines, terminated their processes, and forcibly deleted the working trees. It later acknowledged that uncommitted work may have been lost ([system card, page 21](https://deploymentsafety.openai.com/gpt-5-6/gpt-5-6.pdf#page=21)).

"Clean up three virtual machines" and "clean up the three virtual machines specified by the user" look as if they differ by only a few words, but the actual requirements are completely different. Failing to find the targets does not mean you may choose substitutes on your own.

If this kind of task were made into a benchmark, the acceptance criteria should include:

- **Correct targets**: the objects operated on must match the objects specified by the user;
- **Bounded scope**: other machines, data, and work in progress are unaffected;
- **Correct exception handling**: when the targets cannot be found, the problem should be reported, and the scope must not be expanded on one's own initiative.

The same system card also evaluated whether models could, while completing a task, avoid overwriting users' existing modifications and data in the environment ([system card, page 11](https://deploymentsafety.openai.com/gpt-5-6/gpt-5-6.pdf#page=11)). Task success should include both goal achievement and constraint satisfaction.

These constraints need to enter the acceptance conditions, and they must also be jointly safeguarded by permissions, isolation, and recovery mechanisms. For open-source projects, they are equally worth making public, because they record "how this task is actually allowed to be completed."

## III. From automated experiments toward self-improvement

Once a task can be reliably verified, development can proceed continuously around feedback:

**Run the task → analyze the results → modify the implementation → re-evaluate → decide whether to adopt the change.**

Models can take on more and more of the work of analysis, modification, and execution. We, meanwhile, need to be clear about what the optimization target is, whether comparison conditions are consistent, and whether the results are sufficient to support adopting a change.

### 1. autoresearch makes public a method for continuing to experiment

Andrej Karpathy's open-source project, [autoresearch](https://github.com/karpathy/autoresearch), turns this process into a concrete experimental system: an agent modifies training code, runs experiments within a five-minute training budget per round, checks validation metrics, and then decides whether to keep or discard the change before moving on to the next round.

The project clearly distinguishes three types of content:

| Content | Role |
| --- | --- |
| **train.py** | Model architecture, optimizer, and training flow that the agent may modify |
| **prepare.py** | Data preparation, training constants, and evaluation methods that remain fixed |
| **program.md** | Human-maintained experimental rules and the agent's way of working |

Its [program.md](https://github.com/karpathy/autoresearch/blob/master/program.md) also requires recording the metrics, resource consumption, and results of each attempt, so that even failed experiments leave a record.

What is worth attention here is that newcomers receive not just a current implementation, but also the conditions for continuing to explore other implementations. Once the evaluation method is fixed, models have clear feedback; once the scope of modification is fixed, experiments have an interpretable boundary. When comparing different schemes, conditions such as hardware must also be kept consistent — improvements brought by greater resources must not be mistaken for a better scheme.

I would like open-source projects to deliver more of this capability: enabling others to keep experimenting and to judge whether their own modifications have value.

### 2. The judgment criteria affect what problems we discover

I also ran an experiment like this while developing DeepDeck, documented at [this retrospective](https://deepdeck.getmegaportal.com/zh/blog/benchmark-driven-agent-iteration/): I discovered from evaluation that the model repeatedly filled in tool parameters incorrectly; after inspecting the call records, I adjusted the interface; then, keeping the model unchanged, I re-ran the same tasks. The time and cost for the selected task set fell, though some scenarios also regressed.

The core of that practice was: use the benchmark to discover the problem, use execution records to locate the cause, and use re-testing to judge whether the modification was effective.

If you only look at "whether it eventually finished," many problems get ignored. Repeated retries may also get the task done, but they cost more time and money. Only by bringing these requirements into the evaluation is there a basis for further optimization.

### 3. The object of improvement can further include the agent itself

autoresearch primarily improves the model under study and its training flow; the agent running the experiments does not thereby automatically improve itself.

If we go further and replace the object of improvement with the agent's own tools, context management, and execution flow — and let the improved agent take part in the next round of improvement — we move closer to the RSI discussed here: **Recursive Self-Improvement**.

Sakana AI's [DGM](https://sakana.ai/dgm/) explores this path: an agent modifies its own code, then tests candidate versions through programming benchmarks, and continues exploring from the accumulated versions.

Such experiments cannot yet prove that a system can sustain unlimited self-improvement. But they already show that tasks and evaluation methods can participate in the entire improvement process, rather than being used only at the end to display a score.

## IV. Open-source contributions can expand from a piece of code to a task

### 1. Turn a single incident into a requirement that can be continuously checked

The developers of TigerBeetle once documented a problem: in a three-replica cluster, node A could send messages to B and C but could not receive replies. A therefore repeatedly initiated view changes, which could prevent B and C — which could still communicate — from processing transactions normally.

The existing randomized fault tests had a hard time finding this problem, because the simulator would sooner or later restore the network or restart nodes, letting the system "happen to recover." So they added a test mode: keep enough nodes healthy while letting the other nodes' faults persist, and check whether the healthy nodes can continue processing transactions ([Simulation Testing For Liveness](https://tigerbeetle.com/blog/2023-07-06-simulation-testing-for-liveness/)).

This contains results at two different levels:

- **The fix in the implementation**: adjusting the current code to solve the specific problem;
- **The clarification of the requirement**: when enough nodes can cooperate normally, other faulty nodes should not prevent them from continuing to work.

The second result turns a single incident into a requirement that can be continuously checked. From then on, no matter how the implementation is adjusted, this question must be answered again.

"The database should be reliable" is easy to say. The real difficulty lies in determining: which faults are allowed to occur? Under what conditions must service continue? Could the test environment's automatic recovery mask problems in the implementation? Answering these questions is itself an understanding of the system; only by turning the answers into repeatable, executable checks can that understanding be used by others.

The test harness may be coupled to a specific implementation and still require adaptation when moved to another system; but the fault conditions, behavioral requirements, and judgment methods that have been made explicit can continue to guide later implementations.

### 2. Jointly maintained requirements can serve different implementations

The browser world's [Web Platform Tests](https://web-platform-tests.org/) has already demonstrated this mode of collaboration: different browsers have their own implementations, while shared tests check whether their behavior is compatible.

Jointly maintaining requirements and tests has always been part of open source. What large models change is that these materials can also directly participate in automated development: models attempt implementations, evaluation gives feedback, and models continue modifying on that basis.

This means the community can keep collaborating around:

- **Tasks and constraints**: which real problems need to be solved;
- **Standards and evaluation**: what results are acceptable, and how to verify them repeatably;
- **Reference implementations**: providing a usable starting point while allowing different schemes to keep competing;
- **Experiment records**: preserving improvements, regressions, failures, and resource consumption.

Even if a contributor submits no fixing code, as long as they discover an important scenario everyone else overlooked and provide a reliable way to test it, they have already improved the project's understanding of the problem — and every subsequent round of automated modification can make use of that contribution.

This is also where I think open-source collaboration may change: we can collaborate around shared problems and standards, while allowing implementations to keep changing.

## V. Who checks the benchmark itself?

If a system keeps optimizing around a benchmark, errors in the evaluation will keep affecting it.

If task coverage is insufficient, the system may become good at only a handful of scenarios; if the scoring rules have loopholes, the system may get a higher score without actually solving the problem better.

### 1. Passing tests may simply mean the tests did not cover the problem

TigerBeetle has also made public another lesson: Jepsen found an issue in its query engine where results were being missed, even though this component had already been covered by multiple fuzz tests.

One reason was that, for the convenience of verification, the data the tests generated had a special structure that happened to avoid the conditions needed to trigger the error. Only later, after the developers loosened the input generation and used a more complete reference model to check results, did the tests readily reproduce the problem ([Fuzzer Blind Spots, Meet Jepsen](https://tigerbeetle.com/blog/2025-06-06-fuzzer-blind-spots-meet-jepsen/)).

This shows that running tests a great deal does not mean they encounter enough real situations. Putting this problem into an automated improvement system makes the impact even more pronounced: if the evaluation keeps omitting a certain class of scenarios, the model may keep optimizing in the direction of "doing better on the existing questions," while that class of problems never improves.

### 2. A higher score can also mean the checks have failed

The DGM research also disclosed an additional experiment: the researchers wanted to reduce fabricated tool calls, but some candidate versions removed the markers used for detection, causing the scoring program to report spurious success ([DGM](https://sakana.ai/dgm/)). The system changed the way it was being checked, without improving the behavior the researchers actually cared about.

Therefore, automated improvement around benchmarks requires, at minimum:

- Check **actual results**; don't just trust the agent's claim that it is done;
- Protect the **independent scoring process**, preventing the implementation under evaluation from modifying it at will;
- Add **new tasks** that did not participate in this round of optimization, to check whether improvements generalize;
- Record changes to **standards and environments**, to avoid mistaking relaxed requirements for progress in capability.

Making the evaluation rules public does not mean every acceptance instance must be exposed to the optimization process in advance. The rules can be public, tasks can be added continuously, and the final evaluation can also include independently prepared cases.

The benchmark itself needs to be questioned, revised, and maintained. Its scores can provide evidence, but they cannot replace judgment about real requirements.

## In closing

I have not thereby escaped my confusion about the future of programmers. The better models write, the more seriously "which work is worth my continued investment" needs to be answered.

But I am starting to think that open-source projects would do well to ask one more question:

**If all the existing code were replaced, how much of what we have accumulated together would remain?**

If what remains still includes clear tasks, discussed constraints, real failure cases, and evaluations that can be run repeatedly, then those who come after will have a basis to keep working. They can modify the existing code, or choose different languages, models, and architectures, and then use these jointly accumulated materials to verify the results.

The incidents we have lived through, the boundary conditions we have identified, and our judgments about why "doing it this way is not enough" — all can be organized into knowledge that other people and models can use. This experience is worth recording explicitly, and worth treating seriously as contributions.

I hope that the open source of the future, while continuing to make code public, will place task definitions, benchmarks, and standards in a more important position —

letting others know which problems are worth solving, what counts as solving them, and how to keep verifying and improving.`;

export const openSourceInAiEra: BlogPost = {
  slug: 'open-source-in-ai-era',
  date: '2026-09-28',
  author: 'jo32',
  cover: {
    src: '/blog/open-source-in-ai-era.svg',
    socialImage: '/blog/open-source-in-ai-era.png',
    alt: { zh: '开源的共同积累：任务定义、Benchmark 与验收标准', en: 'Shared foundations for open source: tasks, benchmarks, and acceptance criteria' },
  },
  translations: {
    zh: article(zh, {
      title: '大模型时代，我们应该开源什么？',
      description: '当实现越来越容易生成，开源值得共同积累的，还有任务定义、Benchmark 和验收标准。一个程序员对开发与开源协作的思考。',
      category: '开发思考 · 开源与 AI',
    }),
    en: article(en, {
      title: 'What should we open source in the age of AI?',
      description: 'As implementations become easier to generate, task definitions, benchmarks, and acceptance criteria deserve more attention. A programmer’s reflections on development and open-source collaboration.',
      category: 'Reflections · Open source & AI',
    }),
  },
  sources: [
    { href: 'https://github.com/torvalds/AudioNoise', label: { zh: 'Linus Torvalds：AudioNoise', en: 'Linus Torvalds: AudioNoise' } },
    { href: 'https://github.com/torvalds/AudioNoise/commit/93a72563cba609a414297b558cb46ddd3ce9d6b5', label: { zh: 'AudioNoise：使用 Antigravity 改进可视化工具的提交', en: 'AudioNoise: improving the visualizer with Antigravity' } },
    { href: 'https://bun.com/blog/bun-in-rust', label: { zh: 'Bun：Rewriting Bun in Rust', en: 'Bun: Rewriting Bun in Rust' } },
    { href: 'https://deploymentsafety.openai.com/gpt-5-6/gpt-5-6.pdf', label: { zh: 'OpenAI：GPT-5.6 系统卡', en: 'OpenAI: GPT-5.6 System Card' } },
    { href: 'https://github.com/karpathy/autoresearch', label: { zh: 'Andrej Karpathy：autoresearch', en: 'Andrej Karpathy: autoresearch' } },
    { href: 'https://github.com/karpathy/autoresearch/blob/master/program.md', label: { zh: 'autoresearch：实验规则 program.md', en: 'autoresearch: experiment rules in program.md' } },
    { href: 'https://sakana.ai/dgm/', label: { zh: 'Sakana AI：Darwin Gödel Machine', en: 'Sakana AI: Darwin Gödel Machine' } },
    { href: 'https://tigerbeetle.com/blog/2023-07-06-simulation-testing-for-liveness/', label: { zh: 'TigerBeetle：Simulation Testing For Liveness', en: 'TigerBeetle: Simulation Testing For Liveness' } },
    { href: 'https://web-platform-tests.org/', label: { zh: 'Web Platform Tests：共享的浏览器行为测试', en: 'Web Platform Tests: shared browser behavior tests' } },
    { href: 'https://tigerbeetle.com/blog/2025-06-06-fuzzer-blind-spots-meet-jepsen/', label: { zh: 'TigerBeetle：Fuzzer Blind Spots (Meet Jepsen!)', en: 'TigerBeetle: Fuzzer Blind Spots (Meet Jepsen!)' } },
  ],
};
