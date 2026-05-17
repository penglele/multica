# Channel 聊天升级落地方案

## 1. 目标

把 `channel` 从“简化频道聊天”升级为“多人版主聊天”：

1. **功能对齐主聊天**
   - 输入区支持富文本、附件、拖拽/粘贴上传、发送/停止、草稿、目标选择
   - 消息区支持回复耗时、复制、失败态、处理中过程、附件展示
   - 顶部栏支持在线状态、放大/收起、频道设置
2. **补齐成熟聊天体验**
   - 发送中 / 已发送 / 失败 / 重试
   - 已读 / 未读 / 未读定位
   - 断线重连后补消息
   - 正在输入 / 正在处理中
   - 历史消息分页加载
3. **把“自动接话 / 手动接话”改成稳定可理解模型**
   - 不再只依赖消息正文里的名字匹配
   - 每条消息明确记录“是否触发机器人、触发谁、由谁决定”

---

## 2. 现状判断

### 2.1 当前 channel 已有能力

1. 频道、成员、消息、线程回复、已读状态已有独立数据表
2. 人发消息后会写入频道消息，并尝试触发机器人任务
3. 机器人任务完成后会再写回一条频道消息
4. 已有实时推送，频道内新消息可以实时出现
5. 已有自动接话开关 `auto_reply`

### 2.2 当前主要缺口

1. **UI 不统一**
   - `ChannelPanel`
   - `ChannelDetailPage`
   - 两套页面逻辑不同，功能不齐
2. **输入区能力弱**
   - 还不是主聊天同款输入框
   - 附件、停止、草稿、上下文挂载等能力缺失
3. **消息展示能力弱**
   - 没有主聊天那套复制、耗时、失败态、处理中过程
4. **接话机制脆弱**
   - 手动接话仍高度依赖消息文本解析
   - 用户难以理解“一条消息到底会不会触发、触发谁”
5. **成熟聊天体验不足**
   - 发送失败和重试不完整
   - 已读/未读前端不完整
   - 缺少正在输入
   - 缺少历史分页和断线恢复策略

---

## 3. 产品形态建议

### 3.1 统一消息类型

频道中把发送动作统一成三类：

1. **普通消息**
   - 只发给频道成员看
   - 不触发机器人
2. **手动接话消息**
   - 由用户明确指定本条要交给哪个机器人/小队
3. **自动接话消息**
   - 频道开启自动接话后，由频道规则自动决定目标

### 3.2 用户可见规则

每条消息发送前，用户必须能清楚看到当前模式：

1. 本条只聊天
2. 本条交给：某个机器人
3. 本条交给：某个小队
4. 本频道自动接话中

### 3.3 UI 目标

#### 顶部栏

1. 频道名
2. 成员在线状态概览
3. 自动/手动接话控制
4. 成员管理入口
5. 放大 / 收起 / 最小化

#### 消息区

1. 普通消息气泡
2. 机器人回复
3. 回复耗时
4. 复制
5. 附件预览
6. 处理中过程
7. 失败提示
8. 线程回复
9. 时间分隔线
10. 未读分隔线

#### 输入区

1. 富文本输入
2. 附件上传
3. 拖拽/粘贴上传
4. 发送 / 停止
5. 目标选择器
6. 草稿保存
7. 可选上下文挂载

---

## 4. 总体技术方案

核心原则：**不要继续维护两套聊天实现，抽一层通用聊天能力，主聊天和频道共用。**

### 4.1 抽象层次

#### A. 通用输入层

复用或抽出主聊天输入能力，形成可复用组件：

1. `ConversationInput`
   - 富文本编辑
   - 上传
   - 草稿
   - 发送 / 停止
2. `ConversationTargetPicker`
   - 当前对谁发
   - 可选机器人 / 小队 / 仅聊天
3. `ConversationAttachmentTray`
   - 显示待发送或已挂载附件

#### B. 通用消息展示层

抽出统一组件：

1. `ConversationMessageList`
2. `UserMessageBubble`
3. `AssistantMessageBubble`
4. `MessageFooter`
   - 回复耗时
   - 复制
   - 状态
5. `LiveRunTimeline`
6. `FailureBubble`
7. `UnreadDivider`
8. `DateDivider`

#### C. 场景层

1. `ChatWindow`：一对一聊天
2. `ChannelWindow`：多人频道聊天

两者共用输入层和展示层，只在以下方面区分：

1. 顶部栏
2. 目标来源
3. 触发规则
4. 成员/权限
5. 已读统计维度

---

## 5. 数据结构改造

### 5.1 保留现有表

继续保留：

1. `channel`
2. `channel_member`
3. `channel_message`
4. `channel_read_state`

### 5.2 新增建议字段

#### `channel_message`

建议增加：

1. `client_message_id TEXT`
   - 前端生成
   - 用于断线重发去重
2. `delivery_status TEXT`
   - `sending`
   - `sent`
   - `failed`
3. `trigger_mode TEXT`
   - `none`
   - `manual`
   - `auto`
4. `target_kind TEXT`
   - `agent`
   - `squad`
   - `none`
