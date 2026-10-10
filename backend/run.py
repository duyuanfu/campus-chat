"""启动入口：python run.py 即可启动服务。"""
import os
import sys
import uvicorn

# 确保 backend 目录在 sys.path 中，兼容各种执行路径
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, app_dir=current_dir)
