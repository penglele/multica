# 频道聊天集成方案

在 multica 基础上新增群聊协作功能：在面板右侧新开一个侧边栏，内含频道（channel）列表和消息流，类似 Slock 的交互模式。

---

## 现状对比

| 维度 | multica 现有 chat | 目标频道聊天 |
|------|---|---|
| 模型 | 1:1 user↔agent session | 多人 channel（human + agent 混合） |
| UI 位置 | 右下角浮动窗口（ChatWindow） | 右侧固定侧边栏 |
| 消息流 | user 发 → agent 执行任务 → 返回结果 | 多人实时对话 + thread |
| 数据 | `chat_session` + `chat_message` | `channel` + `channel_member` + `channel_message` |

multica 的 chat 是"给 agent 下指令的对话框"，频道聊天是"团队协作讨论区"。两者并行不冲突，保留现有 chat 功能。

---

## 一、数据模型

新增一个 migration 文件：`server/migrations/091_channel_chat.up.sql`

```sql
-- 频道
CREATE TABLE channel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
    created_by UUID NOT NULL REFERENCES "user"(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, name)
);

-- 频道成员（human + agent 混合）
CREATE TABLE channel_member (
    channel_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    member_id UUID NOT NULL,
    member_type TEXT NOT NULL CHECK (member_type IN ('human', 'agent')),
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, member_id)
);

-- 频道消息
CREATE TABLE channel_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'agent', 'system')),
    content TEXT NOT NULL,
    seq BIGINT NOT NULL,
    thread_parent_id UUID REFERENCES channel_message(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 自增 seq（per-channel）
CREATE OR REPLACE FUNCTION assign_channel_message_seq()
RETURNS TRIGGER AS $$
BEGIN
    SELECT COALESCE(MAX(seq), 0) + 1 INTO NEW.seq
    FROM channel_message WHERE channel_id = NEW.channel_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_channel_message_seq
BEFORE INSERT ON channel_message
FOR EACH ROW EXECUTE FUNCTION assign_channel_message_seq();

-- 已读标记（per-user per-channel，基于 seq）
CREATE TABLE channel_read_state (
    channel_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    last_read_seq BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX idx_channel_workspace ON channel(workspace_id);
CREATE INDEX idx_channel_message_channel_seq ON channel_message(channel_id, seq DESC);
CREATE INDEX idx_channel_message_thread ON channel_message(thread_parent_id, created_at ASC);
```

---

## 二、UI 布局

multica 现有布局结构：

```
SidebarProvider
├── AppSidebar（左侧导航）
└── SidebarInset（主内容区）
    ├── children（页面内容）
    └── extra（ChatWindow 浮动窗口）
```

新增频道侧边栏后：

```
SidebarProvider
├── AppSidebar（左侧导航，新增 "Channels" nav item）
└── SidebarInset
    ├── 主内容区（flex-1，宽度自适应）
    └── ChannelPanel（右侧，可收起，默认宽 360px）
        ├── ChannelListHeader（频道列表 + 新建按钮）
        ├── MessageList（消息流，虚拟滚动）
        ├── ThreadPanel（thread 展开时覆盖 MessageList）
        └── MessageInput（底部输入框，支持 @mention）
```

