# BONCML Workspace 产品化落地总方案

## 0. 本轮复审后的结论

这份文档不再定位为“方向性规划”，而应作为 **BONCML Workspace 产品化执行主方案**。

复审后的判断是：

> 当前方向正确，但不能只靠 `WorkspaceRoomPage + channel + issue + squad` 的语义包装完成产品化。要真正落地，必须把“复用边界、工件模型、入口切换、Runtime 协议”前置为硬约束。

因此本方案做以下收紧：

1. **不再新开一份平行 plan**  
   继续以本文档作为主计划，避免 `boncml-workspace-mvp.md`、`boncml-brand-shell-cutover.md` 与新文档并行发散。

2. **明确 multica 只能作为技术底座**  
   `issue / squad / channel / workspace` 可以复用，但不能简单改名后直接对外当 BONCML 产品实体。

3. **把工件和审计前置**  
   `TASKS / ARTIFACTS / AUDIT` 不能长期停留在 placeholder。没有结构化工件和审计链路，BONCML Workspace 会退化成聊天页面。

4. **把入口切换视为产品化工程，不是文案替换**  
   登录后落点、全局导航、默认页面、旧页面隐藏策略，都必须纳入 P1。

5. **单独定义 BONCML Runtime 协议**  
   Runtime 调用不能只写“执行 oneway”。必须明确 Job Spec、参数校验、执行记录、结果回写、错误审计、版本绑定。

## 1. 这份文档解决什么问题

这份文档用于替代“继续围绕 channel 做聊天增强”作为主线的思路。

它基于三类信息重新收敛方案：

1. `DOC/new/BONCML新产品形态讨论材料.md`
2. 最新 mockup / 截图（BONCML Workspace 工作台形态）
3. `multica` 现有已经具备的能力：
   - workspace 壳层
   - channel 协作流
   - issue 工作项
   - squad 组织模型
   - realtime / upload / timeline / audit 风格能力

目标不是“再做一个聊天产品”，而是：

> **在最大化复用 multica 现成底座的前提下，产品上完整包装为 BONCML Workspace，并尽快打通一个可交付、可审计、可演示的统计分析工作台 MVP。**

---

## 2. 产品定义

## 2.1 最终产品是什么

BONCML Workspace 不是：

1. BONCML Chat
2. 统计问答机器人
3. 通用协作平台的换皮版

BONCML Workspace 是：

> **一个面向企业私有化数据分析任务的多 Agent 协作工作台。**

它的核心价值不是聊天本身，而是：

1. 用自然语言接收分析需求
2. 通过多个专业 Agent 推动任务
3. 调用 BONCML Runtime 完成统计分析
4. 交付结构化工件和报告
5. 保证分析过程可审计、可复现、可归档

## 2.2 产品核心原则

后续一切设计都服从下面 5 条：

1. **聊天是入口，不是产品中心**
2. **任务、工件、审计比消息气泡更重要**
3. **底层可以复用 multica，前台不能暴露 multica**
4. **能复用现成 workflow 骨架，就不重复造轮子**
5. **MVP 先打通一条真实分析闭环，不铺开所有能力**

---

## 3. 对 multica 的正确理解

## 3.1 multica 里哪些东西和新方案“很像”

你的判断是对的。`multica` 中的这些概念，与 BONCML 新方案是同类抽象：

| multica 现有概念 | 在 BONCML Workspace 中更像什么 |
|---|---|
| workspace | 工作台容器 / 产品页面骨架 |
| channel | 房间中的 CHAT 协作流 |
| issue | 分析任务 / 分析 case / 工作项 |
| squad | Agent Team / 分析执行组 |
| automation / autopilot / trigger | 状态机 + 自动编排规则 |
| activity / timeline / execution log | Audit / 执行记录 |

所以后续不应该把 BONCML Workspace 理解为“完全另起炉灶”，而应该理解为：

> **在 multica 的通用工作流骨架之上，叠加 BONCML 的分析产品语义。**

## 3.2 哪些东西可以直接复用

### 可直接复用

1. `ChannelConversation`
   - 作为 `CHAT` tab 的主体
2. realtime / unread / retry / pagination / reconnect resync
3. ContentEditor / 上传 / markdown / 草稿
4. workspace 壳层与页面布局组件
5. issue 的状态 / timeline / execution log / 活动流模式
6. squad 的成员组织与 leader 模型
7. workspace / member / agent / role 基础设施

### 不应重复开发

1. 再造一套聊天室
2. 再造一套 timeline / activity 系统
3. 再造一套 agent team 管理
4. 再造一套 workspace 页面容器

### 必须新做的

