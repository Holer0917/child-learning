# 可读界面源文件

`practice.js`保留出题界面的完整可读源代码。发布文件为`src/ui/pages/practice.js`，压缩仅移除注释与多余空白，导出接口、逻辑和导入路径不变。其它模块仍直接编辑原路径。

修改出题界面时编辑本目录源文件，再执行`python scripts/build-practice.py`。可用`--check`核对产物。构建工具rjsmin固定为1.2.4，只用于开发；安装命令见脚本提示。静态网站已包含生成文件，浏览、离线、部署和现有Node测试均不要求安装Python构建工具。
