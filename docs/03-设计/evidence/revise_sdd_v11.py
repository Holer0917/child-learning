# -*- coding: utf-8 -*-
"""按第二轮评分反馈修订 05-软件设计说明书（V1.0 → V1.1）。"""
from pathlib import Path

root = Path(__file__).resolve().parents[3]  # docs/03-设计/evidence -> 儿童学习
p = root / 'docs' / '03-设计' / '05-软件设计说明书.md'
s = p.read_text(encoding='utf-8')

# ---------- 1. 头部版本 ----------
s = s.replace(
    '| **文档编号** | SDD-V1.0 |',
    '| **文档编号** | SDD-V1.1（依评分反馈修订） |')

# ---------- 2. §0.3 外部引用的自包含声明 ----------
s = s.replace(
'''### 0.3 与实验 1 的可追溯文件

| 本设计章节 | 对应实验 1 文件/章节 |
|---|---|
| §0、§12 | `02-需求分析/03-需求规格说明书.md` §6、§8、§9.5、§9.6 |
| §6.4 统计口径 | SRS §5.4 |
| §9 故障处理 | SRS §5.2 FM-01~12 |
| §11 验证 | `02-需求分析/08-需求验收用例清单.md` |
''',
'''### 0.3 与实验 1 的可追溯文件

| 本设计章节 | 对应实验 1 文件/章节 |
|---|---|
| §0、§12 | `02-需求分析/03-需求规格说明书.md` §6、§8、§9.5、§9.6 |
| §6.4 统计口径 | SRS §5.4 |
| §9 故障处理 | SRS §5.2 FM-01~12 |
| §11 验证 | `02-需求分析/08-需求验收用例清单.md` |

### 0.4 自包含性声明（便于独立评审）

实验 2 只提交本文档，而本文引用了实验 1 的条款。为保证**不打开其它文件也能核对**，凡本文依赖的基线内容，均在本文内**原文或等价形式**给出：

| 基线内容 | 实验 1 出处 | 本文内的自包含位置 |
|---|---|---|
| 28 条功能需求（编号、名称、优先级） | SRS §6、§9.3 | 表 0-1 |
| 10 条非功能需求（编号、指标） | SRS §7 | 表 0-2 |
| 10 条时间需求 TR-01~10 | SRS §5.1 | 表 0-3 |
| 12 条故障模式 FM-01~12 | SRS §5.2 | §9（含检测点与处理） |
| 验收标准编号 AC-xx.y / TC-AC-xx.y | SRS §3、08 清单 | §12 追溯矩阵 T 列；AC-KB 出处见表 0-4 |
| 统计口径（正确率、掌握度、去重键） | SRS §5.4 | §6.4.3、§6.4.5 |

**表 0-1 功能需求基线（共 28 条；Must 16 / Should 10 / Could 2）**

| 编号 | 名称 | 优先级 | 编号 | 名称 | 优先级 |
|---|---|---|---|---|---|
| FR-01 | 创建孩子档案 | Must | FR-15 | 答题激励反馈 | Could |
| FR-02 | 切换与编辑档案 | Must | FR-16 | 自动批改与成绩结算 | Must |
| FR-03 | 删除档案 | Should | FR-17 | 练习历史记录 | Must |
| FR-04 | 知识点大纲浏览 | Must | FR-18 | 错题自动归档 | Must |
| FR-05 | 知识点筛选与检索 | Should | FR-19 | 错题重练 | Must |
| FR-06 | 教材对标校验 | Must | FR-20 | 举一反三 | Must |
| FR-07 | 智能组卷 | Must | FR-21 | 错题本导出 | Should |
| FR-08 | 题量设置 | Must | FR-22 | 正确率趋势统计 | Should |
| FR-09 | 难度分级 | Should | FR-23 | 知识点掌握度统计 | Should |
| FR-10 | 题型选择 | Should | FR-24 | 练习量与打卡统计 | Could |
| FR-11 | 组卷结果预览与调整 | Should | FR-25 | A4 练习卷打印 | Must |
| FR-12 | 答题界面 | Must | FR-26 | 答案页打印 | Must |
| FR-13 | 即时判分 | Must | FR-27 | 数据本地持久化 | Must |
| FR-14 | 倒计时与计时 | Should | FR-28 | 数据导出与导入 | Should |

**表 0-2 非功能需求基线**

| 编号 | 指标（摘要） |
|---|---|
| NFR-01 | 性能：首屏本地 <1s / Slow 3G <3s；30 题生成 <50ms；单题判分 <100ms；图表 <200ms；静态资源 <300KB |
| NFR-02 | 易用：5 位陌生家长 ≥4 人 60 秒内出卷；出卷→打印 ≤3 次点击；触控 ≥44px；题目字号 ≥32px；主要操作 100ms 内反馈 |
| NFR-03 | 可靠：答案 100% 正确；损坏降级不白屏；提示可理解；刷新不丢已保存数据 |
| NFR-04 | 兼容：Chrome/Edge/Safari/Firefox 近两年版本；360~1920px；横竖屏；iOS 可添加到主屏 |
| NFR-05 | 安全：不采集、不上传；无第三方统计；仅存业务数据；导入做格式与范围校验 |
| NFR-06 | 可访问：正文对比度 ≥4.5:1；图形 ≥3:1；色盲可辨；不依赖颜色；键盘可完成核心操作；深色模式；打印浅色 |
| NFR-07 | 可维护：四层单向依赖；新增知识点只改大纲配置；注释密度 ≥15%；统一命名 |
| NFR-08 | 可移植：免构建；任意静态托管；PWA 可安装 |
| NFR-09 | 容量：≤3 档案；每档案 500 条完整 + 2000 条摘要；≤500 道错题；接近上限提示导出 |
| NFR-10 | 打印：A4 无截断；黑白可辨；省墨；跨浏览器行高列宽一致 |

**表 0-3 时间相关需求基线**

| 编号 | 摘要 |
|---|---|
| TR-01 | 计时基于时间戳差值；后台 30 秒返回偏差 ≤1 秒 |
| TR-02 | 单题耗时 = 渲染完成到提交；跳过记 0 |
| TR-03 | 倒计时到期立即结算，未答计跳过 |
| TR-04 | 跨零点以**结束时刻**归属日期 |
| TR-05 | 打卡按本地自然日；断档则连续天数归零 |
| TR-06 | 统计范围按**记录条数**截取（7/30/全部） |
| TR-07 | 500 条完整 + 2000 条摘要；超 2500 删除最早摘要 |
| TR-08 | 备份文件名含导出日期 |
| TR-09 | 知识点若已下线，统计时跳过而非报错 |
| TR-10 | 深色模式未显式选择时跟随系统并实时切换 |

**表 0-4 AC-KB 编号出处**

| 编号 | 出处 | 本文章节 |
|---|---|---|
| AC-KB.1~5 | 实验 1 SRS V1.3 **§5.5**（由 NFR-06.4 拆分而来） | §8 NFR-06 行、§11.2 界面层测试 |
''')