1. BONCML 专属产品语义
2. 分析工件模型
3. 分析任务状态机
4. BONCML Runtime 协议
5. 去 multica 化的页面与入口

### 不能只靠改名解决的

下面这些能力虽然可以复用底层，但必须增加 BONCML 语义层：

| 底层能力 | 不能直接等同于 | 必须补的 BONCML 语义 |
|---|---|---|
| issue | Analysis Task | 分析阶段、数据集、方法选择、审批点、结果绑定 |
| squad | Agent Team | 固定分析角色、运行职责、任务分派规则 |
| channel | Workspace Chat | 阶段事件、工件引用、用户确认入口 |
| activity timeline | Audit Trail | Runtime 版本、参数、输入输出、审批、工件版本 |
| attachment/upload | Dataset | 数据画像、字段类型、质量检查、数据集版本 |

---

## 4. 产品化总体策略

## 4.1 技术策略

技术上：

1. 继续复用 multica 的底层模型和能力
2. 新增 BONCML 语义层，而不是大规模推倒重做

## 4.2 产品策略

产品上：

1. 所有用户可见页面、入口、路由、文案、品牌统一为 BONCML Workspace
2. 不能再把 multica 页面直接作为正式产品主页面

## 4.3 MVP 策略

第一版只做一个明确场景：

1. **数据文件 快速分析**

先打通：

1. 上传 CSV
2. 自然语言提出需求
3. Orchestrator 澄清
4. 生成分析计划
5. BONCML 执行 `oneway`
6. 输出管理层摘要与可下载报告
7. 全链路可审计

---

## 5. 产品页面设计

## 5.1 主页面要不要新作

**要。**

现有 `ChannelDetailPage` 不能继续充当最终产品主页。

正确做法是：

1. 新作 `WorkspaceRoomPage`
2. `ChannelConversation` 作为其 `CHAT` tab 内的内容被复用

## 5.2 主页面结构

建议按三段式结构落地：

```text
+-----------------------------------------------------------------------------------+
| Top: 房间标题 + 分析链路                                                          |
| BONCML / 数据文件 快速分析 / DATA QUALITY > ANALYSIS PLAN > BONCML RUN > SUMMARY |
+-------------------------+---------------------------------------------------------+
| Left Rail               | Main Area                                               |
|-------------------------|---------------------------------------------------------|
| Rooms                   | Tabs: CHAT | TASKS | ARTIFACTS | AUDIT                  |
| Members                 |---------------------------------------------------------|
| Agents                  | 当前 tab 主体                                           |
| System                  |                                                         |
|                         | CHAT      = ChannelConversation                         |
|                         | TASKS     = 阶段卡 / 状态机 / 责任 Agent               |
|                         | ARTIFACTS = Manifest / Plan / Job / Result / Report    |
|                         | AUDIT     = 状态变化 / 调用记录 / 审批 / 执行记录       |
+-------------------------+---------------------------------------------------------+
```

## 5.3 四个核心视图

### CHAT

职责：

1. 展示用户与 Agent 的协作流
2. 展示上传、提问、澄清、阶段反馈
3. 保持现有频道协作能力

实现：

1. 直接复用 `ChannelConversation`

### TASKS

职责：

1. 让用户不看聊天也知道分析走到哪一步
2. 展示阶段、状态、责任 Agent、等待确认项

### ARTIFACTS

职责：

1. 展示所有结构化工件
2. 把结果从聊天消息中抽离出来

### AUDIT

职责：

1. 展示谁做了什么
2. 展示 Agent 调用、状态变化、审批、生成记录

---

## 6. 数据与工件模型

MVP 至少要落 5 类工件。

这里是本方案的产品化硬约束：

> 工件不是聊天消息附件，也不是普通 markdown 内容。工件必须是可查询、可版本化、可绑定任务、可进入审计链路的结构化对象。

建议新增统一工件表，而不是把所有内容塞进 issue description 或 channel message：

```text
analysis_artifact
- id
- workspace_id
- analysis_task_id
- type
- title
- status
- version
- payload_json
- file_refs
- created_by_type
- created_by_id
- created_at
- updated_at
```

`type` 第一阶段至少支持：

1. `dataset_manifest`
2. `analysis_plan`
3. `boncml_job_spec`
4. `result_package`
5. `audit_snapshot`

后续 UI 的 `ARTIFACTS` tab 只读取这类工件，不从聊天消息里临时解析。

## 6.1 Dataset Manifest

至少包含：

1. datasetId
2. sourceType
3. sourceName
4. rowCount
5. columns
6. quality warnings
7. generatedAt

## 6.2 Analysis Plan

至少包含：

