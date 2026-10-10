"""业务逻辑公共函数：好友关系、会话密钥、消息加解密。"""
import os

from .security import (
    generate_sm4_key,
    sm2_decrypt,
    sm2_encrypt,
    sm3_hash,
    sm4_decrypt,
    sm4_encrypt,
)


def get_friendship(conn, u1: int, u2: int):
    """按约定的 user_a < user_b 查找好友关系。"""
    a, b = (u1, u2) if u1 < u2 else (u2, u1)
    return conn.execute(
        "SELECT * FROM friendships WHERE user_a = ? AND user_b = ?", (a, b)
    ).fetchone()


# 会话密钥内存缓存：(friendship_id, user_id) -> session_key bytes
# 避免高频消息交互时重复进行高耗时的 SM2 椭圆曲线非对称解密运算，极大提升吞吐与即时响应性能
_SESSION_KEY_CACHE = {}


def get_session_key(friendship, user_id: int, private_key: str) -> bytes:
    """用当前用户的 SM2 私钥解密出与好友之间的 SM4 会话密钥（带内存加速缓存）。"""
    cache_key = (friendship["id"], user_id)
    if cache_key in _SESSION_KEY_CACHE:
        return _SESSION_KEY_CACHE[cache_key]

    enc = (
        friendship["session_key_a"]
        if friendship["user_a"] == user_id
        else friendship["session_key_b"]
    )
    key = sm2_decrypt(private_key, bytes.fromhex(enc))
    _SESSION_KEY_CACHE[cache_key] = key
    return key


def build_friendship_session(conn, ua_id: int, ua_pub: str, ub_id: int, ub_pub: str):
    """建立好友关系时，生成一个 SM4 会话密钥，并分别用双方 SM2 公钥加密后存储。"""
    session_key = generate_sm4_key()
    enc_a = sm2_encrypt(ua_pub, session_key).hex()
    enc_b = sm2_encrypt(ub_pub, session_key).hex()
    a, b = (ua_id, ub_id) if ua_id < ub_id else (ub_id, ua_id)
    # 注意：enc_a 必须对应 user_a 一侧
    if a == ua_id:
        ka, kb = enc_a, enc_b
    else:
        ka, kb = enc_b, enc_a
    conn.execute(
        "INSERT INTO friendships (user_a, user_b, session_key_a, session_key_b) VALUES (?,?,?,?)",
        (a, b, ka, kb),
    )


def encrypt_message(session_key: bytes, plaintext: str):
    """SM4 加密消息内容，返回 (密文 hex, IV hex, 明文 SM3 哈希)。"""
    data = plaintext.encode("utf-8")
    iv = os.urandom(16)
    ciphertext = sm4_encrypt(session_key, data, iv)
    return ciphertext.hex(), iv.hex(), sm3_hash(data)


def decrypt_message(session_key: bytes, ciphertext_hex: str, iv_hex: str) -> str:
    """SM4 解密消息内容，返回明文。"""
    return sm4_decrypt(
        session_key, bytes.fromhex(ciphertext_hex), bytes.fromhex(iv_hex)
    ).decode("utf-8")


def store_message(conn, sender_id: int, sender_private_key: str, receiver_id: int, content: str) -> dict:
    """校验好友关系后，加密消息并入库，返回消息记录 dict；出错抛 ValueError。"""
    f = get_friendship(conn, sender_id, receiver_id)
    if f is None:
        raise ValueError("你们还不是好友")
    session_key = get_session_key(f, sender_id, sender_private_key)
    ciphertext, iv, sm3h = encrypt_message(session_key, content)
    cur = conn.execute(
        "INSERT INTO messages (sender_id, receiver_id, ciphertext, iv, sm3_hash) VALUES (?,?,?,?,?)",
        (sender_id, receiver_id, ciphertext, iv, sm3h),
    )
    row = conn.execute("SELECT * FROM messages WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {
        "id": row["id"],
        "sender_id": row["sender_id"],
        "receiver_id": row["receiver_id"],
        "content": content,
        "created_at": row["created_at"],
    }