# ---------- 3. §4.3 F3 补充异常分支 ----------
s = s.replace(
'''               结算后：答对 → mastered=true；答错 → wrongCount++（AC-19.3/19.4）
               掌握度计入重练与变式（SRS §5.4.3）
```
''',
'''               结算后：答对 → mastered=true；答错 → wrongCount++（AC-19.3/19.4）
               掌握度计入重练与变式（SRS §5.4.3）
```

**F3-异常分支：变式题凑不满 5 道**

```
variants.generate(mistake, n=5)
  │
  ├─ 阶段 A：同知识点 + 同题型 + 同星级 + 未出现在原卷 + 未出现在已生成列表
  │    来源：knowledgePoint.spec 经 adjustSpec(spec, starOf(mistake)) 收窄
  │    条件：guard < 400 次尝试且已生成 < 5
  │    ▼ 不足
  ├─ 阶段 B：允许星级 ±1（与原题相差 ≤1 星），逐题标注「难度略高 / 略低」（AC-20.4）
  │    条件：guard 再增 400 次；排除同上
  │    ▼ 仍不足
  └─ 阶段 C：按实际可生成数返回（0 < k < 5）
       变式页提示：「该知识点同类题只有 k 道，已全部给出」
       不在未选知识点中取题（AC-09.x 不引入未选知识点）
       ▼ k = 0（知识点题量本就极少）
       提示：「这个知识点可生成的同类题不足，建议直接重练原题」
       提供「重练原题」按钮（回退到 F3 左侧分支）
```

**为什么允许降级而不是无限等待**：知识点规格空间有限（如"100 以内整十数加减"可能的组合数远大于 5，但"同题型的竖式 + 同星级"可能只剩 2~3 道可用），若不降级会陷入 200 次重试后返回 `null`（FM-05）的体验；按实际数量返回并说明原因，比报错更能服务家长。
''')