5. `target_id UUID`
   - 本条主要目标
6. `reply_to_message_id UUID`
   - 如后续希望支持更清晰的消息回复关系，可和当前 thread 字段分工
7. `edited_at TIMESTAMPTZ`
   - 为后续编辑做准备

#### 新表：`channel_message_target`

用于表示一条消息实际触发了哪些对象：

1. `channel_message_id`
2. `target_kind`
3. `target_id`
4. `source`
   - `manual`
   - `auto`
5. `status`
   - `queued`
   - `running`
   - `completed`
   - `failed`
   - `cancelled`

这样可以支持：

1. 一条消息触发多个机器人
2. 精确展示每个目标的处理状态
3. 避免正文解析与真实触发结果不一致

#### 已读增强

保留 `channel_read_state.last_read_seq`，但前端必须真正消费：

1. 侧栏未读数
2. 页面未读分隔线
3. 首条未读定位

#### 输入状态

新增临时状态表或内存广播即可，不必先落库：

1. `channel:typing`
2. 内容包括：
   - 频道 id
   - 用户 id
   - 开始/停止
   - 时间戳

---

## 6. 接话机制重构

### 6.1 当前问题

当前手动接话大量依赖正文里的 `@名字`。

问题：

1. 名字匹配脆弱
2. 同名风险
3. 改名后历史行为不稳定
4. 用户不容易知道“本条是否真的交给了某人”

### 6.2 目标机制

发送消息时，前端提交结构化字段：

1. `content`
2. `thread_parent_id`
3. `client_message_id`
4. `trigger_mode`
5. `targets`
   - 目标列表，元素包含 `kind + id`
6. `attachment_ids`

后端逻辑：

1. 先写消息
2. 再根据 `trigger_mode + targets + channel 默认规则`
   生成实际目标
3. 把实际目标写入 `channel_message_target`
4. 再入处理队列

### 6.3 规则

#### 手动接话

1. 前端显式传 `trigger_mode=manual`
2. 如果用户选了 1 个机器人，只触发它
3. 如果用户选了 1 个小队，走小队分发
4. 如果正文里带 `@`，只作为显示和快速输入辅助手段，不再作为唯一真相

#### 自动接话

频道增加默认规则配置：

1. `auto_reply_enabled`
2. `auto_reply_strategy`
   - `all_agents`
   - `default_agent`
   - `default_squad`
3. `default_target_id`

自动接话时：

1. 若策略是全部机器人，则全部入队
2. 若策略是默认机器人或默认小队，只触发默认目标
3. 如果本条用户手动指定目标，则本条以手动为准

#### 普通消息

1. `trigger_mode=none`
2. 不创建任何处理目标

---

## 7. 实时机制方案

### 7.1 保留当前长连接方案

继续使用当前实时长连接。

### 7.2 新增/规范事件

#### 消息相关

1. `channel:message_created`
2. `channel:message_updated`
3. `channel:message_deleted`
4. `channel:message_failed`

#### 状态相关

1. `channel:typing`
2. `channel:read_updated`
3. `channel:presence_updated`

#### 目标处理相关

1. `channel:target_queued`
2. `channel:target_started`
3. `channel:target_progress`
4. `channel:target_completed`
5. `channel:target_failed`
6. `channel:target_cancelled`

### 7.3 前端策略

1. 当前频道打开时订阅频道消息
2. 进入频道时拉一次最新快照
3. 重连后按最后已知序号补拉缺失消息
4. 同一条消息用 `id/client_message_id` 去重

---

## 8. 前端落地方案

### 8.1 统一页面实现

#### 目标

把 `ChannelPanel` 和 `ChannelDetailPage` 统一成：

1. 一个公共主体组件 `ChannelConversation`
2. 两个壳子：
   - `ChannelDrawerShell`
   - `ChannelPageShell`

#### 公共主体职责

1. 频道头部核心信息
2. 消息列表
3. 输入框
4. 线程侧栏
5. 未读处理
6. 实时订阅

### 8.2 输入区

#### 第一期直接复用主聊天输入能力

将 `ChatInput` 改造为可场景复用：

1. 支持传入不同 placeholder
2. 支持是否显示 agent picker
3. 支持传入 channel target picker
4. 支持附件上传回调
5. 支持停止当前处理

#### Channel 输入特有内容

1. 左下角目标选择器
   - 仅聊天
   - 指定机器人
   - 指定小队
   - 跟随频道默认自动接话
2. 顶部附件展示区
3. 输入中提示

### 8.3 消息区

复用主聊天消息区能力：

1. 复制按钮
2. 回复耗时
3. 失败态
4. 处理中时间线
5. Markdown 渲染
6. 附件显示

频道特有显示：

1. 发送者头像和名字
2. 目标标识
   - 本条交给谁
3. 多目标状态汇总
   - 例如：2 个机器人处理中，1 个完成

### 8.4 顶部栏

补齐：

1. 频道名称
2. 成员数
3. 在线状态点
4. 自动接话开关
5. 自动接话目标设置
6. 放大 / 收起 / 最小化
7. 成员管理

### 8.5 未读能力

