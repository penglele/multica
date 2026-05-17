# BONCML Workspace MVP 落地方案

## 1. 文档定位

这份文档是 `channel-chat-upgrade.md` 完成到 **Phase A** 之后的**下一阶段主计划**。

当前判断：

1. `channel-chat-upgrade.md` 已基本完成到可用阶段  
   - Channel 已具备多人协作聊天、Agent 接话、失败重试、未读、分页、重连补消息、统一主体、富文本输入等底座能力。
2. `channel-collaboration-workspace.md` 中的 Inbox / Saved / 全局提及 / 消息链接 / 对象详情面板**仍然有价值**，但不再是下一阶段主线。
3. 下一阶段应从“继续把频道做成更成熟聊天”切换为“把现有频道能力收口为 BONCML Workspace 的协作消息底座，并补 Workspace 产品骨架”。

换句话说：

> 后续主线不再是继续做一个更像主流 IM 的 channel，而是做一个 **BONCML Workspace：面向企业私有化数据分析任务的多 Agent 协作工作台**。

---

## 2. 目标

基于 `DOC/new/BONCML新产品形态讨论材料.md` 和最新 mockup，做出一个可演示、可继续工程化的 **Workspace MVP**：

1. 左侧是 **Workspace / 房间 / 成员 / Agent / 系统状态**
2. 中间不是单一聊天页，而是四个主视图：
   - `CHAT`
   - `TASKS`
   - `ARTIFACTS`
   - `AUDIT`
3. 顶部有分析链路导航，例如：
   - `DATA QUALITY`
   - `ONEWAY ANOVA`
   - `EXEC SUMMARY`
4. 聊天只是入口，真正交付的是结构化工件：
   - `Dataset Manifest`
   - `Analysis Plan`
   - `BONCML Job Spec`
   - `Result Package`
   - `Audit Trail`

---

## 3. 对现有成果的复用原则

必须明确：**不要推翻现有 channel 成果重做。**

现有成果在 Workspace 中的定位：

1. `ChannelConversation`
   - 作为 Workspace 中 `CHAT` 视图的消息底座
2. Channel realtime / unread / pagination / retry / idempotency
   - 继续复用，作为协作流基础能力
3. 自动接话 / 手动接话
   - 作为 Orchestrator / Agent 协作流的一部分保留
4. Channel 现有 header / sidebar / members / agents
   - 只保留能服务 Workspace Shell 的部分

不建议继续作为主线优先做的内容：

1. Inbox / Saved / 全局提及
2. 消息 permalink
3. 对象详情面板
4. 更像 Slack/飞书的深度聊天增强

这些可以后置到 Workspace MVP 之后。

---

## 4. MVP 非目标

本阶段**不要**做：

1. 完整通用聊天平台
2. 完整 local daemon 形态
3. 所有 89 个算法的自然语言封装
4. 完整非结构化文档 ETL
5. 复杂多团队权限体系
6. 完整 BI 看板系统
7. 本体论产品深度接入闭环
8. `channel-collaboration-workspace.md` 中的全部增强项

本阶段要做的是：**把产品骨架立起来，而不是把所有未来能力一次做完。**

---

## 5. MVP 产品骨架

## 5.1 整体信息架构

页面结构按 mockup 落地为：

### 左栏：Workspace Rail

至少包含：

1. 品牌区 / Workspace 名称
2. 房间列表
3. Members 列表
4. Agents 列表
5. System 状态卡

### 中栏：Workspace Main Area

至少包含：

1. 顶部分析链路导航
2. 二级 tab：
   - `CHAT`
   - `TASKS`
   - `ARTIFACTS`
   - `AUDIT`
3. 当前 tab 的主体内容

### 右侧或页内工件区

第一版不强制必须是右固定侧栏，也可以先在 `ARTIFACTS` tab 中承载，但必须保证：

1. 工件不是聊天文本的一部分
2. 工件可单独查看
3. 工件有明确类型和版本

---

## 6. 主页面设计

这一节是给执行模型直接开工用的。结论先说：

> **是的，相关主页面需要新作。**
>
> 现有 `channel` 页面不能直接作为最终 Workspace 主页面，只能作为 `CHAT` 视图的内部主体被复用。

## 6.1 页面层级

建议新增一条新的 Workspace 主页面路线，不要继续把 `ChannelDetailPage` 当最终壳层。

建议页面：

1. `WorkspacePage`
   - 整个分析工作台主页面
2. `WorkspaceRoomPage`
   - 某个分析房间的完整页面
3. `WorkspaceArtifactsPage`（可选）
   - 如果后续需要单独打开工件，也可以拆独立页面