# ---------- 4. §4 新增 F6 恢复进行中的练习 ----------
s = s.replace(
'''### 4.5 流程 F5：打印练习卷 + 答案页''',
'''### 4.5 流程 F6：刷新后恢复进行中的练习（对应 §9.1 恢复点）

```mermaid
sequenceDiagram
    participant U as 学生
    participant Z as page:quiz
    participant Q as app:quizSession
    participant S as core:storage
    Note over Z,S: 每次作答 / 跳过 / 计时秒级更新
    Q->>S: write(`quiz:active:<pid>`, {paper, attempts, startAt, limitMs, savedAt})
    U->>Z: 误触刷新 / 浏览器崩溃后重开
    Z->>Q: resume()
    Q->>S: read(`quiz:active:<pid>`)
    alt 无临时会话
        Q-->>Z: null → 正常进入出题台
    else 有临时会话
        Q->>Q: 校验 schema（§6.2.6）；检查 savedAt 距今 ≤ 24 小时
        alt 校验通过且未过期
            Q-->>Z: {paper, attempts, resumedAt}
            Z->>U: 弹层「发现未完成的练习（已答 7/30），继续？」
            alt 用户点「继续」
                Z->>Q: continueResume()  → 计时以 startAt 为基准重算（TR-01）
                Q-->>Z: 回到第 8 题
            else 用户点「放弃」
                Q->>S: remove(`quiz:active:<pid>`)
                Z->>U: 进入出题台
            end
        else 校验失败 / 已过期
            Q->>S: remove(`quiz:active:<pid>`)
            Q-->>Z: null（静默清理，不提示；FM-02 损坏隔离）
        end
    end
```

**关键约束**：
- 临时键与正式记录分开，**结算成功后**才写 `sessions` 并删除临时键；先写正式记录、后删临时键（若中途失败，最多重复恢复一次，不会丢数据）。
- 临时会话只属于当前档案；切换档案时旧档案的临时会话保留，切回时仍可恢复。
- 恢复后答题的首次成绩口径不变：已答题目视为已记录，不重复计分（§6.2.2 `Attempt.first`）。

### 4.6 流程 F5：打印练习卷 + 答案页''')