1. 频道列表显示未读数
2. 打开频道时自动更新已读
3. 插入未读分隔线
4. 支持跳转到第一条未读

### 8.6 发送失败与重试

前端发送流程：

1. 先本地插入“发送中”消息
2. 接口成功后替换为正式消息
3. 接口失败则消息标记为失败
4. 用户可点击重试

---

## 9. 后端落地方案

### 9.1 发送接口升级

将发送接口升级为支持结构化目标：

#### 请求体

1. `content`
2. `thread_parent_id`
3. `client_message_id`
4. `trigger_mode`
5. `targets`
6. `attachment_ids`

#### 返回体

1. 消息基础信息
2. 当前状态
3. 目标列表
4. 附件列表

### 9.2 机器人任务创建逻辑

把现有 `triggerChannelAgents` 改造成两层：

1. `resolveChannelTargets`
   - 负责决定实际目标
2. `enqueueChannelTargets`
   - 负责真正入处理队列

这样便于：

1. 单测覆盖规则
2. 展示触发结果
3. 将来支持更复杂的频道规则

### 9.3 附件能力

复用主聊天附件体系：

1. 上传时先绑定到频道消息草稿或临时发送上下文
2. 发送成功后再正式挂到消息
3. 机器人读取附件时通过统一下载方式获取

### 9.4 已读接口

保留现有已读接口，但需要：

1. 增加未读查询能力
2. 支持按序号增量拉取

建议新增：

1. `GET /api/channels/{channelId}/messages?after_seq=x`
2. `GET /api/channels/{channelId}/unread`

### 9.5 历史分页

现有消息列表要改成支持分页：

1. 初次加载最近一页
2. 向上滚动加载更早一页
3. 线程回复同样分页或至少保留扩展能力

---

## 10. 主流聊天体验补齐项

### 10.1 必做

1. **发送状态**
   - sending
   - sent
   - failed
   - retry
2. **未读**
   - 列表未读数
   - 未读分隔线
   - 进入即清
3. **断线恢复**
   - 显示离线提示
   - 重连后补消息
4. **历史分页**
   - 避免大频道一次拉全量
5. **附件**
   - 上传
   - 下载
   - 预览
6. **处理中状态**
   - 机器人正在处理
   - 处理中过程
7. **失败态**
   - 明确显示失败原因
   - 重试入口

### 10.2 第二优先级

1. 正在输入
2. 消息编辑
3. 消息撤回
4. 消息操作菜单
5. 表情回应
6. 更多已读明细

---

## 11. 实施分期

> **执行顺序已调整：本节以当前版本为准。**
>
> 正确顺序：
>
> 1. **B0：最小可见反馈**
> 2. **B1：结构化发送协议**
> 3. **B2：目标解析与入队重构**
> 4. **C1：发送失败 / 重试 / 处理中**
> 5. **C2：未读 / 分页 / 断线恢复**
> 6. **A：最后再做 UI 统一与共享层抽取**

### Phase B0：最小可见反馈

#### 目标

先消灭“消息进黑洞”的体验，让用户发完消息后马上知道：

1. 这条消息是否触发了机器人
2. 触发了谁
3. 当前处于排队、处理中、失败还是完成

#### 范围

1. 后端返回最基础的目标结果
2. 前端在消息卡片下方增加状态小字
3. 先不等待大 UI 重构

#### 产出

1. 用户不再面对“发了消息但完全没反应”
2. 当前主要问题可被定位

### Phase B1：结构化发送协议

#### 目标

把“本条消息要不要触发机器人、触发谁”改成结构化协议。

#### 范围

1. 发送接口支持 `trigger_mode`
2. 发送接口支持 `targets`
3. 增加 `client_message_id`
4. 频道默认接话策略字段落库

#### 产出

1. 结构化目标成为主路径
2. 旧正文 `@mention` 只保留兜底作用

### Phase B2：目标解析与入队重构

#### 目标

把当前杂糅的接话逻辑拆清楚，稳定自动接话与手动接话。

#### 范围

1. 解析目标
2. 入队目标
3. 自动接话策略
4. 兼容期 mention 兜底

#### 产出

1. 用户清楚知道本条交给谁
2. 自动接话与手动接话不再互相污染

### Phase C1：发送失败 / 重试 / 处理中

#### 目标

把消息发送状态和机器人处理状态真正做出来。

#### 范围

1. sending / sent / failed
2. retry
3. queued / running / completed / failed / cancelled
4. 失败原因展示

#### 产出

1. “有没有在处理”变成可见状态
2. “为什么没回”变成可见错误

### Phase C2：未读 / 分页 / 断线恢复

#### 目标

补齐成熟聊天必备能力。

#### 范围

1. 未读数
2. 未读分隔线
3. 首条未读定位
4. 历史分页
5. 重连补消息

#### 产出

1. 频道达到稳定聊天体验

### Phase A：UI 统一与共享层抽取

#### 目标

在协议与状态稳定后，再做 UI 收敛，避免过早抽象影响主聊天。

#### 范围

1. 统一 `ChannelPanel` / `ChannelDetailPage`
2. 抽共享消息展示层
3. 审慎抽共享输入层
4. 顶部栏、底部栏、消息区风格对齐

