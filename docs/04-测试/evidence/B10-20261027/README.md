# 2026-10-27 B10 自测原始输出

本目录保存统一入口 `scripts/check-b.cjs` 在北京时间2026-10-27 16:06:34～16:08:00实际执行的结果，按用户要求仅保存在本地。

[机器汇总](summary.json)记录12个批次通过、34项逻辑测试通过、102组浏览器检查通过；[校验和](SHA256SUMS.txt)覆盖机器汇总、下列日志和JSON。README本身不在校验和范围。源代码/测试输入哈希见summary.inputs；执行前后一致。

| 批次 | 原始输出 | 结构化检查结果 |
|---|---|---|
| 逻辑测试 | [unit.log](unit.log) | TAP结尾含34/34、失败/跳过/取消0 |
| B01 | [日志](B01.log) | [JSON](B01-results.json) |
| B02 | [日志](B02.log) | [JSON](B02-results.json) |
| B03 | [日志](B03.log) | [JSON](B03-results.json)，含本机计时样本 |
| B04 | [日志](B04.log) | [JSON](B04-results.json) |
| B05 | [日志](B05.log) | [JSON](B05-results.json) |
| B06 | [日志](B06.log) | [JSON](B06-results.json)，含输入和布局记录 |
| B07 | [日志](B07.log) | [JSON](B07-results.json)，含焦点走查 |
| B08 | [日志](B08.log) | [JSON](B08-results.json) |
| B09 | [日志](B09.log) | [JSON](B09-results.json)，含动画/音频节点样本 |
| 答题回归 | [日志](quiz-regression.log) | [JSON](quiz-regression-results.json) |
| 历史回归 | [日志](history-regression.log) | [JSON](history-regression-results.json) |

日志保留stdout/stderr，负向用例可能包含预期的存储错误日志；是否通过以进程退出码、断言及summary状态共同判断。用例使用独立浏览器数据，示例记录不是真人学习成绩；本目录不包含用户的日常浏览器数据、仓库凭据或访谈证据。真实手机、听音、安装和A/C集成尚未验收。