# ---------- 5. §5 新增页面侧接口 ----------
s = s.replace(
'''### 5.4 外部接口''',
'''### 5.4 应用层与页面侧接口

> 页面（L4）只负责渲染与转发；下列接口把页面行为**收口到可命名的函数**，追溯矩阵的 F/I 列引用它们。

#### 5.4.1 应用层接口（`src/app/`）

| 接口 | 签名 | 调用方 | 输入 | 输出 | 错误约定 |
|---|---|---|---|---|---|
| 创建练习会话 | `createSession(paper, opts)` | 预览页、错题本页 | `{mode:'practice'\\|'retry'\\|'variant', limitMs?}` | `Session` 对象 | 题量为 0 → `{ok:false, code:'EMPTY_PAPER'}` |
| 恢复会话 | `resumeSession(profileId)` | 答题页启动 | `—` | `Session \\| null` | 结构非法/过期 → `null`，并删除临时键 |
| 提交作答 | `recordAttempt(qid, attempt)` | 答题页 | `{userAnswer, correct, skipped, elapsedMs}` | `void` | 会话不存在 → 抛 `Error('NO_SESSION')` |
| 记录纠错重试 | `recordRetry(qid, attempt)` | 答题页 | 同上 | `void` | 不覆盖首次成绩（§6.2.2） |
| 结束会话 | `finishSession()` | 答题页、倒计时到期 | `—` | `SessionResult` | 无作答 → `{ok:false, code:'NO_ANSWER'}`，不写记录 |
| 退出会话 | `abortSession()` | 退出确认框 | `—` | `SessionResult \\| null` | 已答 0 题 → `null` 且不写记录 |
| 重练入口 | `openRetry(mistakeIds, mode)` | 错题本页 | `{mode:'original'\\|'variant'}` | `{paper, session}` | 无可重练错题 → `{ok:false, code:'NO_MISTAKES'}` |
| 打印视图 | `buildPrintView(paper, {answerSheet})` | 预览页、成绩页、错题本页 | `Paper`、`{answerSheet:boolean}` | `{container: HTMLElement, pageCount: number}` | 不影响界面状态；调用方负责 print 后移除容器 |
| 导出触发 | `triggerDownload(filename, text, mime)` | 设置页 | 文本 | `{ok:true}` | 见 §5.5 下载接口 |

#### 5.4.2 页面侧接口（`src/ui/`，对外暴露给路由与组件）

| 接口 | 签名 | 职责 | 依赖的应用/领域接口 | 对应需求 |
|---|---|---|---|---|
| 出题台 | `renderHome(el)` → `{getOptions()}` | 收集并校验组卷参数 | `validatePaperOptions` | FR-07、FR-08 |
| 知识点选择 | `renderSyllabus(el)` → `{getSelection()}` | 筛选、勾选、年级一键选 | `syllabus.filterKnowledgePoints` | FR-04、FR-05 |
| 预览页 | `renderPaper(el, paper)` → `{print(), regenerate(), removeQ(qid)}` | 展示统计、调整、打印 | `buildPrintView` | FR-11、FR-25 |
| **数字键盘输入** | `keypad.mount(el, {onSubmit, onDelete, onClear})` | 触屏键盘，产出字符串 | 回调 `onSubmit(raw)` | **FR-12（AC-12.3）** |
| 物理键盘输入 | `captureKeys(el, {submitKeys, allowed})` | 绑定 `-` `.` `/` 与 Enter | 回调 | FR-12（AC-12.4） |
| 答题页 | `renderQuiz(el, session)` | 渲染当前题、反馈、进度 | `recordAttempt`、`recordRetry` | FR-12~FR-15 |
| 成绩页 | `renderResult(el, result)` | 展示成绩与错题清单 | `buildPrintView` | FR-16 |
| **错题本页** | `renderMistakes(el)` → `{retrySelected(ids), variant(ids), print(opt), clearMastered()}` | 分组、选择、**重练入口** | `openRetry`、`mistakes.clearMastered` | **FR-19、FR-21** |
| 举一反三页 | `renderVariants(el, questions)` → `{again()}` | 展示变式题、再来一组 | `variants.generate` | FR-20 |
| 学情页 | `renderStats(el)` | 组合三种图表 | `stats.*`、`ui/charts/*` | FR-22~24 |
| 历史页 | `renderHistory(el)` | 筛选、详情、删除 | `history.list/remove` | FR-17 |
| 档案页 | `renderProfiles(el)` | 增删改切换 | `profile.*` | FR-01~03 |
| 设置页 | `renderSettings(el)` | 导入导出、音效 | `backup.*`、`triggerDownload` | FR-27、FR-28 |

#### 5.4.3 图表接口（`src/ui/charts/`）

| 接口 | 签名 | 输出 | 约束 |
|---|---|---|---|
| 折线图 | `lineChart(svgEl, {points, range})` | SVG 节点 | 点 ≤ 全部保留记录（≤2500），超出按条数截取由 `stats.trend` 负责 |
| 条形图 | `barChart(svgEl, {items:[{label,value,level}]})` | SVG 节点 | 每个条必须带文字标签（AC-23.4） |
| 热力格 | `heatmap(svgEl, {days, values})` | SVG 节点 | 8 周 = 56 格 |

### 5.5 外部接口''')

