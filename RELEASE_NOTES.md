# Anything Analyzer v3.6.0

## 新增

- **交互录制模块** — 记录用户在目标页面上的鼠标点击、元素交互、移动轨迹、键盘输入、滚动等操作，生成结构化交互序列
  - 智能选择器生成（CSS / XPath / data-testid / nth-of-type 多策略）
  - 鼠标移动轨迹智能采样（时间+距离+方向变化过滤，避免数据爆炸）
  - 输入自动脱敏（密码框内容替换为 `[MASKED]`）
  - 多 Tab 支持（新建/切换 Tab 自动注入录制脚本）
- **回放引擎** — 通过 CDP Input domain 模拟用户操作，支持变速回放录制的交互序列
- **5 个新 MCP 工具** — AI Agent 可通过 MCP 协议调用：
  - `get_interactions` — 查询录制的交互事件
  - `get_interaction_summary` — 获取操作摘要（步骤描述）
  - `replay_interactions` — 回放录制的交互序列
  - `execute_browser_action` — 执行单步浏览器操作（点击/输入/滚动/导航）
  - `get_page_elements` — 获取页面可交互元素列表

## 下载

| 平台 | 文件 |
|------|------|
| Windows | Anything-Analyzer-Setup-3.6.0.exe |
| macOS (Apple Silicon) | Anything-Analyzer-3.6.0-arm64.dmg |
| macOS (Intel) | Anything-Analyzer-3.6.0-x64.dmg |
| Linux | Anything-Analyzer-3.6.0.AppImage |