第一版最小实现：

1. 只先做一个 `WorkspaceRoomPage`
2. 在这个页面内包含：
   - 左侧工作台栏
   - 中间主内容区
   - tab 切换
   - `CHAT / TASKS / ARTIFACTS / AUDIT`

## 6.2 主页面线框

建议按下面这个结构落地：

```text
+----------------------------------------------------------------------------------+
| Workspace Top Bar                                                                |
| BONCML / 当前房间标题 / 分析链路(DATA QUALITY > ONEWAY ANOVA > EXEC SUMMARY)     |
+----------------------+-----------------------------------------------------------+
| Left Rail            | Main Area                                                 |
|----------------------|-----------------------------------------------------------|
| Workspace rooms      | Tabs: CHAT | TASKS | ARTIFACTS | AUDIT                    |
| Members              |-----------------------------------------------------------|
| Agents               |                                                           |
| System status        | 当前 tab 主体                                              |
|                      |                                                           |
|                      | CHAT:      复用 ChannelConversation                       |
|                      | TASKS:     状态机 + 阶段卡 + 当前责任 Agent               |
|                      | ARTIFACTS: 数据集/计划/结果/报告                          |
|                      | AUDIT:     状态变更、Agent 调用、用户确认、BONCML 记录     |
+----------------------+-----------------------------------------------------------+
```

如果你要和截图更靠近，第一版可以不做右固定栏，把右侧工件区先合并到 `ARTIFACTS` tab。

## 6.3 左侧栏设计

左侧栏不是普通 sidebar，而是 **Workspace Rail**。

建议拆成 5 个区域：

1. **Brand 区**
   - BONCML Logo
   - Workspace 名称
   - 搜索框（第一版可只做视觉占位）

2. **Rooms 区**
   - 当前房间列表
   - 当前激活房间高亮
   - 至少支持：
     - 数据文件 快速分析
     - 团队协作分析
     - 经营推演（可先做假数据）

3. **Members 区**
   - 当前房间成员
   - 在线状态

4. **Agents 区**
   - Orchestrator
   - Data Agent
   - Method Agent
   - BONCML Runner
   - Report Agent
   - 第二阶段再补 Reviewer / NL2SQL / ETL

5. **System 区**
   - mode
   - queue
   - CPU / MEM
   - runtime version

## 6.4 顶部区域设计

顶部区域应包含两层：

### 第一层：房间标题

至少显示：

1. 当前房间名称
2. 数据集/主题标题
3. 预览按钮

### 第二层：分析链路导航

用于表达当前分析已走到哪一步，建议做成 breadcrumb / step tabs：

1. `DATA QUALITY`
2. `ANALYSIS PLAN`
3. `BONCML RUN`
4. `EXEC SUMMARY`
5. `COMMAND DECK`（可先保留占位）

注意：

1. 这条链路不是聊天消息
2. 它应该来自任务/工件状态，而不是手写文案

## 6.5 中间四个主 tab 设计

### CHAT

直接复用现有：

1. `ChannelConversation`

但需要补一层 Workspace 语义映射：

1. 当前房间 = 当前 channel
2. Agent 输出要逐渐和工件建立跳转关系

### TASKS

建议首版展示：

1. 当前任务总状态
2. 阶段卡
3. 每个阶段的责任 Agent
4. 等待用户确认项
5. 当前运行中的步骤

视觉上应更像“任务流”，不要只是把聊天消息复制一遍。

### ARTIFACTS

建议首版展示 4 类卡片：

1. 数据文件 / Dataset Manifest
2. Analysis Plan
3. BONCML Job Spec
4. Result Package / 导出文件

每张卡片都要能：

1. 打开详情
2. 下载
3. 看版本

### AUDIT

建议首版展示时间线：

1. 用户提出需求
2. 用户确认口径
3. Agent 调用数据/方法/算法
4. BONCML 运行
5. 报告生成

这部分的重点不是 UI 花哨，而是“审计记录是否结构化、可回看”。

## 6.6 第一屏 MVP 设计

第一版不要同时做所有房间类型，先只做截图里的这条主链：

### 房间

`数据文件 快速分析`

### 入口

1. 上传 CSV
2. 输入一句自然语言问题

### 系统主流程

1. Orchestrator 提澄清问题
2. 用户确认口径
3. 系统生成任务拆分卡
4. Data Agent 生成 Dataset Manifest
5. Method Agent / BONCML Runner 执行 `oneway`
6. Report Agent 生成管理层摘要

### 页面展示

1. `CHAT` tab 能看到完整协作流
2. `TASKS` tab 能看到阶段状态
3. `ARTIFACTS` tab 能看到 CSV、manifest、plan、result、docx
4. `AUDIT` tab 能回看关键动作