# ---------- 6. §6.2 补齐字段级结构 ----------
s = s.replace(
'''#### Question / Paper

见 §5.1.2 的 TS 定义；`Paper = {id, questions[], createdAt, options, stats}`。

**关联关系**：

```
Profile 1 ──< SessionRecord 1 ──< Attempt（存于 paper/attempts，不单独落盘）
Profile 1 ──< Mistake
SessionRecord >── Paper >── Question >── KnowledgePoint（常量）
Mistake ──(kpId,type,params)──> 生成同型 Question
```
''',
'''#### 6.2.1 KnowledgePoint（代码常量，不落盘）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | string | 唯一，格式 `G{年级}-{两位序号}` | 如 `G1-03` |
| `grade` | 1\\|2\\|3 | 枚举 | 所属年级 |
| `order` | int | 1~8，年级内唯一 | 学习顺序（AC-04.5） |
| `difficulty` | 1\\|2\\|3 | 枚举 | 该知识点的基准星级；`Question.difficulty` 由 spec 收窄后落在该值附近 |
| `name` / `desc` | string | 名称 ≤20 字；说明 10~60 字 | 名称与说明（AC-04.2、AC-04.4） |
| `types` | string[] | ∈ {horizontal, vertical, compare, fill, chain} | 支持的题型（AC-10.5） |
| `spec` | Spec | 见 6.2.7 | 数值约束，**出题引擎只读此字段**（NFR-07.2） |

#### 6.2.2 Question

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | string | 全卷唯一 | — |
| `kpId` | string | 外键 → KnowledgePoint | — |
| `type` | enum | horizontal/vertical/compare/fill/chain | 题型 |
| `op` | enum | add/sub/mul/div/compare/mix | 运算种类（分数题仍为 add/sub，以 `kind` 区分） |
| `kind` | enum | int/decimal/fraction/remainder/symbol | 答案种类，决定规范化规则（§6.4.3） |
| `text` | string | 非空，含作答位 | 展示文本 |
| `answer` | string | 规范化形式，**不得为空**（FM-09 检测点） | 标准答案 |
| `difficulty` | 1\\|2\\|3 | — | 本题星级 |
| `params` | Params | 见 6.2.3 | 生成参数，供变式反推与去重 |
| `layout` | VerticalLayout \\| undefined | 仅竖式题存在 | `{rows:string[], width:int, answerDigits:int, plain?:bool}` |

#### 6.2.3 Question.params（按 `op` 区分）

| `op` | 字段 | 类型 | 说明 / 用于变式反推 |
|---|---|---|---|
| add / sub | `a, b, result` | int | 操作数与结果；`digits` = max(a,b) 的位数 |
| add / sub | `carry` / `borrow` | bool | 是否进位/退位 |
| mul | `a, b, result, digits` | int | — |
| div | `a`（被除数）, `b`（除数）, `quotient`, `rem` | int | `rem>0` 时为有余数除法；`quotientHasZero` 表示商中含 0 |
| compare | `a, b, result` | int / `'<'`\\|`'>'`\\|`'='` | 比较题两侧操作数与符号 |
| mix | `a, b, c, op1, op2, mid, result, paren` | int / string / bool | 两步运算的中间结果 `mid` 与括号标志 |
| fraction | `a, b, denom, result` | int | 同分母加减，`denom ≤ 10`；结果为分子 |
| decimal | `a, b, result, scale` | int | **以缩放整数存储**，`scale` 为小数位数（如 3.5 → a=35, scale=1），判分时再还原 |

> **变式反推规则（FR-20）**：变式只沿用 `kpId + type + op + digits(kind)` 与星级，**不复用具体数值**；`params` 的结构决定了新题落在同一约束空间，且 `dedupeKey` 能把完全相同的题排除（AC-20.3）。

#### 6.2.4 Paper

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | string | 唯一 | — |
| `questions` | Question[] | 长度 = 实际题量，≥1 | 预览删除后重建 `id` 与题号 |
| `createdAt` | number | — | 毫秒时间戳 |
| `options` | PaperOptions | 与请求一致（含钳制后的值） | 供「重新生成」沿用参数 |
| `stats` | `{avgStar:number, dist:{kpId:int}}` | `avgStar` 一位小数 | 预览页统计区（AC-09.5、AC-11.2） |

#### 6.2.5 Attempt（运行时结构，不单独落盘）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `userAnswer` | string | 可为空串 | 原始输入（用于错题本展示） |
| `correct` | boolean | — | 首次提交结果 |
| `skipped` | boolean | 与 `correct` 互斥 | 空串/跳过 |
| `elapsedMs` | int | ≥0；跳过为 0 | 单题耗时（TR-02） |
| `first` | boolean | — | 是否为该题首次提交；重试记 `false`，不进入成绩与掌握度 |

**存储位置**：`Session.attempts: Record<qid, Attempt>`；结算时展开为 `SessionResult.detail/wrongList`，随后随 Paper 一并写入 `SessionRecord`。

#### 6.2.6 `km:quiz:active:<pid>` 临时会话结构

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `profileId` | string | 外键 → Profile | 必须等于当前档案 |
| `mode` | enum | practice/retry/variant | 结算时决定是否写错题归档（variant 也写） |
| `paper` | Paper | 与 F1 相同 | 进行中的卷子 |
| `attempts` | Record<qid, Attempt> | 键必须属于 `paper.questions` | 已作答记录 |
| `startAt` | number | ≤ `savedAt` | 计时起点（TR-01） |
| `limitMs` | int \\| null | 60000~3600000 或 null | 倒计时（TR-03） |
| `savedAt` | number | — | 最近一次保存；恢复时超过 24 小时视为过期 |
| `cursor` | int | 0 ≤ cursor < 题量 | 当前题号，用于恢复定位 |

**恢复校验**：`schema.validateActiveSession()` 逐字段检查类型、外键、键集合；任一失败即删除临时键（FM-02 的同类策略），不弹错误。

**关联关系**：

```
Profile 1 ──< SessionRecord ──> Paper ──< Question ──> KnowledgePoint（常量）
Profile 1 ──< Mistake ──(kpId,type,params)──> 生成同型 Question
Profile 1 ──0..1── km:quiz:active（进行中的 Session）
```
''')