#### 产出

1. 两个频道入口行为一致
2. 有选择地抽共享层，不强推一步到位

### Phase D：增强能力

#### 范围

1. 编辑 / 撤回
2. 表情回应
3. 更细的成员在线展示
4. 更丰富的通知策略

---

## 12. 测试方案

### 12.1 前端

1. 输入区
   - 上传
   - 拖拽
   - 粘贴
   - 草稿恢复
2. 发送状态
   - 成功
   - 失败
   - 重试
3. 接话目标
   - 仅聊天
   - 手动指定
   - 自动接话
4. 未读与分页
5. 断线重连补消息

### 12.2 后端

1. 目标解析
2. 自动接话策略
3. 多目标入队
4. 已读推进
5. 增量拉取
6. 附件绑定

### 12.3 端到端

至少覆盖：

1. 人发普通消息
2. 人手动指定机器人
3. 频道自动接话
4. 多机器人同时处理
5. 附件消息
6. 断网后恢复
7. 未读数正确变化

---

## 13. 风险与控制

### 13.1 风险

1. 主聊天和频道强行复用后，场景差异导致组件参数过重
2. 多目标处理会让消息状态复杂化
3. 分页和实时推送叠加，容易出现重复或乱序
4. 旧消息数据没有新字段，兼容成本高

### 13.2 控制手段

1. 通用层只抽真正共性的输入/展示能力，不强抽页面壳子
2. 用 `client_message_id + seq + id` 三层去重
3. 所有新字段提供安全默认值
4. 旧消息在前端做兼容渲染

---

## 14. 推荐开发顺序

最推荐的顺序：

1. **B0：最小可见反馈**
2. **B1：结构化发送协议**
3. **B2：目标解析与入队重构**
4. **C1：发送失败、重试、处理中**
5. **C2：未读、分页、断线恢复**
6. **A：最后做 UI 统一与共享层抽取**
7. **D：增强能力**

---

## 15. 最终验收标准

满足以下条件才算完成：

1. 频道输入体验与主聊天一致
2. 频道消息展示能力与主聊天一致
3. 手动接话不再依赖脆弱名字匹配
4. 自动接话规则清楚、可配置、可追踪
5. 用户能看到发送状态、回复状态、失败原因
6. 附件可上传、可预览、可下载
7. 未读、已读、断线恢复、分页都可正常工作
8. 侧栏版和详情页版使用同一套聊天主体，不再分叉

---

## 16. 建议先做的第一批任务

如果按“最短路径拿到明显提升”，建议首批只做下面 8 项：

1. 在频道消息卡片下方增加状态小字
2. 后端返回基础 `targets[{ kind, id, name, status }]`
3. 为发送接口增加结构化 `trigger_mode + targets + client_message_id`
4. 为 `channel` 表增加默认接话策略字段
5. 重写目标解析与入队逻辑
6. 增加发送失败和重试
7. 增加处理中状态展示
8. 增加未读分隔线和未读数

做完这 8 项后，频道会先从“消息进黑洞”进入“状态可见、可定位、可继续修复”的状态。

---

## 17. 给 Claude 的执行说明

本节是给执行模型直接开工用的，优先级高于上文的概念性表述。

### 17.1 任务目标

在不破坏现有一对一聊天的前提下，把 `channel` 升级为“多人版主聊天”：

1. **复用主聊天输入和消息展示能力**
2. **统一 `ChannelPanel` 与 `ChannelDetailPage`**
3. **把接话逻辑改成结构化目标，不再只靠正文解析**
4. **补齐发送状态、未读、附件、处理中过程、失败态**

### 17.2 非目标

本轮不要做：

1. 全量消息编辑
2. 全量消息撤回
3. 表情回应
4. 完整的 Slack 级权限系统
5. 完整的消息搜索

如果执行过程中想顺手做上述内容，应停止扩展，先完成本文要求范围。

### 17.3 执行原则

1. **先解决“消息进黑洞”，再做大重构**
2. **协议与状态优先于 UI 收敛**
3. **不要第一步强抽 `ChatInput`；先让 channel 自己具备完整能力**
4. **共享层要晚做、慎做，避免把主聊天带坏**
5. **所有新接口都必须兼容旧数据与旧调用**
6. **正文里的 `@name` 可以保留为输入辅助手段，但不能再作为唯一触发真相**
7. **有结构化 `targets` 时，只认结构化；没有时，才走旧 `@mention` 兜底**

---

## 18. 当前代码地图

以下文件是本次实施的关键入口，Claude 应优先阅读。

### 18.1 主聊天

#### 页面与交互

1. `packages/views/chat/components/chat-window.tsx`
2. `packages/views/chat/components/chat-input.tsx`
3. `packages/views/chat/components/chat-message-list.tsx`
4. `packages/views/chat/components/task-status-pill.tsx`
5. `packages/views/chat/components/context-anchor.tsx`
6. `packages/views/chat/components/offline-banner.tsx`
7. `packages/views/chat/components/no-agent-banner.tsx`

