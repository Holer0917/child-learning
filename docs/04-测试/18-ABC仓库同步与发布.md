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

当前为发布准备记录。完成推送、静态站部署与公开流程核对后补记实际结果。未将未完成的部署写成成功。