# ---------- 7. §6.2.7 Spec ----------
s = s.replace(
'''### 6.3 约束与一致性策略''',
'''#### 6.2.7 知识点 spec（数值约束规格）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `op` | enum | add/sub/mul/div/mix/compare/addSub | 运算类型，决定调用哪个生成函数 |
| `kind` | enum | int/decimal/fraction/remainder/symbol | 答案种类 |
| `a` / `b` / `c` | `{min,max}` | `min ≤ max`，均为非负整数 | 操作数取值范围 |
| `result` | `{min,max}` | 必须覆盖算法可能结果 | 结果范围（如 20 以内加法 `{11,20}`） |
| `carry` / `borrow` | bool | 仅 add/sub | 是否强制（true）或禁止（false）进位/退位 |
| `quotient` | `{min,max}` | 仅 div | 商的取值范围 |
| `remainder` | bool | 仅 div | 是否要求有余数 |
| `quotientHasZero` | bool | 仅 div | 商中是否必须含 0 |
| `paren` | bool | 仅 mix | 是否带括号 |
| `scale` | int | 仅 decimal | 小数位数（以缩放整数生成） |

**约束校验（新增知识点的验收条件，见 §11.1）**：`schema.validateSpec(spec)` 检查字段名、类型、区间有序、`op` 与必填字段匹配；`spec` 不合法时启动即报错，不允许生成题目。

### 6.3 约束与一致性策略''')