文件位置：
- `packages/core/channels/` — store、queries、mutations（无 react-dom，遵循 core 包规则）
- `packages/views/channels/` — UI 组件（无 next/* 导入）
- `DashboardLayout` 的 `extra` prop 注入 `<ChannelPanel />`

---

## 三、实时通信

复用 multica 现有的 WebSocket hub（`server/internal/realtime/hub.go`），新增 channel scope 和事件类型。

### 后端（Go）

```go
// server/internal/realtime/scopes.go 新增
const ScopeChannel = "channel"

// 新增 WS 事件（server/pkg/protocol/events.go）
const (
    EventChannelMessage    = "channel:message"
    EventChannelTyping     = "channel:typing"
    EventChannelMemberJoin = "channel:member_join"
    EventChannelMemberLeave = "channel:member_leave"
    EventChannelCreated    = "channel:created"
    EventChannelUpdated    = "channel:updated"
    EventChannelDeleted    = "channel:deleted"
)
```

用户打开频道时，前端发 `subscribe` 请求加入 `channel:{channelId}` scope。Hub 现有的 scope-based room 机制天然支持，无需改动 hub 核心逻辑。

### 前端

```typescript
// packages/core/types/events.ts 新增 WSEventType
| "channel:message"
| "channel:typing"
| "channel:member_join"
| "channel:member_leave"
| "channel:created"
| "channel:updated"
| "channel:deleted"

// packages/core/channels/queries.ts
export const channelKeys = {
  all: (wsId: string) => ["channels", wsId] as const,
  list: (wsId: string) => [...channelKeys.all(wsId), "list"] as const,
  messages: (channelId: string) => ["channel-messages", channelId] as const,
  thread: (parentId: string) => ["channel-thread", parentId] as const,
  readState: (wsId: string) => [...channelKeys.all(wsId), "read-state"] as const,
};

// use-realtime-sync.ts 新增 handler
// "channel:message"  → 追加到 messages cache，更新 unread badge
// "channel:typing"   → 更新 typing indicator store（不写 Query cache）
// "channel:created"  → invalidate channel list
// "channel:deleted"  → 从 channel list cache 中移除
```

---

## 四、与现有 chat 的关系

| 功能 | 现有 chat（保留） | 新增频道聊天 |
|------|---|---|
| 入口 | 右下角 FAB | 右侧侧边栏 |
| 场景 | 快速给 agent 下指令、执行任务 | 团队协作讨论 |
| 参与者 | 1 user + 1 agent | 多 human + 多 agent |
| Agent 触发 | 每条消息都触发 agent 任务 | @mention 时触发 |

当用户在频道中 @agent 时：
1. 消息作为 `channel_message` 存储（`sender_type = 'human'`）
2. 服务端检测 @mention，向 `agent_task_queue` 插入任务（复用现有任务队列）
3. Agent 执行完毕，回复作为 `channel_message` 写入频道（`sender_type = 'agent'`）
4. 通过 `channel:message` WS 事件推送给所有频道成员

---

## 五、实施步骤

### Phase 1 — 数据层（后端）
- [ ] 写 `091_channel_chat.up.sql` / `.down.sql`
- [ ] 运行 `make sqlc` 生成 DB 查询代码
- [ ] 实现 Go handler：CRUD channel、发送消息、获取消息列表、已读标记
- [ ] 在 `router.go` 注册路由：`/api/workspaces/{slug}/channels/...`

### Phase 2 — 实时层（后端）
- [ ] 在 hub 中注册 `channel` scope
- [ ] 发送消息时广播 `channel:message` 事件到 `channel:{id}` scope
- [ ] 实现 typing indicator（可选，低优先级）

### Phase 3 — 前端 core
- [ ] `packages/core/channels/queries.ts` — TanStack Query options
- [ ] `packages/core/channels/mutations.ts` — 发消息、创建频道、已读标记
- [ ] `packages/core/channels/store.ts` — 当前选中频道、typing 状态（Zustand）
- [ ] `packages/core/types/channel.ts` — TS 类型定义
- [ ] `use-realtime-sync.ts` 新增 channel 事件 handler

### Phase 4 — 前端 UI
- [ ] `packages/views/channels/components/channel-panel.tsx` — 主容器（可收起）
- [ ] `packages/views/channels/components/channel-list.tsx` — 频道列表
- [ ] `packages/views/channels/components/message-list.tsx` — 消息流（复用 chat-message-list 的部分逻辑）
- [ ] `packages/views/channels/components/message-input.tsx` — 输入框（支持 @mention）
- [ ] `packages/views/channels/components/thread-panel.tsx` — thread 展开面板
- [ ] `packages/views/layout/app-sidebar.tsx` — 新增 Channels nav item
- [ ] `packages/views/layout/dashboard-layout.tsx` — 注入 ChannelPanel 到 extra

### Phase 5 — Agent 集成
- [ ] 服务端检测消息中的 @mention，触发 agent 任务
- [ ] Agent 回复写入 `channel_message`
- [ ] 频道成员列表支持添加 agent

---

## 六、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 消息存储 | 独立 `channel_message` 表 | 不污染现有 `chat_message`，schema 差异大（多人 vs 1:1） |
| UI 位置 | 右侧固定 panel | 频道是持续性交互，需要固定空间；浮动窗口不适合多人对话 |
| Thread | `thread_parent_id` 自引用 | 简单有效，支持一级 thread（不支持无限嵌套） |
| 已读状态 | `last_read_seq` per-user per-channel | 基于 seq 比 timestamp 更精确，避免时钟漂移问题 |
| Agent 参与 | `channel_member` + `sender_type = 'agent'` | agent 是一等公民，与 human 统一模型 |
| WS scope | 复用现有 hub，新增 `channel` scope type | 零改动 hub 核心，天然支持 Redis relay 水平扩展 |
| 与现有 chat 关系 | 并行，不替换 | 两者场景不同，保留现有 1:1 agent chat |