#### core 层

1. `packages/core/chat/queries.ts`
2. `packages/core/chat/mutations.ts`
3. `packages/core/chat/store.ts`
4. `packages/core/realtime/use-realtime-sync.ts`

#### 后端

1. `server/internal/handler/chat.go`
2. `server/internal/service/task.go`

### 18.2 channel

#### 页面与交互

1. `packages/views/channels/components/channel-panel.tsx`
2. `packages/views/channels/components/channel-detail-page.tsx`
3. `packages/views/channels/components/channel-members-dialog.tsx`
4. `packages/views/channels/components/message-input.tsx`
5. `packages/views/channels/components/message-list.tsx`

#### core 层

1. `packages/core/channels/queries.ts`
2. `packages/core/channels/mutations.ts`
3. `packages/core/channels/types.ts`
4. `packages/core/channels/store.ts`
5. `packages/core/realtime/use-realtime-sync.ts`

#### 后端

1. `server/internal/handler/channel.go`
2. `server/pkg/db/queries/channel.sql`
3. `server/migrations/091_channel_chat.up.sql`
4. `server/cmd/server/router.go`
5. `server/internal/service/task.go`

### 18.3 复用依赖

1. `packages/views/editor/*`
2. `packages/core/hooks/use-file-upload.ts`
3. `packages/views/common/markdown.tsx`
4. `packages/views/common/actor-avatar.tsx`
5. `packages/core/workspace/queries.ts`

---

## 19. 最终文件结构目标

本节描述**最终理想结构**，不是第一阶段必须完成的内容。

### 19.1 前端 UI

建议新增或重构为：

1. `packages/views/conversation/components/conversation-input.tsx`
2. `packages/views/conversation/components/conversation-message-list.tsx`
3. `packages/views/conversation/components/conversation-message-footer.tsx`
4. `packages/views/conversation/components/live-run-timeline.tsx`
5. `packages/views/channels/components/channel-conversation.tsx`
6. `packages/views/channels/components/channel-header.tsx`
7. `packages/views/channels/components/channel-target-picker.tsx`

如果不新建 `packages/views/conversation/`，也允许先放在 `packages/views/chat/components/shared/`，但必须保证：

1. 不是复制 `chat-input.tsx` 一份改名
2. 不是复制 `chat-message-list.tsx` 一份改名
3. 主聊天和频道都用同一实现

> **注意：不要在 B0/B1 阶段为了追求目录漂亮而硬抽共享输入层。**
>
> 第一阶段允许：
>
> 1. channel 先实现自己的完整 conversation 组件
> 2. 优先复用底层编辑器、上传、Markdown、状态组件
> 3. 等协议与状态稳定后，再决定哪些 UI 组件值得抽共享层

### 19.2 core 层

建议新增：

1. `packages/core/channels/message-status.ts`
2. `packages/core/channels/normalizers.ts`

### 19.3 后端

建议新增：

1. `server/internal/service/channel_targets.go`
2. `server/internal/handler/channel_types.go`

如果不拆新文件，也必须至少把 `channel.go` 中：

1. 目标解析
2. 入队逻辑
3. 响应格式组装

拆成独立函数，避免继续堆在一个 handler 文件里。

---

## 20. 分阶段执行任务单

以下任务按顺序执行。Claude 不应跳阶段并行大改。

### Phase B0：最小可见反馈

#### B0.1 为消息增加状态小字

**目标**

在不重做整体 UI 的前提下，先把消息状态可见化。

**改动文件**

1. `packages/views/channels/components/channel-detail-page.tsx`
2. `packages/views/channels/components/channel-panel.tsx`
3. `packages/views/channels/components/message-list.tsx`

**要求**

1. 状态显示在**消息卡片下方一行小字**
2. 不用只放右侧图标
3. 推荐文案：
   - `已交给 @千问 · 排队中`
   - `已交给 @千问 · 处理中`
   - `已交给 @千问 · 失败`
   - `未触发机器人`

**完成标准**

1. 用户发出 `@千问 你好` 后，即使没有回复，也能看到状态

#### B0.2 后端返回基础目标结果

**目标**

为前端提供最小可见状态所需的数据。

**改动文件**

1. `server/internal/handler/channel.go`
2. `packages/core/channels/types.ts`
3. `packages/core/api/client.ts`

**响应最低要求**

```json
{
  "targets": [
    {
      "kind": "agent",
      "id": "uuid",
      "name": "千问",
      "status": "queued"
    }
  ]
}
```

**要求**

1. 前端直接用 `name` 渲染
2. `status` 最低支持：
   - `queued`
   - `running`
   - `completed`
   - `failed`
   - `cancelled`

**完成标准**

1. 前端不需要再额外查 agent 列表才能显示结果

### Phase B1：结构化发送协议

#### B1.1 扩展 channel 表默认接话策略

**目标**

把频道默认接话策略显式化。

**改动文件**

1. 新 migration
2. `server/pkg/db/queries/channel.sql`
3. `packages/core/channels/types.ts`

**新增字段**

1. `auto_reply_strategy`
2. `default_target_id`
3. `default_target_kind`

