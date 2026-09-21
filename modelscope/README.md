# 回声 Seed-VC 后端

用于 ModelScope 创空间的歌声音色转换服务。

- SDK：Gradio 5.23
- 建议资源：xGPU Tesla 16GB 或更高
- 入口文件：`modelscope/app.py`
- API 名称：`/convert`

首次运行会下载 Seed-VC、Demucs 与相关权重，因此冷启动较慢。部署前需确认演示歌曲和参考声音具备使用授权。