## 6.7 组件拆分建议

建议新增如下组件：

1. `packages/views/workspace/components/workspace-room-page.tsx`
2. `packages/views/workspace/components/workspace-shell.tsx`
3. `packages/views/workspace/components/workspace-left-rail.tsx`
4. `packages/views/workspace/components/workspace-header.tsx`
5. `packages/views/workspace/components/workspace-tabs.tsx`
6. `packages/views/workspace/components/workspace-task-view.tsx`
7. `packages/views/workspace/components/workspace-artifact-view.tsx`
8. `packages/views/workspace/components/workspace-audit-view.tsx`

现有复用：

1. `packages/views/channels/components/channel-conversation.tsx`
2. `packages/views/channels/components/channel-members-dialog.tsx`（可部分复用）
3. 现有 channel 的 unread / retry / resync / upload / editor 能力

## 6.8 路由建议

建议第一版就和旧 channel 页面区分路由：

1. 旧：
   - `/channels/:id`
2. 新：
   - `/workspace/:workspaceId/rooms/:roomId`

如果短期不想改太多路由，也至少要在页面内部明确：

1. `WorkspaceRoomPage` 是新的顶层
2. `ChannelConversation` 只是其中的一个 tab 内容

## 6.9 Phase W1 的可执行交付标准

只要满足下面这些，就算主页面设计真正落地，而不是停留在概念：

1. 用户进入的是新的 `WorkspaceRoomPage`
2. 页面出现左侧 Workspace Rail
3. 页面顶部出现分析链路导航
4. 页面中部出现 `CHAT / TASKS / ARTIFACTS / AUDIT`
5. `CHAT` tab 内真正复用现有 `ChannelConversation`
6. 切 tab 时不是跳页面，而是同一工作台内切换

---

## 7. 结构化工件模型

第一阶段必须定义并落库/落对象存储的工件类型。

## 6.1 Dataset Manifest

至少包含：

1. 数据集 ID
2. 来源类型（csv / db / file / generated）
3. 行数
4. 字段列表
5. 字段类型
6. 缺失率 / 重复 / 警告
7. 生成时间
8. 访问/权限信息

## 6.2 Analysis Plan

至少包含：

1. 业务问题
2. 分析目标
3. 因变量 / 自变量 / 分组变量
4. 候选方法
5. 选用方法
6. 前提条件
7. 风险提示
8. 是否需要人工确认

## 6.3 BONCML Job Spec

至少包含：

1. jobId
2. algorithm
3. datasetId
4. fieldMapping
5. parameters
6. outputFormats
7. runtime version

## 6.4 Result Package

至少包含：

1. 原始输出
2. 结构化 JSON
3. 图表
4. 摘要文本
5. 导出文件（html / docx / json）

## 6.5 Audit Trail

至少包含：

1. 谁提出需求
2. 谁确认了口径
3. 哪个 Agent 执行了什么
4. 调用了哪个算法/版本
5. 何时生成了什么结果
6. 当前状态流转记录

---

## 7. 任务状态机

MVP 需要一个明确状态机，不允许只靠聊天记录推断任务状态。

建议首版状态：

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

要求：

1. 状态变更必须进入审计记录
2. `TASKS` tab 必须展示当前阶段
3. 关键节点可以回看对应工件

---

## 8. 分阶段实施顺序

## Phase W0：收口现有 Channel 成果

目标：

1. 把 `channel-chat-upgrade.md` 到 Phase A 的结果视为已完成底座
2. 冻结“继续深挖聊天增强”为主线的做法
3. 把 `channel-collaboration-workspace.md` 降为后置增强项

完成标准：

1. Channel 的角色定义改为 `Workspace Chat Stream`
2. 现有功能不回退

## Phase W1：Workspace Shell

目标：

把现有页面壳从“频道页”升级为“分析工作台壳层”。

范围：

1. 左侧 Workspace / 房间 / 成员 / Agent / System 区域
2. 中间主区顶部链路导航
3. `CHAT / TASKS / ARTIFACTS / AUDIT` tab 外壳
4. `CHAT` 先直接复用现有 `ChannelConversation`

完成标准：

1. 页面形态开始对齐 mockup
2. 不再把 channel detail page 视为最终产品页面

## Phase W2：工件模型与后端协议

目标：

把文档里的五类工件正式定义出来。

范围：

1. 数据库表或 JSON schema
2. 工件查询接口
3. 工件写入接口
4. 任务与工件的绑定关系

完成标准：