**要求**

1. `default_target_kind` 必须一起加，不能只有 id
2. 新字段要提供安全默认值

#### B1.2 升级发送接口协议

**目标**

让频道发消息支持结构化目标。

**改动文件**

1. `server/internal/handler/channel.go`
2. `packages/core/api/client.ts`
3. `packages/core/channels/mutations.ts`
4. `packages/core/channels/types.ts`

**协议要求**

1. `trigger_mode` 固定为：
   - `none`
   - `manual`
   - `auto`
2. 请求体支持：
   - `content`
   - `thread_parent_id`
   - `client_message_id`
   - `trigger_mode`
   - `targets`
   - `attachment_ids`

**兼容要求**

1. 有结构化 `targets` 时，只认结构化
2. 没有结构化 `targets` 时，才走旧 `@mention` 兜底

### Phase B2：目标解析与入队重构

#### B2.1 拆分目标解析与入队

**目标**

把当前混在一起的触发逻辑拆清楚。

**改动文件**

1. `server/internal/handler/channel.go`
2. 建议新增 `server/internal/service/channel_targets.go`

**要求**

拆成至少三个函数：

1. `resolveChannelTargets`
2. `enqueueChannelTargets`
3. `fallbackParseMentionTargets`

**完成标准**

1. manual / auto / none 三种模式行为清晰
2. 兼容 mention 只在兜底路径出现

### Phase C1：发送失败 / 重试 / 处理中

#### C1.1 发送状态

**目标**

让用户看见 sending / sent / failed。

**改动文件**

1. `packages/core/channels/mutations.ts`
2. `packages/views/channels/components/*`

**要求**

1. 本地先插入 sending
2. 成功变 sent
3. 失败变 failed
4. 提供 retry

#### C1.2 处理中状态

**目标**

让用户知道机器人当前是否在工作。

**改动文件**

1. `packages/core/realtime/use-realtime-sync.ts`
2. `packages/views/channels/components/*`
3. channel 相关后端事件

**要求**

1. 显示 queued / running / completed / failed / cancelled
2. 优先用消息下方状态小字实现
3. 完整时间线可后续增强

### Phase C2：未读 / 分页 / 断线恢复

#### C2.1 未读与已读

**目标**

补齐基础未读能力。

#### C2.2 历史分页

**目标**

避免一次拉全量消息。

#### C2.3 断线恢复

**目标**

重连后补齐缺失消息，并去重。

### Phase A：UI 统一与共享层抽取

#### A1. 抽公共消息列表能力

**目标**

把主聊天消息展示里可复用的内容抽出来，供 chat 与 channel 共用。

**改动文件**

1. `packages/views/chat/components/chat-message-list.tsx`
2. 新增共享组件目录
3. `packages/views/channels/components/message-list.tsx`
4. `packages/views/channels/components/channel-detail-page.tsx`
5. `packages/views/channels/components/channel-panel.tsx`

**要求**

1. 共享以下能力：
   - Markdown 渲染
   - 回复耗时
   - 复制
   - 失败态
   - 处理中时间线
2. channel 消息保留发送者头像和显示名
3. 主聊天原有行为不能回退

**完成标准**

1. 主聊天与频道都能显示复制按钮
2. 主聊天与频道都能显示耗时
3. 主聊天与频道都能显示失败态

#### A2. 审慎评估是否抽公共输入能力

**目标**

在协议与状态稳定后，再决定是否抽 `ChatInput`。

**改动文件**

1. `packages/views/chat/components/chat-input.tsx`
2. `packages/views/channels/components/*`
3. `packages/views/editor/*`

**要求**

1. 频道输入区必须具备主聊天同等级能力：
   - 富文本
   - 文件上传
   - 拖拽上传
   - 粘贴上传
   - 草稿
   - 发送按钮
   - 停止按钮占位接口
2. **但不要求第一阶段就与主聊天共用同一个输入组件**
3. 可以先让 channel 拥有自己的完整 conversation 输入
4. 等两边稳定后再决定是否抽共享层

**完成标准**

1. channel 支持图片/文件上传
2. channel 支持草稿保留
3. channel 输入区能力达到主聊天同级

#### A3. 统一频道主体组件

**目标**

收敛 `ChannelPanel` 与 `ChannelDetailPage`。

**改动文件**

1. `packages/views/channels/components/channel-panel.tsx`
2. `packages/views/channels/components/channel-detail-page.tsx`
3. 新增 `packages/views/channels/components/channel-conversation.tsx`

**要求**

1. 两个页面共享一套主体
2. 差异只保留在壳层
3. 线程侧栏逻辑也集中

**完成标准**

1. 两个页面行为一致
2. 修一个地方，两个入口都生效

### Phase B：结构化接话协议

#### B1. 设计并落库新字段

**目标**

为频道消息补齐结构化接话信息。

**改动文件**

1. 新 migration
2. `server/pkg/db/queries/channel.sql`
3. sqlc 生成代码
4. `packages/core/channels/types.ts`

**最低字段要求**

1. `client_message_id`
2. `delivery_status`
3. `trigger_mode`
4. `target_kind`
5. `target_id`

