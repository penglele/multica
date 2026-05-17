# BONCML 品牌切换与去 Multica 化落地方案

## 1. 文档定位

这份文档是 `boncml-workspace-mvp.md` 的配套执行文档。

它解决的不是“功能做什么”，而是：

> **如何在继续复用 multica 底层能力的同时，让最终交付给用户的产品前台完全呈现为 BONCML Workspace，而不是暴露 multica 的页面、命名和产品痕迹。**

这份文档是硬约束，不是美化建议。

---

## 2. 核心目标

从现在开始，后续所有面向用户的新页面、新入口、新导航，都必须遵守以下原则：

1. **用户可见品牌只允许是 BONCML / BONCML Workspace**
2. **用户不可见 multica 术语**
3. **用户主路径不可落到旧的 multica 页面**
4. **multica 只作为底层技术实现，不作为前台产品表达**

一句话：

> 对用户来说，这个产品必须看起来、用起来、被售前描述起来都像是一个完整的 BONCML 产品，而不是“套了 multica 壳的分析页面”。

---

## 3. 为什么必须做

## 3.1 产品归属

必须让用户明确知道自己在使用：

1. BONCML Workspace

而不是：

1. multica
2. channel
3. 某个通用协作平台的换皮页面

## 3.2 售前与交付口径

对外描述必须统一为：

1. BONCML Workspace
2. 分析房间
3. 任务
4. 工件
5. 审计

如果页面里仍然暴露：

1. multica
2. channel
3. issue
4. workspace/chat 等旧语义

就会直接削弱产品可信度。

## 3.3 用户信任

政企和企业客户会天然关注：

1. 这是不是一个完整产品
2. 页面是否统一
3. 是否存在拼装感

只要用户还能看到 multica 痕迹，产品感就不完整。

---

## 4. 去 Multica 化范围

## 4.1 必须清理的用户可见内容

### 品牌元素

1. 页面标题
2. Logo
3. favicon
4. 登录后欢迎文案
5. 空状态文案
6. 浏览器 tab title

### 信息架构命名

1. channel
2. panel
3. issue
4. chat session
5. multica workspace
6. 任何暴露底层产品名的提示语

### 路由与页面入口

1. 用户主入口不能再以旧 channel 页面作为最终落点
2. 新入口必须进入 BONCML Workspace 页面
3. 旧 multica 页面只允许作为过渡技术入口存在，不允许作为正式产品入口

### 导航和菜单

1. 侧边导航
2. 顶部导航
3. tab 名称
4. 操作按钮文案

## 4.2 可以暂时保留的底层技术实现

这些可以继续复用，但不允许直接以原名暴露给用户：

1. 认证
2. realtime
3. channel message store
4. upload
5. pagination / unread / retry
6. channel conversation 组件

原则：

1. **实现可以复用**
2. **术语和入口必须改成 BONCML 产品语义**

---

## 5. 新的产品命名约束

后续所有新增用户可见页面都统一采用以下产品词汇：

| 旧术语 | 新术语 |
|---|---|
| Channel | Room / 分析房间 |
| Channel Panel | Workspace Side Panel（仅内部）/ 房间侧栏 |
| Channel Detail Page | Workspace Room Page |
| Chat | CHAT（仅作为工作台中的一个 tab） |
| Members | Members / 协作成员 |
| Agents | Agents / 分析代理 |
| Artifacts | Artifacts / 工件 |
| Audit | Audit / 审计 |

注意：

1. 代码内部仍可保留 channel 术语以减少改动
2. 但所有用户可见文本、标题、导航、面包屑、按钮文案必须换成 BONCML 语义

---

## 6. 页面切换策略

## 6.1 过渡期策略

第一阶段不要求立刻删除旧页面，但必须做到：

1. 新登录主路径进入 `WorkspaceRoomPage`
2. 主导航不再引导用户进入旧 channel 页面
3. 旧页面不作为正式产品展示路径

## 6.2 最终状态

最终应实现：

1. 用户只感知到 BONCML Workspace
2. 旧 multica 页面完全隐藏在产品主路径之外
3. 即使底层仍复用 `ChannelConversation`，用户也不知道自己在使用 channel

---

## 7. 分阶段执行

## Phase B0：品牌清单梳理

目标：

1. 找出所有用户可见的 multica 痕迹

检查清单至少包含：

1. 页面 title
2. favicon
3. sidebar 文案
4. header 文案
5. 空状态
6. 按钮文案
7. route label
8. 浏览器地址主入口

产出：

1. 一张“旧词汇 -> 新词汇”的映射表
2. 一张“旧页面入口 -> 新页面入口”的切换表

## Phase B1：主入口切换

目标：

1. 登录后主落点切换到新的 Workspace 主页面

要求：

1. 登录逻辑不重写
2. 只改登录后默认入口和主导航
3. 新入口必须进入 BONCML Workspace 页面

## Phase B2：页面文案与品牌替换

目标：

1. 去掉所有用户可见 multica 文案

要求：

1. 所有新页面只出现 BONCML 品牌
2. 所有旧页可见文案同步替换
3. 浏览器 tab title / 页面 header / 空状态 / 菜单名称统一

## Phase B3：旧页面隐藏

目标：

1. 让旧 multica 页面从正式产品主路径中消失

要求：

1. 主导航不再出现旧入口
2. 新页面壳层覆盖核心使用场景
3. 仅保留必要兼容路由

## Phase B4：彻底去感知化

目标：

1. 即使底层仍复用 multica，用户也完全感知不到

要求：

1. 开发命名和产品命名彻底分层
2. 对外交付材料、截图、录屏、演示环境全部使用 BONCML 品牌

---

## 8. 与 Workspace MVP 的关系

这份文档不是独立主线，而是 `boncml-workspace-mvp.md` 的伴随约束。

执行关系：

1. **W1：Workspace Shell** 开始时，就同步执行本计划的 **B1 / B2**
2. 不允许先做出一个“仍然一眼看出是 multica”的 Workspace 页面，再等后面慢慢换

也就是说：

> **从第一个 Workspace 页面开始，就必须按 BONCML 产品身份交付。**

---

## 9. Claude 执行说明

给 Claude 的明确要求：

1. 后续所有新增用户可见页面，必须按 BONCML Workspace 命名
2. 现有 channel 页面可以复用能力，但不能继续作为最终产品页面
3. 不允许在用户主路径中暴露 multica 词汇
4. 不允许把“后面再换品牌”当成默认策略

如果遇到两种方案：

1. **复用底层实现但包装成 BONCML 页面**
2. **继续让用户先看到 multica 页面，后面再改**

必须始终选 1。

---

## 10. 推荐立即开工的第一批事项

1. 梳理所有用户可见 multica 文案
2. 明确新 `WorkspaceRoomPage` 的产品命名
3. 切登录后默认主入口到 Workspace 页
4. 替换页面 title / header / sidebar / tab 文案
5. 隐藏旧 channel 页面在主导航中的暴露

---

## 11. 最终判断

后续开发中，**BONCML Workspace 的产品身份**必须和 **multica 的技术实现**彻底分层：

1. 技术上可以复用 multica
2. 产品上必须完全表现为 BONCML

否则即使功能做对了，交付出来也仍然像“通用协作框架的二次包装”，这不符合当前产品化目标。
