import cgi
import json
import mimetypes
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("SEED_VC_DIR", "/opt/seed-vc"))
SOURCE = Path(os.environ.get("ECHO_SOURCE_PATH", str(ROOT / "assets" / "go-beyond-clip.mp3")))
MAX_UPLOAD = 25 * 1024 * 1024


class EchoHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0].lstrip("/") or "index.html"
        return str((ROOT / clean).resolve())

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            ready = (MODEL_DIR / "inference.py").exists()
            return self.send_json(200, {"ok": True, "modelReady": ready, "engine": "Seed-VC SVC"})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/convert":
            return self.send_json(404, {"message": "接口不存在"})
        if not (MODEL_DIR / "inference.py").exists():
            return self.send_json(503, {"message": "歌声音色转换模型尚未部署"})
        if int(self.headers.get("Content-Length", "0")) > MAX_UPLOAD:
            return self.send_json(413, {"message": "参考音色不能超过 25 MB"})

        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": self.headers.get("Content-Type", ""),
        })
        if form.getfirst("consent") != "true":
            return self.send_json(400, {"message": "必须确认拥有该声音的使用权"})
        reference = form["reference"] if "reference" in form else None
        if reference is None or not getattr(reference, "file", None):
            return self.send_json(400, {"message": "缺少参考音色"})
        pitch = max(-12, min(12, int(form.getfirst("pitch", "0"))))

        with tempfile.TemporaryDirectory(prefix="echo-") as temp_name:
            temp = Path(temp_name)
            reference_path = temp / "reference.wav"
            output_dir = temp / "output"
            output_dir.mkdir()
            with reference_path.open("wb") as target:
                shutil.copyfileobj(reference.file, target)
            if reference_path.stat().st_size < 1024 or reference_path.read_bytes()[:4] != b"RIFF":
                return self.send_json(400, {"message": "参考音色不是有效 WAV 文件"})

            command = [
                sys.executable, str(MODEL_DIR / "inference.py"),
                "--source", str(SOURCE), "--target", str(reference_path),
                "--output", str(output_dir), "--diffusion-steps", "35",
                "--length-adjust", "1.0", "--inference-cfg-rate", "0.7",
                "--f0-condition", "True", "--auto-f0-adjust", "False",
                "--semi-tone-shift", str(pitch),
            ]
            try:
                subprocess.run(command, cwd=MODEL_DIR, check=True, timeout=600, capture_output=True, text=True)
            except subprocess.TimeoutExpired:
                return self.send_json(504, {"message": "生成超过 10 分钟，请稍后重试"})
            except subprocess.CalledProcessError as error:
                print(error.stderr, file=sys.stderr)
                return self.send_json(500, {"message": "模型生成失败，请查看服务日志"})

            outputs = sorted(output_dir.rglob("*.wav"), key=lambda path: path.stat().st_mtime, reverse=True)
            if not outputs:
                return self.send_json(500, {"message": "模型没有生成音频文件"})
            data = outputs[0].read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)


if __name__ == "__main__":
    mimetypes.add_type("audio/mpeg", ".mp3")
    port = int(os.environ.get("PORT", "5173"))
    print(f"Echo Studio: http://127.0.0.1:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), EchoHandler).serve_forever()