**可选但推荐**

6. `edited_at`
7. 新表 `channel_message_target`

**完成标准**

1. 后端能返回结构化触发信息
2. 前端类型完整更新

#### B2. 改造发送接口

**目标**

让频道发消息支持结构化目标。

**改动文件**

1. `server/internal/handler/channel.go`
2. `server/cmd/server/router.go`
3. `packages/core/api/client.ts`
4. `packages/core/channels/mutations.ts`
5. `packages/core/channels/types.ts`

**请求体目标**

```json
{
  "content": "请看一下这个问题",
  "thread_parent_id": "optional",
  "client_message_id": "local-uuid",
  "trigger_mode": "none | manual | auto",
  "targets": [
    { "kind": "agent", "id": "uuid" }
  ],
  "attachment_ids": ["att-1", "att-2"]
}
```

**要求**

1. 兼容旧调用：旧前端不传时仍可工作
2. 若未传结构化目标，后端才走兼容解析路径
3. 兼容解析路径仅作过渡，不是最终主路径

**完成标准**

1. 新前端可以显式指定本条目标
2. 旧前端仍能发送消息

#### B3. 重写目标解析与入队

**目标**

把 `triggerChannelAgents` 拆成“解析目标”和“入队目标”两步。

**改动文件**

1. `server/internal/handler/channel.go`
2. 建议新增 `server/internal/service/channel_targets.go`

**要求**

拆成以下函数：

1. `resolveChannelTargets(...)`
2. `enqueueChannelTargets(...)`
3. `fallbackParseMentionTargets(...)`

**行为要求**

1. `manual` 优先级最高
2. `auto` 走频道默认策略
3. `none` 不触发
4. 兼容正文 `@name` 仅在未提供结构化目标时触发

**完成标准**

1. 单元测试覆盖 3 种模式
2. 不再把正文解析写死在主流程中

### Phase C：成熟聊天状态

#### C1. 发送状态与失败重试

**改动文件**

1. `packages/core/channels/mutations.ts`
2. `packages/views/channels/components/channel-conversation.tsx`
3. `packages/core/channels/types.ts`

**要求**

1. 本地先插入 sending 状态
2. 成功后变 sent
3. 失败后变 failed
4. 支持点击重试

**完成标准**

1. 断网时可见失败消息
2. 恢复网络后可重试发送

#### C2. 未读与已读

**改动文件**

1. `packages/core/channels/queries.ts`
2. `packages/core/channels/mutations.ts`
3. `packages/core/realtime/use-realtime-sync.ts`
4. `packages/views/channels/components/channel-conversation.tsx`
5. 可能新增后端 unread 接口

**要求**

1. 频道列表显示未读数
2. 打开频道自动标记已读
3. 插入未读分隔线
4. 支持首条未读定位

**完成标准**

1. 多设备情况下未读数能同步

#### C3. 历史分页

**改动文件**

1. `server/internal/handler/channel.go`
2. `server/pkg/db/queries/channel.sql`
3. `packages/core/channels/queries.ts`
4. `packages/views/channels/components/channel-conversation.tsx`

**要求**

1. 初次只拉最近一页
2. 向上加载更早消息
3. 避免重复插入

**完成标准**

1. 大频道加载不再一次取全量

#### C4. 输入中与处理中

**改动文件**

1. `packages/core/realtime/use-realtime-sync.ts`
2. `packages/views/channels/components/channel-conversation.tsx`
3. 后端 channel 事件

**要求**

1. 人输入时显示 typing
2. 机器人处理中显示运行中状态
3. 优先复用主聊天 TaskStatusPill / timeline 能力

### Phase D：附件能力完整接入

#### D1. 频道附件上传

**改动文件**

1. `packages/views/channels/components/channel-conversation.tsx`
2. `packages/core/api/client.ts`
3. 后端附件绑定逻辑

**要求**

1. 频道消息可带附件
2. 上传成功后与消息绑定
3. 机器人可获取附件

#### D2. 附件展示与下载

**改动文件**

1. 共享消息展示组件
2. 复用 `packages/views/editor/attachment-preview-modal.tsx`
3. 复用下载上下文能力

---

## 21. 接口与事件草案

本节是给 Claude 的明确协议参考。实现时允许小幅调整，但不得丢失语义。

### 21.1 新增或升级接口

#### POST `/api/channels/{channelId}/messages`

请求：

```json
{
  "content": "帮我看下这个报错",
  "thread_parent_id": "optional-uuid",
  "client_message_id": "7d8a-local-id",
  "trigger_mode": "manual",
  "targets": [
    { "kind": "agent", "id": "agent-uuid" }
  ],
  "attachment_ids": ["attachment-uuid-1"]
}
```

响应：

```json
{
  "id": "message-uuid",
  "channel_id": "channel-uuid",
  "sender_id": "user-uuid",
  "sender_type": "human",
  "content": "帮我看下这个报错",
  "seq": 123,
  "thread_parent_id": null,
  "delivery_status": "sent",
  "trigger_mode": "manual",
  "targets": [
    {
      "kind": "agent",
      "id": "agent-uuid",
      "name": "千问",
      "status": "queued"
    }
  ],
  "attachments": [
    {
      "id": "attachment-uuid-1",
      "filename": "error.png"
    }
  ],
  "created_at": "..."
}
```

