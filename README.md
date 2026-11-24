# AI Coding Monitor

一个只在本地使用的 macOS 桌面客户端：把你常用的网页收进收藏，用最快的速度在它们之间切换。

页面在应用内嵌的浏览器里打开，登录状态保存在本机；切换时页面常驻后台，切回来还是刚才的样子。

## 交互设计

- **自动隐藏侧边栏**：鼠标移到窗口左边缘，收藏栏滑出；移开自动收起。侧边栏也可以在设置里固定常驻。
- **循环切换**：`⌃Tab` / `⌃⇧Tab` 在收藏间来回切，底部浮层显示当前页和位置。
- **页面总览**：`⌘⇧Space` 平铺所有收藏的实时缩略图，可直接搜索、方向键选择、回车打开。
- **数字直切**：`⌘1` ~ `⌘9` 直接跳到第 N 个收藏。
- **悬浮顶栏**：鼠标移到窗口顶部才显示前进/后退/刷新和地址栏，平时让出内容空间；`⌘L` 可键盘聚焦地址栏。
- **临时访问**：地址栏可以随时输入任意网址在当前页打开，不会改动收藏本身。
- **菜单栏图标**：点击系统菜单栏的图标会列出全部收藏，选中某一项即可唤起窗口并切换到对应页面；菜单里还能打开页面总览、设置或退出应用。

> 注：macOS 系统保留了 `⌘Tab` 作为应用切换器，应用无法拦截，所以页面切换使用浏览器习惯的 `⌃Tab`。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `⌃Tab` / `⌃⇧Tab` | 下一个 / 上一个收藏 |
| `⌘⇧Space` | 页面总览（可输入筛选） |
| `⌘1` ~ `⌘9` | 直接切换到第 N 个收藏 |
| `⌘L` | 聚焦地址栏 |
| `⌘R` | 刷新当前页面 |
| `⌘[` / `⌘]` | 后退 / 前进 |
| `⌘,` | 打开设置 |
| `⌘W` | 设置打开时关闭设置，否则隐藏窗口 |
| `⌘Q` | 退出应用 |

## 设置后台

`⌘,` 或点击侧边栏底部的齿轮打开设置。设置会在**当前窗口内**展开，不会另开窗口；右上角的 × 或 `Esc` 返回页面。

- **收藏页面**：新建、编辑、删除、拖动排序。可自定义名称、网址、图标和标识色。
- **通用**：常驻页面数量（手动输入 0–5）、启动时打开的页面、固定侧边栏。
- **数据**：导出/导入收藏 JSON、一键清除所有网站数据（Cookie / 登录状态 / 缓存）。

数据只存在本机 `~/Library/Application Support/AI Coding Monitor/config.json`，网站登录态存放在 Electron 的 `persist:aimon` 分区中。

## 环境要求

- macOS（Apple Silicon）
- Node.js >= 18

## 开发运行

```bash
npm install
npm start
```

## 构建与安装

一键构建、ad-hoc 签名、生成 zip 分发包并安装到 `/Applications`：

```bash
bash build.sh
```

构建完成后：

```bash
open -a "AI Coding Monitor"
```

分发包位于 `dist/AI-Coding-Monitor-mac-arm64.zip`，可以拷贝到其他 Mac 上手动安装：解压后把 `AI Coding Monitor.app` 拖进 `/Applications` 即可。由于是本地 ad-hoc 签名，首次打开如果被系统拦截，右键点击应用选择「打开」。

## 项目结构

```
├── main.js                  # Electron 主进程：窗口、菜单栏、快捷键、IPC
├── preload.js               # 渲染进程安全桥
├── src/
│   ├── config.js            # 本地 JSON 配置存储
│   ├── guest/
│   │   └── customizations/  # 针对特定站点的页面定制（独立模块，自动按 URL 匹配注入）
│   │       ├── index.js     # 定制模块注册表
│   │       ├── hosts.js     # 共享站点域名
│   │       ├── header-refresh/  # 给页面顶栏加“刷新”按钮
│   │       ├── status-columns/  # 调整“中转站渠道状态”表格列顺序
│   │       ├── sidebar-order/   # 调整左侧菜单顺序
│   │       ├── usage-cost-cny/  # 显示总消费折算的人民币金额
│   │       ├── usage-filter-bottom/ # 把“API 密钥”筛选卡片移到明细表格下方
│   │       ├── usage-time-range-today/ # 若默认时间范围不是“今天”则自动切换到“今天”
│   │       └── usage-charts-bottom/ # 把用量页图表移到明细表格下方
│   └── renderer/
│       ├── index.html       # 主界面 + 同窗口设置视图
│       ├── styles.css
│       ├── app.js           # 收藏切换、侧边栏、总览、地址栏
│       ├── settings.css     # 设置视图样式（限定在 #settings-view 内）
│       └── settings.js      # 设置视图逻辑
├── assets/                  # 应用图标与菜单栏图标
└── build.sh                 # 一键构建脚本
```

## 页面定制

针对特定站点的 DOM 定制都放在 `src/guest/customizations/` 下，每个需求是一个独立目录：

```
customizations/
├── index.js          # 注册表：收集所有定制模块
├── hosts.js          # 共享域名匹配
└── <name>/
    ├── index.js      # 元信息：id、matches(url)、要注入的脚本
    └── inject.js     # 页面内执行的脚本，只关心自己的 DOM 逻辑
```

主进程只负责在 webview `dom-ready` / `did-navigate-in-page` 时调用注册表，按 URL 匹配后注入对应脚本，不包含任何具体站点或页面的逻辑。新增定制时只需新建一个目录并在 `customizations/index.js` 中登记。

目前已有的定制：

- `header-refresh`：在页面顶栏公告图标左侧添加“刷新”按钮，点击时触发页面自带的刷新。支持原有面板和 `codex.aitoken521.com/usage`、`codex.svips.org/usage` 用量页。
- `status-columns`：把“中转站渠道状态”表格的“可用率趋势”列移动到“渠道”列之后；兼容 `/status/` 直接访问和 `/custom/status` 的同源 iframe 嵌入。
- `sidebar-order`：把左侧菜单的“渠道状态”移到“使用记录”之后，让用量和渠道状态相邻；Vue 重新渲染时会自动重排。
- `usage-cost-cny`：在 `codex.aitoken521.com/usage`、`codex.svips.org/usage` 的“总消费”卡片中，在“标准”下方显示 `换算 ￥xx =$total/2.5`，其中 `xx` 为实际总消费除以 2.5 的结果。
- `usage-charts-bottom`：把用量页的“模型分布”“分组使用分布”“端点分布”“Token 使用趋势”四张图表移到使用明细表格（含分页栏）下方，让明细优先显示。支持 New API 面板的 `/usage`（`ap-sub.top`、`svips.org`）和 `codex.svips.org/usage`。
- `usage-filter-bottom`：把用量页中以“API 密钥”为首个筛选项的筛选卡片移到使用明细表格（含分页栏）下方，两个定制同时生效时顺序为“表格 → 筛选卡片 → 图表”。支持 New API 面板的 `/usage`（`ap-sub.top`、`svips.org`）和 `codex.svips.org/usage`。
- `usage-time-range-today`：进入用量页后，如果“时间范围”不是“今天”，自动打开时间范围选择器并切换到“今天”；包括整页加载和从同域其他页面通过站内路由切到用量页；用户自己操作过时间范围后不再干预。支持 New API 面板的 `/usage`（`ap-sub.top`、`svips.org`）和 `codex.svips.org/usage`。