1. businessQuestion
2. objective
3. dependent
4. factor / variables
5. candidateMethods
6. selectedMethod
7. assumptionsToCheck
8. requiresApproval

## 6.3 BONCML Job Spec

至少包含：

1. jobId
2. algorithm
3. datasetId
4. fieldMapping
5. parameters
6. outputFormats
7. runtimeVersion

## 6.4 Result Package

至少包含：

1. raw output
2. structured JSON
3. chart refs
4. summary text
5. downloadable files

## 6.5 Audit Trail

至少包含：

1. actor
2. action
3. target
4. timestamp
5. version / runtime
6. related artifact / task

审计事件建议独立于普通 issue activity：

```text
analysis_audit_event
- id
- workspace_id
- analysis_task_id
- artifact_id
- actor_type
- actor_id
- action
- target_type
- target_id
- details_json
- runtime_version
- created_at
```

issue activity 可以作为展示样式和部分普通事件来源复用，但 BONCML 审计事件必须有独立数据口径。

---

## 7. 任务实体与状态机

这里是方案需要调整的关键点：

> **不要默认新造一套任务系统。先判断 multica 的 issue 是否可以作为 Analysis Task 的底层承载。**

复审后进一步收紧为：

> issue 可以作为底层工作项，但 Analysis Task 不能只等于 issue 改名。MVP 至少需要一层 `analysis_task` 扩展，把 BONCML 分析语义挂到 issue 上。

## 7.1 推荐做法

MVP 第一版建议：

1. 底层复用 issue 作为通用工作项
2. 新增 analysis_task 作为 BONCML 任务扩展
3. 前台产品上只展示：
   - Analysis Task
   - Analysis Case
   - 分析任务

这样可以直接借用：

1. 状态
2. timeline
3. comment / activity
4. 执行记录
5. 责任人/参与人

建议结构：

```text
analysis_task
- id
- workspace_id
- issue_id
- room_id
- squad_id
- business_question
- current_stage
- current_artifact_id
- dataset_artifact_id
- plan_artifact_id
- result_artifact_id
- requires_approval
- created_at
- updated_at
```

这样做的好处是：

1. issue 继续负责通用协作能力
2. analysis_task 负责 BONCML 分析语义
3. 后续如果 issue 不适合承载，也能逐步迁移，不会把产品语义锁死在 multica 原模型里

## 7.2 BONCML 状态机

产品语义上使用新的状态机：

1. `created`
2. `clarifying`
3. `planning`
4. `data_ready`
5. `pending_approval`
6. `running`
7. `reviewing`
8. `completed`
9. `failed`
10. `archived`

实现上：

1. issue status 只作为通用展示状态
2. `analysis_task.current_stage` 才是 BONCML 分析阶段
3. 二者需要显式映射，不允许在 UI 中混用

推荐映射：

| BONCML 阶段 | issue status |
|---|---|
| created | todo |
| clarifying | in_progress |
| planning | in_progress |
| data_ready | in_progress |
| pending_approval | in_review |
| running | in_progress |
| reviewing | in_review |
| completed | done |
| failed | blocked |
| archived | cancelled |

---

## 8. Agent Team 策略

这里也不建议从零开始设计新组织模型。

## 8.1 推荐做法

底层优先复用 `squad` 承载 Agent Team。

复审后需要明确边界：

> squad 负责“有哪些 Agent、谁是 leader、团队说明是什么”；真正的一次分析执行，不能直接等同于 squad。

前台语义：

1. Orchestrator
2. Data Agent
3. Method Agent
4. BONCML Runner
5. Report Agent

底层仍可由 squad 管：

1. 成员
2. leader
3. instructions
4. 归档

但每个 Analysis Task 还需要记录：

1. 使用哪个 squad
2. 当前由哪个 Agent 负责
3. 哪个阶段由哪个 Agent 产出了哪个工件
4. 哪次 Runtime 调用由哪个 Agent 发起

这些不应塞进 squad 本身，而应落到 `analysis_task`、`analysis_artifact`、`analysis_audit_event`。

## 8.2 MVP 第一版 Agent 范围

第一版不要做太多：

1. Orchestrator
2. Data Agent
3. Method Agent
4. BONCML Runner
5. Report Agent

Reviewer / NL2SQL / ETL / Ontology 先后置。

---

## 9. 审计与流程复用策略

这里也要避免重复开发。

## 9.1 可以复用的现成能力

1. issue activity timeline
2. execution log 展示模式
3. 状态变更事件
4. agent 运行卡片

## 9.2 必须新增的 BONCML 审计项

