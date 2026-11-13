# Somewhere, a Letter · 世界某处的来信 💌

一个轻量级 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 前端扩展。给某个角色写一封信，收到独立回信，在自己的信箱里收藏和保存。

> **v0.2.1 兼容性修订测试版**。根据 SillyTavern 1.19.0 PC 和手机使用反馈，改善 API 预设空列表提示与手机信箱入口。真实手机浏览器的兼容性仍需测试。

## 安装和更新

新用户：打开 SillyTavern → **扩展 → 安装扩展**，粘贴仓库地址：

~~~text
https://github.com/willwefind/SillyTavern-Somewhere-a-Letter
~~~

已安装用户：打开 **扩展 → 管理扩展（Manage Extensions）**，找到 Somewhere, a Letter → **检查/安装更新**，完成后刷新酒馆网页。单独刷新网页不会自动把 GitHub 的修改拉到本地。

**无需卸载重装，不要清理浏览器站点数据。** 旧信、星标、草稿保存在原来的 IndexedDB / LocalStorage 位置，v0.2.1 不迁移、不清空旧存档。

## v0.2.1 修复内容

- **手机入口**：保留悬浮信箱按钮，将其在触屏／小屏幕移动到屏幕右侧较高位置，避开手机底部浏览器栏与酒馆输入区；同时尝试添加到酒馆的**聊天扩展菜单**及**扩展设置面板**。即使悬浮按钮不可见，也可以通过原生菜单打开同一个信箱。弹窗层级也已提升。
- **API 选项提示**：设置页在无独立连接时会解释原因——酒馆已有可用 API **不等于**已创建 Connection Profile。显示未保存预设、扩展禁用、无受支持预设等具体状态。
- **刷新连接列表**：在酒馆「API 连接」中创建或修改 Connection Profile 后，无需刷新整个酒馆，可回信箱设置点击「↻ 刷新连接列表」。
- 保留此前寄信、回信、收藏、全局信箱、搜索、草稿、JSON 备份与恢复及 PNG 导出的数据与行为，不进行数据库迁移。

### 为什么 API 下拉框只有默认选项？

信箱独立选 API 依赖酒馆内置 **Connection Profiles（连接配置）**。打开酒馆的 **API 连接**面板，先设置好 API 类型、模型及相关参数，再在 Connection Profiles 部分创建并保存一个带名字的连接配置。之后打开信箱 → ⚙ 设置 → **刷新连接列表**。已保存的、支持 Chat Completion 或 Text Completion 的配置才会出现在列表中。

**仅仅在酒馆填写 API Key、选中模型、连接成功，并不等于已经保存 Connection Profile。** 如果不需要专用连接，保持「跟随酒馆当前 API」即可。信箱不会为你自动新建配置，也不会修改主聊天 API。若你有已保存配置却仍看不到，先确认 Connection Profiles 扩展已启用，并检查信箱给出的错误提示。

## v0.2.0 主要功能

- **所有信件**：以 Gmail 式双栏导航和统一信件列表展示所有角色的往来信。
- **全局星标收藏**：跨角色汇总所有已收藏信件，单击 ☆ / ★ 收藏或取消。原来已经收藏过的信会直接显示。
- **信件搜索**：顶部搜索栏根据角色姓名、主题、原信正文、回信正文、署名进行浏览器本地即时过滤，不调用模型。
- **角色信箱**：在左侧选择收件人后可进入该角色专属归档；选择收件人本身**不会自动跳出**「所有信件」或「星标收藏」。阅读旧信也不会擅自改变写信收件人。
- **独立写信**：点击「写一封信」，自由填写主题、署名与正文；角色原本的人设与主要世界书用于一次性独立回信。
- **设置 → 回信 API**：默认「跟随酒馆当前 API」，也可以选择酒馆 **Connection Manager（连接管理器）** 中已有且受支持的连接预设。独立预设调用不会切换主聊天的 API，不需要重新输入 API Key；如果连接不可用会报错，不会静默切回默认连接。
- **设置 → 主题**：日间 / 夜间模式；顶部 ☾ / ☀ 也可一键切换。只影响信箱自身，不修改酒馆全局主题。
- **设置 → JSON 备份与恢复**：所有角色的信件、收藏状态和草稿导出至 JSON；恢复时不覆盖现有信件和草稿，重复 ID 跳过。
- **草稿**：按角色自动保存，切换角色或刷新浏览器仍可恢复。成功收到并归档回信后清空对应草稿；API 或存档失败则保留。
- **无题摘要与 PNG**：主题为空时用信件正文的首句概述代替无题；导出 PNG 信纸，长信自动分页并显示浏览器本地日期。

## 重要边界

**一封来信 → 一次模型生成 → 一封回信。**