#### GET `/api/channels/{channelId}/messages`

支持：

1. `limit`
2. `before_seq`
3. `after_seq`

推荐只实现：

1. `limit + before_seq`

如果实现增量补拉，再加 `after_seq`。

#### GET `/api/channels/{channelId}/unread`

响应建议：

```json
{
  "unread_count": 12,
  "first_unread_seq": 231,
  "last_read_seq": 230
}
```

### 21.2 实时事件草案

#### `channel:message`

沿用当前事件名，payload 升级为完整消息对象。

#### `channel:message_status`

```json
{
  "channel_id": "channel-uuid",
  "message_id": "message-uuid",
  "client_message_id": "local-id",
  "delivery_status": "failed"
}
```

#### `channel:typing`

```json
{
  "channel_id": "channel-uuid",
  "user_id": "user-uuid",
  "is_typing": true,
  "updated_at": "..."
}
```

#### `channel:target_progress`

```json
{
  "channel_id": "channel-uuid",
  "message_id": "message-uuid",
  "target_kind": "agent",
  "target_id": "agent-uuid",
  "status": "running",
  "task_id": "task-uuid"
}
```

---

## 22. 兼容要求

Claude 实施时必须满足以下兼容要求。

### 22.1 对旧前端兼容

如果请求体只包含：

1. `content`
2. `thread_parent_id`

后端也必须能正常处理。

### 22.2 对旧数据兼容

旧消息没有这些字段时，前端必须给默认值：

1. `delivery_status = sent`
2. `trigger_mode = none`
3. `targets = []`

### 22.3 对旧正文 mention 兼容

兼容期允许：

1. 没有结构化 `targets` 时，解析正文 `@name`
2. 一旦有结构化 `targets`，正文解析不得覆盖结构化目标
3. 这是**过渡期策略**，不是长期主路径

---

## 23. 每阶段验收清单

### Phase B0 验收

1. 用户发消息后，消息下方立即出现状态小字
2. 手动接话失败时，不再是静默无反馈
3. 前端能显示 `targets.name`

### Phase B1 验收

1. 发送接口支持 `none / manual / auto`
2. `channel` 表新增默认接话策略字段
3. 有结构化 targets 时，不再依赖正文解析

### Phase B2 验收

1. manual / auto / none 三种模式覆盖完整
2. 旧 `@mention` 仅走兜底分支

### Phase C1 验收

1. sending / sent / failed / retry 可见
2. queued / running / completed / failed / cancelled 可见

### Phase C2 验收

1. 未读数、未读分隔线、首条未读定位可用
2. 历史消息可分页
3. 重连后不会重复或漏消息

### Phase A 验收

1. 频道输入区支持上传
2. 频道消息支持复制
3. 频道消息支持耗时与失败态
4. 侧栏版和详情页版视觉与行为一致

### Phase D 验收

1. 频道可上传附件
2. 可预览 / 下载
3. 机器人收到带附件的频道消息后能正确处理

---

## 24. 测试要求

Claude 在每个阶段完成后，都要补测试。

### 24.1 前端测试最低要求

1. channel 输入组件测试
2. channel 消息展示测试
3. 发送失败与重试测试
4. 目标选择器测试
5. 未读分隔线测试

### 24.2 后端测试最低要求

1. 手动接话解析测试
2. 自动接话策略测试
3. 旧 mention 兼容测试
4. 已读推进测试
5. 分页查询测试

### 24.3 不接受的完成方式

以下情况不算完成：

1. 只有 UI 改了，没有协议改造
2. 只有协议改了，没有前端可见状态
3. 只有详情页可用，侧栏版未同步
4. 复制主聊天组件一份而不是抽共享层

---

## 25. 推荐提交粒度

Claude 应按以下粒度提交，不要一个超大提交做完全部。

1. `feat: surface channel trigger result under messages`
2. `feat: add structured channel trigger payload`
3. `feat: implement channel target resolution and queueing`
4. `feat: add channel message delivery states and retry`
5. `feat: add channel unread indicators and pagination`
6. `feat: add channel reconnect recovery`
7. `refactor: extract shared conversation message rendering`
8. `refactor: unify channel panel and detail page`
9. `feat: add channel attachments and agent attachment flow`

---

## 26. Claude 开工顺序

如果 Claude 只读这一节，执行顺序如下：

1. 先读：
   - `packages/views/channels/components/channel-detail-page.tsx`
   - `packages/views/channels/components/channel-panel.tsx`
   - `packages/views/channels/components/message-list.tsx`
   - `packages/views/chat/components/chat-message-list.tsx`
   - `server/internal/handler/channel.go`
2. 先完成 Phase B0
3. 再做 Phase B1 / B2
4. 再做 Phase C1 / C2
5. 最后再做 Phase A 和 Phase D

不要第一步就强抽 `ChatInput`，也不要只改协议而不补可见状态。