1. Dataset Manifest 生成记录
2. Analysis Plan 确认记录
3. BONCML Job Spec 执行记录
4. BONCML Runtime 版本
5. Result Package 生成记录

原则：

1. **能复用 timeline 的外形和机制，就复用**
2. **BONCML 专属审计语义单独补**

## 9.3 审计不能省略的最小闭环

CSV 分析 MVP 至少要写入以下审计事件：

1. 用户上传数据文件
2. Data Agent 生成 Dataset Manifest
3. Orchestrator 生成或更新 Analysis Plan
4. 用户确认或跳过确认
5. Method Agent 选择算法
6. BONCML Runner 生成 Job Spec
7. BONCML Runtime 开始执行
8. BONCML Runtime 执行成功或失败
9. Report Agent 生成 Result Package
10. 用户下载或查看报告

如果这些事件不能被 AUDIT tab 查询并展示，就不能视为 Workspace MVP 完成。

---

## 10. 路由与品牌策略

## 10.1 登录

登录体系继续复用现有。

## 10.2 主入口

登录后默认落点切换为：

1. `WorkspaceRoomPage`

而不是：

1. 旧 channel 详情页
2. 旧 multica 主页面

复审后补充：

> 主入口切换不是“新增 `/rooms/:id` 页面”就完成。必须把所有默认跳转和主导航路径一起改掉。

至少需要覆盖：

1. 登录成功后的默认跳转
2. 创建 workspace 后的默认跳转
3. 接受邀请后的默认跳转
4. onboarding 完成后的默认跳转
5. 全局 sidebar 的主导航
6. workspace 切换后的默认入口
7. 空 workspace 时自动创建或引导创建第一个分析房间

## 10.3 品牌约束

用户可见层必须：

1. 只出现 BONCML / BONCML Workspace
2. 不出现 multica / channel / issue 等术语

技术内部可以保留旧命名，前台不允许暴露。

## 10.4 去 multica 化的最小验收标准

P1 完成时，普通用户登录后应满足：

1. 看不到 multica 品牌
2. 看不到 Issues / Squads / Channels 作为一级产品概念
3. 默认进入 BONCML Workspace
4. 主页面围绕分析房间、分析任务、工件、审计组织
5. 旧页面只能通过兼容 URL 或管理员入口访问

---

## 11. BONCML Runtime 协议

Runtime 协议是产品闭环的中轴，不能只写“调用 oneway”。

## 11.1 Job Spec

`BONCML Job Spec` 至少包含：

```text
job_id
analysis_task_id
dataset_artifact_id
algorithm
field_mapping
parameters
output_formats
runtime_version
requested_by_agent_id
created_at
```

## 11.2 执行接口

MVP 可以先做内部 API，不必一开始抽成公开 SDK：

```text
POST /api/analysis-tasks/:id/boncml-jobs
GET  /api/analysis-tasks/:id/boncml-jobs/:jobId
GET  /api/analysis-tasks/:id/artifacts
GET  /api/analysis-tasks/:id/audit-events
```

## 11.3 结果回写

Runtime 执行完成后必须回写：

1. Result Package 工件
2. Runtime 执行日志
3. 成功/失败审计事件
4. analysis_task 当前阶段
5. chat 中的阶段性摘要消息

其中 1、2、3 是产品化硬要求；第 5 项只是协作体验，不应成为唯一结果载体。

## 11.4 错误处理

失败时不能只在聊天里回复“运行失败”。

必须沉淀：

1. 失败阶段
2. 失败算法
3. 参数快照
4. Runtime 版本
5. 错误摘要
6. 可重试建议
7. 审计事件

---

## 12. 分阶段实施顺序（调整后）

下面是重新调整后的、真正可落地的执行顺序。

## P0：复用映射确认

先不要急着开发，先做 4 个判断：

1. `WorkspaceRoomPage` 现有实现哪些可直接保留
2. `issue` 是否可作为 Analysis Task 的底层承载
3. `squad` 是否可作为 Agent Team 的底层承载
4. `activity / execution log` 哪些可直接转为 AUDIT

这一阶段的目标是：

1. 明确“哪些要新做”
2. 明确“哪些只要换语义和入口”
3. 输出 issue/squad/channel/activity 的复用边界表
4. 不写代码也可以，但必须形成明确工程决策

## P1：BONCML Workspace 壳层与去 multica 化

目标：

1. 上线 BONCML Workspace 主页面
2. 登录后主路径切换到 Workspace
3. 前台完成去 multica 化

范围：

1. WorkspaceRoomPage
2. Workspace Shell
3. Workspace Rail
4. 顶部分析链路
5. `CHAT / TASKS / ARTIFACTS / AUDIT`
6. 品牌替换

