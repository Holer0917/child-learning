# ABC 仓库同步与发布

日期：2026-10-30。授权：用户“直接推送，接下来做出的改动也可以直接提交仓库”。后续功能完成适当检查后可直接提交/推送；若用户另有本地限定，以新指令为准。

## 1. 目标与版本

| 目标 | 分支/网址 | 说明 |
|---|---|---|
| 正式GitHub | [Holer0917/child-learning](https://github.com/Holer0917/child-learning)，main | 完整代码、文档、自测与历史 |
| 正式Gitee | [huang-lei544513/childrens-learning](https://gitee.com/huang-lei544513/childrens-learning)，master | 与GitHub保留一致的正式内容 |
| 正式网页 | [GitHub Pages](https://holer0917.github.io/child-learning/) | 静态HTML/JS，正式存储前缀km: |
| 独立测试仓库/网页 | [仓库](https://github.com/Holer0917/child-learning-b10-preview) · [测试网页](https://holer0917.github.io/child-learning-b10-preview/#/home) | 只发布运行副本，测试数据仍使用km-preview-b10: |

源代码基线为SRS V1.5 / SDD V1.11、本地SW abc-1；[ABC集成报告](17-ABC修复与本地集成.md)记录77项逻辑测试、125组浏览器检查通过，非图片运行资源298150字节。

发布前核对：Gitee master为`bae3ca8646981a5680a2a433a0d1eba00ec0ec78`，与当前本地提交一致，且仅有master分支；GitHub main为`b483cef9bde525ed0f79b95305e86d92b436f517`。两者提交不同但文件树完全相同。发布时保留双方历史，不使用强制推送。此前用户说明C已提交Gitee，本次主仓库核对结果按上述实际分支记录。

## 2. 发布约束

- 正式仓库提交完整ABC与必要文档/真实验证产物；不提交.tmp、认证信息、下载ZIP或未采用的美术素材。
- 正式网页保持既有本机数据前缀；独立测试副本仅改变名称、页脚、存储隔离与SW发布版本。
- 先保留现有变更并提交，再合入GitHub历史，使最终正式提交同时包含两侧已有历史；之后正常快进推送两库。
- 发布前扫描待提交文件中的认证信息，核对测试输入哈希；推送后核对分支、提交内容和公开页面。
- 浏览器有旧缓存时，点击“检查更新/重试离线”，看到新版提示后关闭所有该应用页面/窗口再重开；不清空学习数据。

## 3. 执行状态

**已完成正式两仓库及独立测试站的同步与部署。**

| 核对项 | 实际结果 |
|---|---|
| 正式源代码发布提交 | `3b97cf453b1b211793be370dcbbd3f7402c451fe`，同时保留原GitHub/Gitee历史；后续验证记录提交只补充文档与证据 |
| 本地功能提交 | `a3a0a170837842845658b10557965e67485a904a` |
| 独立测试提交 | `51c5351f6b56d5bd6d3ede2e290433f3a9cef9a9` |
| 正式代码自测 | 77项逻辑、125组浏览器检查通过 |
| 测试副本检查 | 80项逻辑/隔离、43组浏览器检查通过 |
| Pages | 正式与测试两站均构建成功，版本分别abc-1、abc-preview-1 |
| 公开文件 | 两站各43个运行文件与其发布提交逐字节一致 |
| 公开实际流程 | 标准备份真实下载/覆盖回导、1题错题重练攻克、离线刷新档案/统计通过 |
| 同源数据隔离 | 同一个隔离浏览器上下文中，测试站操作未改变正式站km:数据 |
| 后续认证 | 已迁移到本机Windows凭据管理器并核对读取；Git远程URL不含令牌 |

本地状态与发布记录分别保存在被忽略的`.tmp/abc-release-state.json`、`.tmp/github-abc-preview-state.json`。公开测试使用独立无头Edge，未操作个人浏览器学习数据，不等同于真实手机验收。

[发布摘要](evidence/ABC-release-20261030/release.json) · [逐文件核对](evidence/ABC-release-20261030/public-files.json) · [公开流程](evidence/ABC-release-20261030/public-browser.json) · [测试副本检查](evidence/ABC-release-20261030/preview-qa.json) · [校验和](evidence/ABC-release-20261030/SHA256SUMS.txt)。
