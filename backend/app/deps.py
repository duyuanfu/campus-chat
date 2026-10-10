"""FastAPI 依赖：从请求头解析并校验登录 token。"""
from fastapi import Header, HTTPException

from .security import verify_token


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    """校验 `Authorization: Bearer <token>`，返回 token 中的 payload。"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录，请先登录")
    payload = verify_token(authorization[len("Bearer "):])
    if payload is None:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    return payload