验收：

1. 普通用户登录后默认进入 BONCML Workspace
2. 全局导航不再把 Issues / Squads / Channels 作为主入口暴露
3. `WorkspaceRoomPage` 成为主工作页面
4. `TASKS / ARTIFACTS / AUDIT` 即使未完全实现，也必须显示来自真实 API 的空状态，而不是纯静态占位

## P2：Analysis Task / Artifact / Audit 最小模型

目标：

1. 新增 analysis_task 扩展层
2. 新增 analysis_artifact
3. 新增 analysis_audit_event
4. TASKS / ARTIFACTS / AUDIT tab 接入真实数据

范围：

1. 数据库 migration
2. 后端 API
3. 前端查询 hooks
4. 空状态、列表态、详情态
5. issue 与 analysis_task 的映射

## P3：Analysis Task 与 Agent Team 映射

目标：

1. 确定并落地 issue -> Analysis Task 映射
2. 确定并落地 squad -> Agent Team 映射

范围：

1. 状态映射
2. 展示映射
3. 前台命名替换
4. squad 作为 Agent Team 配置来源
5. 当前责任 Agent 和阶段产出关系

## P4：BONCML Runtime 协议与 Job Spec

目标：

1. 把 BONCML Job Spec 和 Runtime 调用跑通

范围：

1. Job Spec schema
2. Runtime 调用 API
3. Result Package 回写
4. Runtime 版本记录
5. 失败审计

## P5：CSV 分析 MVP 闭环

目标：

把“数据文件 快速分析”打通。

流程：

1. 上传 CSV
2. 生成 Dataset Manifest
3. Orchestrator 澄清
4. 生成 Analysis Plan
5. BONCML Runner 执行 `oneway`
6. 生成 Result Package
7. 输出管理层摘要
8. 写 Audit Trail

验收：

1. 用户可以上传 CSV
2. 系统生成 Dataset Manifest 工件
3. 系统生成 Analysis Plan 工件
4. 用户能看到或确认计划
5. 系统生成 BONCML Job Spec
6. Runtime 执行并回写 Result Package
7. ARTIFACTS tab 能查看完整产物
8. AUDIT tab 能看到完整链路
9. CHAT 只是展示协作过程，不是唯一结果存放地

---

## 13. 这意味着原方案要怎么调整

## 13.1 `channel-chat-upgrade.md`

结论：

1. 到 **Phase A** 为止可以视为阶段完成
2. 后续不再作为产品主线

它的成果现在变成：

1. Workspace 的 `CHAT` 底座

## 13.2 `channel-collaboration-workspace.md`

结论：

1. 保留
2. 后置

它更适合在 Workspace MVP 跑通之后，再做：

1. Inbox
2. Saved
3. 全局提及
4. permalink
5. 对象详情

## 13.3 `boncml-workspace-mvp.md` 与 `boncml-brand-shell-cutover.md`

结论：

1. 保留
2. 但应理解为这份总方案的子文档

---

## 14. 给 Claude 的执行说明

如果交给 Claude 开工，建议直接这样要求：

1. 不再把“继续增强 channel 聊天”作为主线
2. 先做 **P0：复用映射确认**
3. 然后做 **P1：BONCML Workspace 壳层与去 multica 化**
4. 开发时优先复用：
   - `ChannelConversation`
   - `WorkspaceRoomPage / WorkspaceShell`
   - issue timeline / execution log
   - squad 组织模型
5. 不允许为了“看起来干净”而重复开发已存在能力
6. 不允许只做页面壳，不落 analysis_task / artifact / audit 数据模型
7. 不允许把 Runtime 结果只写进聊天消息
8. 不允许把 issue/squad 简单改名后当成最终产品实体

更具体地说，Claude 下一步应先输出并落地：

1. issue -> analysis_task 的字段映射
2. squad -> Agent Team 的边界说明
3. analysis_artifact migration/API/UI 空状态
4. analysis_audit_event migration/API/UI 空状态
5. 登录后默认入口切换清单

---

## 15. 最终判断

新的产品化方案不应该再是：

1. 先继续把聊天做得更像 IM
2. 再慢慢补任务和工件

而应该是：

> **最大化复用 multica 已有 workspace / issue / squad / realtime 骨架，在产品上完成 BONCML 语义重组、品牌切换和工件建模，优先打通一个真实可交付的分析闭环。**

复审后进一步收紧为：

> **复用 multica 的协作和工作流底座，但 BONCML Workspace 必须拥有自己的 Analysis Task、Artifact、Audit 和 Runtime 协议。否则它只是一个换皮协作页面，不是可交付的统计分析工作台。**
