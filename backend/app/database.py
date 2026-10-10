"""SQLite 数据库连接与建表。"""
import sqlite3
from contextlib import contextmanager

from . import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT UNIQUE NOT NULL,
    nickname        TEXT DEFAULT '',
    password_hash   TEXT NOT NULL,          -- SM3(salt + password)
    salt            TEXT NOT NULL,
    sm2_private_key TEXT NOT NULL,          -- 用户 SM2 私钥（hex）
    sm2_public_key  TEXT NOT NULL,          -- 用户 SM2 公钥（hex）
    created_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS friend_requests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    INTEGER NOT NULL,
    to_id      INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',  -- pending / accepted / rejected
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS friendships (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a        INTEGER NOT NULL,   -- 约定 user_a < user_b，避免重复
    user_b        INTEGER NOT NULL,
    session_key_a TEXT NOT NULL,      -- SM2(公钥A) 加密后的 SM4 会话密钥
    session_key_b TEXT NOT NULL,      -- SM2(公钥B) 加密后的 SM4 会话密钥
    created_at    TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    ciphertext  TEXT NOT NULL,        -- SM4 加密后的消息内容（hex）
    iv          TEXT NOT NULL,        -- SM4-CBC 的随机 IV（hex）
    sm3_hash    TEXT NOT NULL,        -- 明文的 SM3 哈希，用于完整性校验
    created_at  TEXT DEFAULT (datetime('now','localtime'))
);
"""


def get_conn():
    conn = sqlite3.connect(config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db():
    """事务上下文：正常提交，异常回滚。"""
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    conn = get_conn()
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()