- 不读取当前聊天内容、Persona、过往信件、角色关系或用户长期记忆。
- 只读取本次所选角色的角色卡设定和主世界书；若主世界书未绑定，尝试读取卡内嵌的 `character_book`。
- 不读取额外辅助世界书、全局世界书、聊天专属世界书和 Persona 世界书。
- 世界书激活是轻量匹配（常驻、基础关键词、简单条件、字数预算），**不完全等同**于 SillyTavern 的递归世界书引擎。
- 不做连续通信、好感度、已读未读、标签管理，也不新增后端服务或第三方 JS UI 框架。
- 对角色自身的语言和回信长短不强加模板；模型仍可能受当前后端参数与所选连接预设影响。

### 关于 API 连接切换

- 默认选项沿用原始 `generateRaw()` 生成逻辑，继续使用酒馆当前 API 配置。
- 选择独立连接时走官方 `ConnectionManagerRequestService`，支持其允许的 Chat Completion / Text Completion 连接预设。**需要事先在 SillyTavern 的连接管理器中创建好预设**。
- 独立连接使用预设的模型与 API 凭据，不会保存 Key，也不会修改主聊天所选配置。
- 此功能是可选的。未开启 / 未安装 / 禁用连接管理器时，使用默认 API 仍然正常。

## 隐私与保存

- 信件及星标记录保存在本浏览器对应站点的 **IndexedDB**，草稿和界面偏好保存在 LocalStorage，所有信件搜索也在浏览器本地执行。
- 旧信和收藏不会因为切换角色而丢失；但不同浏览器、不同设备不会自动同步。清理站点数据可能永久删除信箱，请定期备份。
- **同一浏览器和同一站点来源上的不同 SillyTavern 登录用户可能共享这些本地数据**。公用设备请注意隐私。
- 云端 API 调用仍需将本次来信、角色人设及相关主世界书传输给所选模型服务商。
- JSON 文件可能包含私密现实经历，请妥善保管。恢复按信件 ID 判断重复；删除角色卡后，原信仍保存在备份中，但不会自动关联至重新导入的新卡。

## 项目结构

~~~text
manifest.json       扩展清单
index.js            导航、统一信件列表、搜索、阅读、写信、设置
style.css           双栏布局 / 手机适配 / 日夜主题
src/engine.js       角色和主世界书读取、独立回信构建
src/api.js          当前酒馆 API / Connection Manager 独立预设
src/storage.js      IndexedDB 存档与备份恢复
src/drafts.js       LocalStorage 角色草稿
src/backup.js       JSON 备份文件处理
src/export.js       无依赖 Canvas PNG 信纸导出
~~~

图片排版沿袭 [拾句 Shiju](https://github.com/willwefind/shiju) 的设计方向，但为了轻量未引入其完整字体和素材资源。

## v0.2.1 测试清单

1. **手机端**：先找信箱悬浮入口；如果被酒馆布局遮住，尝试在聊天输入区的扩展菜单或顶部扩展设置面板找到「✉ 打开世界某处的来信」。检查信箱可正常弹出、关闭、滚动和搜索。
2. **API 设置**：未保存连接配置时，确认能看到明确提示；在酒馆 API 连接面板创建 Connection Profile，再点「刷新连接列表」，确认新配置出现。
3. 先前已收藏的小陆、小谢信件应同时出现在「星标收藏」，不因选择不同收件人而变化。
4. 从星标点开某封信、返回列表，仍显示跨角色收藏；取消收藏后立即从该列表消失。
5. 顶部搜索「小陆」、主题词、原信文字或回信中的关键词，结果正确；切换到「角色信箱」后只搜索对应角色。
6. 切换收件人不会自动改变「全部信件」／「星标收藏」视图，也不会把原来的草稿转移给别人。
7. 切换 ☀ / ☾，关闭信箱再打开、刷新网页后，夜间/日间偏好仍保持。
8. 设置里默认 API 仍能生成回信；选择 Connection Manager 预设后由选中的模型响应，同时主聊天 API 不变化。
9. JSON 备份/恢复与 PNG 导出正常，旧信和草稿保持不变。

发现问题可在 [Issues](https://github.com/willwefind/SillyTavern-Somewhere-a-Letter/issues) 中反馈。

---

**English** — Somewhere, a Letter is a lightweight, one-off letterbox extension for SillyTavern. v0.2.0 introduces a Gmail-inspired inbox, global cross-character starred collection, local full-text search, optional Connection Manager profile selection, theme switching, and a dedicated settings page for JSON backup/restore. It still has no long-term AI memory, relationship states or external runtime dependencies.


**v0.2.1** — Mobile access improvements and explicit Connection Profile setup/refresh guidance; no data migration.
