import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

import gradio as gr

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = Path(os.getenv("SEED_VC_DIR", "/mnt/workspace/seed-vc"))
SOURCE_CLIP = ROOT / "assets" / "go-beyond-clip.mp3"
SOURCE_VOCALS = Path("/mnt/workspace/echo-cache/go-beyond-vocals.wav")
LOCK = threading.Lock()


def prepare_runtime():
    if not (MODEL_DIR / "inference.py").exists():
        MODEL_DIR.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            "git", "clone", "--depth", "1",
            "https://www.modelscope.cn/models/jaman21/Seed-VC.git",
            str(MODEL_DIR),
        ], check=True)
    if not SOURCE_VOCALS.exists():
        output = SOURCE_VOCALS.parent / "demucs"
        output.mkdir(parents=True, exist_ok=True)
        subprocess.run([
            sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", "htdemucs",
            "--out", str(output), str(SOURCE_CLIP),
        ], check=True)
        generated = output / "htdemucs" / SOURCE_CLIP.stem / "vocals.wav"
        SOURCE_VOCALS.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(generated, SOURCE_VOCALS)


def convert(reference, pitch, consent, progress=gr.Progress()):
    if not consent:
        raise gr.Error("请确认这是本人或已获授权的声音")
    if not reference:
        raise gr.Error("请先选择参考音色")
    with LOCK:
        progress(0.08, desc="准备歌声音色转换模型")
        prepare_runtime()
        with tempfile.TemporaryDirectory(prefix="echo-") as temp_name:
            temp = Path(temp_name)
            output = temp / "output"
            output.mkdir()
            progress(0.2, desc="提取参考音色")
            command = [
                sys.executable, str(MODEL_DIR / "inference.py"),
                "--source", str(SOURCE_VOCALS), "--target", str(reference),
                "--output", str(output), "--diffusion-steps", "35",
                "--length-adjust", "1.0", "--inference-cfg-rate", "0.7",
                "--f0-condition", "True", "--auto-f0-adjust", "False",
                "--semi-tone-shift", str(max(-12, min(12, int(pitch)))),
            ]
            progress(0.35, desc="转换歌声，首次运行会更慢")
            subprocess.run(command, cwd=MODEL_DIR, check=True, timeout=600)
            results = sorted(output.rglob("*.wav"), key=lambda path: path.stat().st_mtime, reverse=True)
            if not results:
                raise gr.Error("模型没有生成音频")
            final_path = Path(tempfile.gettempdir()) / f"echo-result-{os.urandom(6).hex()}.wav"
            shutil.copy2(results[0], final_path)
            progress(1, desc="生成完成")
            return str(final_path)


with gr.Blocks(title="回声歌声音色转换 API") as demo:
    gr.Markdown("# 回声 · 歌声音色转换服务\n此页面是 GitHub Pages 前端的国内推理后端，也可在这里直接测试。")
    with gr.Row():
        reference = gr.Audio(type="filepath", label="本人参考音色（15～30 秒）")
        result = gr.Audio(type="filepath", label="转换结果")
    pitch = gr.Slider(-12, 12, value=0, step=1, label="音高调整（半音）")
    consent = gr.Checkbox(label="这是本人或已获授权的声音")
    run = gr.Button("生成音色版本", variant="primary")
    run.click(convert, [reference, pitch, consent], result, api_name="convert")

demo.queue(default_concurrency_limit=1).launch(server_name="0.0.0.0", server_port=7860)
