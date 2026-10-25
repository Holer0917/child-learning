# Gitee Fork 协作指南

协作基线：2026-10-25，SRS V1.4 / SDD V1.2。打印已取消，当前运行界面为白色极简版。三份任务见 [任务分工](02-剩余任务三份分工.md)，每人认领一份；黄磊额外负责统一集成。

## 1. Fork 与克隆

打开 [Gitee 主仓库](https://gitee.com/huang-lei544513/childrens-learning)，从 **master** 分支 Fork 到自己的账号。克隆自己 Fork 后的仓库；下面的 YOUR_ACCOUNT 请替换为自己的 Gitee 用户名，仓库名以实际 Fork 结果为准。

```bash
git clone https://gitee.com/YOUR_ACCOUNT/childrens-learning.git
cd childrens-learning
git remote add upstream https://gitee.com/huang-lei544513/childrens-learning.git
git fetch upstream
```

origin 指自己的 Fork，upstream 指黄磊的主仓库。首次开始时从最新 upstream/master 创建自己的功能分支，按认领包只执行一条：

```bash
# A：错题与学习分析
git switch -c codex/mistakes-stats upstream/master
# B：出题与练习体验
git switch -c codex/practice-preview upstream/master
# C：档案与数据管理
git switch -c codex/profiles-backup upstream/master
```

本地已有同名分支时使用 git switch 切换，不覆盖已有工作。不要把功能直接写入 master。

## 2. 本地运行与开发

在仓库根目录运行：

```bash
python -m http.server 8765 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:8765/#/home`；Windows 若无 python 命令可使用 `py -m http.server 8765 --bind 127.0.0.1`。项目使用原生 ES Module，不需要 npm 安装或构建，不要直接双击 index.html。

先确认首页、出题、答题和成绩历史能运行，再开发认领包。错题本当前是待开放入口，档案管理、备份、预览与离线等以任务表中的状态为准。

共用文件和数据字段必须遵循分工文档第 5 节。公共路由、首页、结算入口、基础样式由黄磊统一接入；各包提供最小补丁或接入说明。所有页面继续适配手机，保持白色极简样式。

## 3. 提交与交接

每次提交前用 `git status`、`git diff` 核对内容，只添加自己修改的文件；保留自己的账号认证方式，不提交令牌、密码、个人浏览器数据或临时测试产物。

```bash
git add <本次实际改动的文件路径>
git commit -m "feat: describe your completed task"
git push -u origin <自己的功能分支名>
```

在 Gitee 提交合并请求（Pull Request）：来源为自己的功能分支，目标为 `huang-lei544513/childrens-learning` 的 **master**。请求中写明认领包、已完成需求、改动文件、接入方法、真实测试结果及未完成项。由黄磊审查、集成和统一更新 GitHub/在线演示；成员不自行部署主站。

开始下一轮前可执行 `git fetch upstream` 查看主仓库更新；合并前先提交或妥善保存自己的改动，不强行覆盖本地文件。有共享文件冲突先与黄磊协调。

## 4. Fork 前核对

主仓库应能看到本文件、`01-取消打印功能变更说明.md`、`02-剩余任务三份分工.md`，以及 SRS V1.4 / SDD V1.2。若 Fork 较早已存在，先同步上游后再建立功能分支。