1. 至少能落 `Dataset Manifest / Analysis Plan / Job Spec / Result Package / Audit Trail`
2. 前后端已有稳定类型

## Phase W3：TASKS 视图

目标：

把“聊天里的阶段卡片”变成真正的任务视图。

范围：

1. 当前任务状态
2. 子任务/阶段列表
3. 责任 Agent
4. 等待确认节点
5. 当前运行节点

完成标准：

1. 用户不看聊天也能知道分析走到哪一步

## Phase W4：ARTIFACTS 视图

目标：

把结果文件、数据清单、分析计划、BONCML 输出从聊天里抽离出来。

范围：

1. 数据文件卡
2. Dataset Manifest
3. Analysis Plan
4. Result Package
5. 报告导出入口

完成标准：

1. 工件能独立浏览
2. 结构化结果不再只藏在消息流里

## Phase W5：AUDIT 视图

目标：

把“可审计”从口号变成可见功能。

范围：

1. 状态变更记录
2. Agent 调用记录
3. 用户确认记录
4. BONCML 运行记录
5. 版本信息

完成标准：

1. 用户能回看分析过程
2. 售前可演示“可追溯”

## Phase W6：CSV 分析 MVP 闭环

目标：

先打通一个最小但完整的 BONCML Workspace 演示场景。

建议场景：

1. 上传 CSV
2. 生成 Dataset Manifest
3. Orchestrator 追问关键口径
4. 生成 Analysis Plan
5. 调用 BONCML `oneway`
6. 生成 Result Package
7. 输出管理层摘要
8. 全链路写入 Audit Trail

完成标准：

1. 和截图中的“数据文件 快速分析”场景一致
2. 能在单一房间里完整演示

---

## 10. 代码落点建议

## 9.1 前端

建议新增：

1. `packages/views/workspace/components/workspace-shell.tsx`
2. `packages/views/workspace/components/workspace-left-rail.tsx`
3. `packages/views/workspace/components/workspace-main-tabs.tsx`
4. `packages/views/workspace/components/task-view.tsx`
5. `packages/views/workspace/components/artifact-view.tsx`
6. `packages/views/workspace/components/audit-view.tsx`

现有复用：

1. `packages/views/channels/components/channel-conversation.tsx`
2. 现有 realtime / unread / retry / pagination 能力

## 9.2 后端

建议新增：

1. `workspace_task`
2. `workspace_artifact`
3. `workspace_audit_event`
4. `dataset_manifest`
5. `analysis_plan`
6. `boncml_job_spec`
7. `result_package`

如果不想拆太多表，至少要先明确 schema 和绑定关系。

---

## 11. 与现有两个 plan 的关系

## 10.1 channel-chat-upgrade.md

状态：

1. 视为已完成到 **Phase A**
2. 不再作为主线继续向“成熟聊天增强”推进

仍然有价值的部分：

1. 统一消息主体
2. 输入区能力
3. 自动/手动接话协议
4. 发送/失败/重试
5. 未读/分页/重连

## 10.2 channel-collaboration-workspace.md

状态：

1. 保留
2. 延后

适合放到 Workspace MVP 之后再做的能力：

1. Inbox
2. Saved
3. 全局提及
4. 消息链接
5. 对象详情面板

原因：

1. 它们是聊天管理增强，不是当前产品骨架
2. 当前最重要的是 Tasks / Artifacts / Audit / 工件模型

---

## 12. Claude 执行说明

开始这份计划前，先确认：

1. `channel-chat-upgrade.md` 的 B0~A 已完成
2. 现有 `ChannelConversation` 已稳定
3. 不再把“继续像 IM 一样补功能”作为主线

执行原则：

1. **聊天是入口，不是产品中心**
2. **先做任务/工件/审计骨架，再做聊天增强项**
3. **优先复用现有 channel 底座，不要推倒重来**
4. **工件必须结构化，不允许只留聊天文本**
5. **任务必须有状态机，不允许靠消息顺序隐式推断**

---

## 13. 推荐立即开工顺序

如果要立刻让 Claude 开工，建议严格按下面顺序：

1. **W1：Workspace Shell**
2. **W2：工件模型与后端协议**
3. **W3：TASKS 视图**
4. **W4：ARTIFACTS 视图**
5. **W5：AUDIT 视图**
6. **W6：CSV 分析 MVP 闭环**

---

## 14. 最终判断

下一阶段不应继续围绕“怎么把频道做得更像聊天产品”来展开。

下一阶段真正要做的是：

> **把现有 channel 成果降级为 Workspace 的协作消息底座，再围绕 Tasks / Artifacts / Audit / 工件模型，把 BONCML Workspace 的产品骨架搭起来。**
