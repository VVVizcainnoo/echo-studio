# 回声 Echo Studio

面向非专业音乐用户的个人歌声音色转换体验。用户可以录制或上传多个个人音色，在“我的音色”中管理并选择，再将歌曲片段转换成所选音色。

## 当前结构

- GitHub Pages：托管网页、麦克风录音和浏览器音色库
- ModelScope 创空间：运行人声分离与 Seed-VC 歌声音色转换
- IndexedDB：在体验者自己的浏览器中保存音色

## 本地预览

```powershell
py server.py
```

打开 `http://127.0.0.1:5173/`。没有部署模型时可以体验页面、录音和音色库，真实生成接口会返回模型未就绪。

## GitHub Pages

仓库包含自动发布工作流。推送到 `main` 后，在仓库 Settings → Pages 中将 Source 设为 GitHub Actions。公开合成服务部署完成后，把 [config.js](config.js) 中的 `ECHO_API_BASE` 改为 ModelScope API 地址。

## 合成服务

模型服务接收歌曲人声和已获授权的参考音色，使用 Seed-VC 的 F0 模式完成歌声转换。部署说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。

公开展示前，请确认歌曲片段和声音素材具备展示及处理授权。
