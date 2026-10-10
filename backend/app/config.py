"""全局配置。"""
import os

# 项目根目录（app/ 的上一级）
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# SQLite 数据库文件路径
DATABASE_PATH = os.path.join(BASE_DIR, "chat.db")

# 登录 token 有效期（秒），默认 7 天
TOKEN_EXPIRE_SECONDS = 7 * 24 * 3600
