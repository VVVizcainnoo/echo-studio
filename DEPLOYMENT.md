# 回声公网部署

公网演示拆成两部分：GitHub Pages 托管产品网页，ModelScope 创空间运行歌声音色转换。面试官只需要打开 GitHub Pages 链接。

## 1. GitHub Pages

仓库内的 `.github/workflows/pages.yml` 会在 `main` 分支更新后自动构建网页。首次发布时，在 GitHub 仓库的 `Settings → Pages` 中将 Source 设为 `GitHub Actions`。

## 2. ModelScope 创空间

1. 注册并登录 ModelScope。
2. 申请加入 `xGPU-Explorers` 组织；通过后可在创空间选择免费共享 GPU。
3. 创建编程式 Gradio 创空间，SDK 选择 Gradio 5.23，入口文件使用 `modelscope/app.py`。
4. 将项目文件推送到创空间，安装 `modelscope/requirements.txt` 中的依赖。
5. 选择至少 16 GB 显存的 xGPU，发布后使用页面自带输入完成一次冷启动测试。
6. 在 Gradio 页面的 “Use via API” 中确认 `/convert` 可用。

xGPU 会排队并自动休眠，首次运行还需下载人声分离和 Seed-VC 权重，因此面试前应提前唤醒并生成一次。

## 3. 连接前后端

把 `config.js` 中的 `ECHO_API_BASE` 改成公开的 ModelScope 创空间地址，然后重新推送 GitHub。网页会通过 Gradio Client 调用 `/convert`，密钥不会放进浏览器。

公开展示前，应确认歌曲片段和参考声音具备展示及处理授权。
