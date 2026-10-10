"""用户注册 / 登录 / 当前用户信息。"""
import os

from fastapi import APIRouter, Depends, HTTPException

from ..database import db
from ..deps import get_current_user
from ..schemas import LoginRequest, RegisterRequest
from ..security import create_token, generate_sm2_keypair, sm3_hash

router = APIRouter(prefix="/api/auth", tags=["认证"])


def _user_dict(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "nickname": row["nickname"],
        "sm2_public_key": row["sm2_public_key"],
    }


@router.post("/register", summary="用户注册")
def register(req: RegisterRequest):
    """注册：SM3(salt + password) 存密码，并为用户生成一对 SM2 密钥。"""
    username = req.username.strip()
    with db() as conn:
        if conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
            raise HTTPException(status_code=400, detail="用户名已存在")
        salt = os.urandom(16).hex()
        password_hash = sm3_hash((salt + req.password).encode())
        private_key, public_key = generate_sm2_keypair()
        cur = conn.execute(
            "INSERT INTO users (username, nickname, password_hash, salt, sm2_private_key, sm2_public_key) "
            "VALUES (?,?,?,?,?,?)",
            (username, req.nickname, password_hash, salt, private_key, public_key),
        )
        user_id = cur.lastrowid
    token = create_token(user_id, username)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "username": username,
            "nickname": req.nickname,
            "sm2_public_key": public_key,
        },
    }


@router.post("/login", summary="用户登录")
def login(req: LoginRequest):
    """登录：校验 SM3 密码哈希，签发 SM2 签名 token。"""
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (req.username.strip(),)
        ).fetchone()
        if row is None or sm3_hash((row["salt"] + req.password).encode()) != row["password_hash"]:
            raise HTTPException(status_code=400, detail="用户名或密码错误")
        token = create_token(row["id"], row["username"])
        return {"token": token, "user": _user_dict(row)}


@router.get("/me", summary="获取当前用户信息")
def me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息。"""
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE id = ?", (current_user["user_id"],)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return _user_dict(row)
