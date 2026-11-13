# v0.3.0 · Somewhere, a Letter / 世界某处的来信 💌

**首个公开版本 · First public release**

> 给某个角色写一封信，收到一次独立回信，然后把这封来自世界某处的信保存下来。

## 主要功能

- **独立通信**：随时给 SillyTavern 角色寄信，无需切换主聊天。每封回信单独生成，不读取旧聊天或其他信件，不预设玩家身份或关系。
- **角色设定**：生成时使用所选角色的角色卡设定与关联主世界书，不改变角色原本性格或语言习惯。
- **信箱**：跨角色所有信件、星标收藏、角色专属信箱、全文搜索、草稿保存、JSON 备份与恢复。
- **独立 API（可选）**：可以跟随酒馆当前 API，或选择已保存的 Connection Profile，**不修改主聊天 API**。
- **PC + iOS**：轻量信箱入口、可拖动的手机浮窗、iOS 键盘适配、日夜主题。
- **Letter Studio 信纸工作台**：回信导出 PNG 前，可预览并设置自动／指定 1–6 页、系统／自导入字体、24–36px 字号、预设／自定义墨色。
- **PNG 保存**：PC 下载 PNG；iOS 可长按图片保存到相册，或调用系统分享；多页可切换预览并逐页保存／分享。

## 安装

SillyTavern → **扩展 → 安装扩展**，输入仓库地址：

```text
https://github.com/willwefind/SillyTavern-Somewhere-a-Letter
```

已安装用户可在 **扩展 → 管理扩展** 中更新，然后刷新酒馆页面。

## 兼容性与已知限制

- 作者已在 **PC 和 iOS Safari** 实测核心功能，包括字体导入与 PNG 保存。其他设备／浏览器欢迎反馈。
- 信件、草稿、收藏、字体均为**当前浏览器本地存储**。不同设备**不会自动同步**；请定期导出 JSON 备份。
- 导入字体支持 TTF、OTF、WOFF、WOFF2，**单文件小于 12 MB，最多 12 款**。字体文件不会被包含在 JSON 信件备份中。
- 信纸分页有移动端图片高度安全限制；若单页过长，将提示增加页数或缩小字号。
- 需要提前在酒馆连接管理器中保存 Connection Profile，才能使用独立 API 选择功能。

## 开源许可证

**GPL-3.0-only** · Copyright © 2026 willwefind

允许修改、二次开发、商业使用与再分发，但分发修改后的版本需要遵守 GPL-3.0 的相应版权、许可证、修改说明及源代码提供义务。完整条款见 [LICENSE](./LICENSE)。

Letter Studio 的部分排版思路参考同作者的 [拾句 Shiju](https://github.com/willwefind/shiju)。拾句独立采用 AGPL-3.0 许可证，请分别遵循两个项目各自的授权条款。

---

**English summary:** Somewhere, a Letter is a lightweight SillyTavern front-end extension for one-off character correspondence. It offers a multi-character inbox, bookmarks, local search, optional dedicated API profiles, and Letter Studio for live PNG layout with adjustable page count, fonts, size, and ink. Tested on PC and iOS Safari. Letters and imported fonts are stored locally; cross-device sync is not yet supported. Licensed GPL-3.0-only.

Issues & suggestions: https://github.com/willwefind/SillyTavern-Somewhere-a-Letter/issues