# ---------- 8. §9 增加安全与可维护性的可验证做法 ----------
s = s.replace(
'''## 10. 设计决策与权衡''',
'''### 9.2 安全与可维护性的可验证做法

#### 9.2.1 导入数据的逐字段校验（对应 NFR-05.4、FM-08）

**落盘顺序**：读取文本 → 大小校验 → `JSON.parse` → **逐字段 schema 校验** → 写入临时键 → 再次读回校验 → 原子替换。**任何一步失败，原数据不变**。

| 步骤 | 校验对象 | 逐字段规则 | 失败码 |
|---|---|---|---|
| 1 | 文件 | 字节数 ≤ 5MB | `FILE_TOO_LARGE` |
| 2 | 文本 | `JSON.parse` 成功 | `INVALID_JSON` |
| 3 | 根对象 | `format === 'kidsmath-backup'`；`version` 主版本 ≤ 1；`profiles` 为数组 | `BAD_FORMAT` / `VERSION_TOO_NEW` |
| 4 | `profiles[]` | `id:string(非空,档案内唯一)`、`name:string(≤12)`、`grade∈{1,2,3}`、`avatar∈AVATARS`、`createdAt:int>0` | 非法项**跳过并计数** |
| 5 | `data[pid].sessions[]` | `id:string`、`total/correct/wrong/skipped` 为非负 int 且 `correct+wrong+skipped=total`、`accuracy:0~100`、`finishedAt:int>0`、`kpCount` 的值均为非负 int | 跳过并计数 |
| 6 | `data[pid].mistakes[]` | `id`、`key` 非空且档案内唯一、`kpId` 存在、`type∈TYPES`、`wrongCount≥1`、`mastered:bool` | 跳过并计数 |
| 7 | `data[pid].badges[]` | `id∈{streak7,streak30,streak100}`、`earnedAt:int>0` | 跳过并计数 |
| 8 | `settings` | `sound:bool`、`theme∈{auto,light,dark}` | 回落默认值 |
| 9 | 写回 | 写入 `km:__import_tmp__` 后读回并用同一校验函数复核 | `WRITE_FAILED` → 删除临时键 |

**可验证方式**：构造 10 个违规样本（超 5MB、非 JSON、format 错、version=99、grade=4、字段类型错、`correct+wrong+skipped≠total`、未知 kpId、重复 key、未知 badge id），逐个导入后断言：① 返回对应失败码或跳过计数；② `km:*` 原有键的序列化内容**逐字节不变**（管理员脚本比对）。

#### 9.2.2 "按模板新增一个知识点"的分步用例（对应 NFR-07.2）

> 目标：把"0 处引擎改动"变成**可执行检查**，而不是口头声明。

| 步骤 | 操作 | 期望结果 |
|---|---|---|
| 1 | 在 `syllabus.js` 的 `SYLLABUS` 末尾追加一条：`{id:'G2-09', grade:2, order:9, difficulty:2, name:'100 以内整十数减一位数', desc:'…', types:['horizontal','fill'], spec:{op:'sub',kind:'int',a:{min:20,max:90},b:{min:1,max:9},result:{min:11,max:89}}}` | `schema.validateSpec` 通过；大纲页二年级分组多出 1 条 |
| 2 | 运行依赖检查脚本 `scripts/check-layers.js` | `src/domain/generator.js` 的 **修改行数 = 0**（`git diff --stat` 输出该文件无变化） |
| 3 | 运行生成测试 `generateQuestions('G2-09', 100, {seed:42})` | 返回 100 道；全部满足 `20≤被减数≤90`、`1≤减数≤9`、`11≤结果≤89`；按 `Answer= a-b` 重算 **0 条不一致** |
| 4 | 在出题台选 `G2-09` 生成 30 题并打印 | 卷面正常；答案页 30 条与卷面对应 |
| 5 | 统计页 | `G2-09` 出现在知识点分布与掌握度中（`name` 来自配置，无硬编码） |

**判定**：步骤 2 的"修改行数 = 0"与步骤 3 的"0 条不一致"同时成立，才视为 NFR-07.2 达标。

#### 9.2.3 其他安全做法的可验证点

| 做法 | 验证 |
|---|---|
| 无外部请求 | DevTools Network 全程 0 个跨域请求（TC-AC-27.5） |
| 无第三方脚本 | 源码检索 `https?://` 于 `<script>`/`fetch`/`import` → 0 处 |
| 不申请权限 | 检索 `Notification.requestPermission`、`getUserMedia`、`geolocation` → 0 处 |
| 存储键隔离 | `storage.clearAll()` 只删除 `km:` 前缀的键（同源其它应用数据不动） |

---

## 10. 设计决策与权衡''')

# ---------- 9. 矩阵闭合并补 I 列 ----------
s = s.replace(
'| FR-11 | Should | M:generator, ui:paper | `Paper.stats` | 预览 | T:11.1~11.6 | NFR-02 |',
'| FR-11 | Should | M:generator, `ui:paper` / I:`renderPaper.print/regenerate/removeQ`、`buildPrintView` | `Paper.stats` | 预览页 | T:11.1~11.6 | NFR-02 |')
s = s.replace(
'| FR-12 | Must | M:ui/quiz, components/keypad / F:F2 | Attempt | 答题页 | T:12.1~12.7 | NFR-06.4、AC-KB |',
'| FR-12 | Must | M:`ui:quiz`, `components:keypad` / I:`keypad.mount`、`captureKeys`、`createSession`、`recordAttempt` / F:F2、F6 | Attempt | 答题页 | T:12.1~12.7 | NFR-06.4（AC-KB.1~5，见表 0-4） |')
s = s.replace(
'| FR-21 | Should | M:app:exporters / F:F5 | Mistake | 错题本 | T:21.1~21.5 | NFR-10 |',
'| FR-21 | Should | M:`app:exporters` / I:`renderMistakes.print`、`buildPrintView` / F:F5（§4.6） | Mistake | 错题本 | T:21.1~21.5 | NFR-10 |')
s = s.replace(
'| FR-25 | Must | M:app:exporters, print.css / F:F5 | Paper | 打印预览 | T:25.1~25.9 | NFR-10、FM-06/07 |',
'| FR-25 | Must | M:`app:exporters`, `print.css` / I:`buildPrintView(paper,{answerSheet:false})`、`renderPaper.print` / F:F5（§4.6） | Paper | 打印预览 | T:25.1~25.9 | NFR-10、FM-06/07 |')
s = s.replace(
'| FR-26 | Must | M:app:exporters / F:F5 | Paper | 打印预览 | T:26.1~26.6 | NFR-10.4 |',
'| FR-26 | Must | M:`app:exporters` / I:`buildPrintView(paper,{answerSheet:true})` / F:F5（§4.6） | Paper | 打印预览 | T:26.1~26.6 | NFR-10.4 |')
s = s.replace(
'| FR-19 | Must | M:mistakes, app:quizSession / I:clearMastered / F:F3 | `mastered` | 错题本 | T:19.1~19.6 | — |',
'| FR-19 | Must | M:mistakes, `app:quizSession` / I:`renderMistakes.retrySelected`、`openRetry`、`clearMastered` / F:F3（含异常分支） | `mastered` | 错题本 | T:19.1~19.6 | — |')
s = s.replace(
'| FR-18 | Must | M:mistakes / I:archive / F:F2 | Mistake.key（C-D2） | 错题本 | T:18.1~18.6 | — |',
'| FR-18 | Must | M:mistakes / I:`archive`、`getByKey` / F:F2 | Mistake.key（C-D2） | 错题本 | T:18.1~18.6 | — |')
s = s.replace(
'| FR-20 | Must | M:variants / I:variants.generate / F:F3 | `Mistake.params` | 举一反三 | T:20.1~20.7 | — |',
'| FR-20 | Must | M:variants / I:`variants.generate(mistake,n=5)` / F:F3（A/B/C 三级降级） | `Mistake.params`、`Question.params`（§6.2.3） | 举一反三 | T:20.1~20.7 | — |')
s = s.replace(
'| FR-27 | Must | M:storage / I:read, write / F:F2 | 全部键 | 设置页 | T:27.1~27.5 | FM-01~03 |',
'| FR-27 | Must | M:storage / I:`read`、`write`、`migrate` / F:F2、F6 | 全部键（§6.1） | 设置页 | T:27.1~27.5 | FM-01~03 |')
s = s.replace(
'| FR-28 | Should | M:backup / I:export, validate, apply / F:F4 | §6.5 | 设置页 | T:28.1~28.6 | C-D8、FM-08 |',
'| FR-28 | Should | M:backup / I:`export`、`validate`、`apply`、`triggerDownload` / F:F4 | §6.5 | 设置页 | T:28.1~28.6 | C-D8、FM-08、§9.2.1 |')

# 反向追溯补充
s = s.replace(
'| 去重键 `dedupeKey` | FR-07.4、FR-18.5、FR-20.3 | 卷内重复、错题重复计数、变式与原题重样 |',
'''| 去重键 `dedupeKey` | FR-07.4、FR-18.5、FR-20.3 | 卷内重复、错题重复计数、变式与原题重样 |
| `keypad.mount` / `captureKeys` | FR-12（AC-12.3/12.4） | 触屏儿童无法输入答案 |
| `buildPrintView` | FR-11、FR-21、FR-25、FR-26 | 界面与打印耦合，答案页与卷面错位 |
| `openRetry` + F3 降级分支 | FR-19、FR-20 | 错题重练入口缺失或变式题生成卡死 |
| `resumeSession` + `km:quiz:active` | FR-12、TR-01、§9.1 | 刷新丢失进行中练习 |
| `schema.validateSpec` | FR-06、NFR-07.2 | 新增知识点时静默超纲 |''')

# ---------- 10. §11 可验证性补充 ----------
s = s.replace(
'''| 打印分页 | 100 题竖式的打印预览 PDF |''',
'''| 打印分页 | 100 题竖式的打印预览 PDF |
| `buildPrintView` 输出 | 断言答案页题号与练习卷 `questions[i].id` 一一对应 |
| 变式降级分支 | 构造只有 2 道可用题的知识点，断言返回 2 道并提示，不返回 `null` |
| 会话恢复 | 写入合法的 `km:quiz:active`，刷新后断言弹层出现且回到第 N 题；写入非法结构的临时会话，断言静默删除 |
| 导入逐字段校验 | §9.2.1 的 10 个违规样本 + 原数据字节比对 |
| 新增知识点 0 改动 | §9.2.2 的分步用例（`generator.js` 修改行数 = 0） |''')

p.write_text(s, encoding='utf-8')
print('written', len(s))
