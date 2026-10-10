"""国密算法封装：SM2 / SM3 / SM4，以及基于 SM2 签名的登录 token。

在本项目中的分工：
- SM3：哈希 —— 用于「密码加盐哈希」和「消息完整性校验」
- SM4：对称加密 —— 用于「聊天消息内容加密」（CBC 模式 + 随机 IV）
- SM2：非对称加密/签名 —— 用于「好友间会话密钥分发」和「登录 token 签名」
"""
import base64
import json
import os
import time

from gmssl import func, sm2, sm3, sm4

from . import config


# ============================= SM3 =============================
def sm3_hash(data: bytes) -> str:
    """SM3 哈希，返回十六进制字符串。"""
    return sm3.sm3_hash(func.bytes_to_list(data))


# ============================= SM4 =============================
def _pkcs7_pad(data: bytes, block_size: int = 16) -> bytes:
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len]) * pad_len


def _pkcs7_unpad(data: bytes) -> bytes:
    if not data:
        return data
    pad_len = data[-1]
    if pad_len < 1 or pad_len > 16:
        return data
    return data[:-pad_len]


def generate_sm4_key() -> bytes:
    """生成随机 SM4 会话密钥（16 字节）。"""
    return os.urandom(16)


def sm4_encrypt(key: bytes, plaintext: bytes, iv: bytes) -> bytes:
    """SM4-CBC 加密（gmssl 库已自动处理 PKCS7 填充）。"""
    c = sm4.CryptSM4()
    c.set_key(key, sm4.SM4_ENCRYPT)
    return c.crypt_cbc(iv, plaintext)


def sm4_decrypt(key: bytes, ciphertext: bytes, iv: bytes) -> bytes:
    """SM4-CBC 解密（gmssl 库已自动去除 PKCS7 填充）。"""
    c = sm4.CryptSM4()
    c.set_key(key, sm4.SM4_DECRYPT)
    return c.crypt_cbc(iv, ciphertext)


# ============================= SM2 =============================
def generate_sm2_keypair():
    """生成 SM2 密钥对，返回 (私钥 hex, 公钥 hex)。"""
    c = sm2.CryptSM2(private_key="", public_key="")
    private_key = func.random_hex(c.para_len)  # 64 位 hex
    public_key = c._kg(int(private_key, 16), c.ecc_table["g"])  # 128 位 hex
    return private_key, public_key


def sm2_encrypt(public_key_hex: str, data: bytes) -> bytes:
    """用对方公钥加密（用于分发 SM4 会话密钥）。"""
    c = sm2.CryptSM2(public_key=public_key_hex, private_key="")
    return c.encrypt(data)


def sm2_decrypt(private_key_hex: str, data: bytes) -> bytes:
    """用自己私钥解密。"""
    c = sm2.CryptSM2(public_key="", private_key=private_key_hex)
    return c.decrypt(data)


def sm2_sign(private_key_hex: str, data: bytes) -> str:
    """SM2 签名，返回十六进制签名字符串。"""
    c = sm2.CryptSM2(public_key="", private_key=private_key_hex)
    k = func.random_hex(c.para_len)
    return c.sign(data, k)


def sm2_verify(public_key_hex: str, signature_hex: str, data: bytes) -> bool:
    """SM2 验签。"""
    c = sm2.CryptSM2(public_key=public_key_hex, private_key="")
    return c.verify(signature_hex, data)


# ========================= 服务器密钥对 =========================
# 服务器用一对固定的 SM2 密钥来签发/校验登录 token，持久化到本地文件，重启后 token 仍有效。
_SERVER_KEY_FILE = os.path.join(config.BASE_DIR, "server_key.json")


def get_server_keypair():
    """获取（不存在则生成并持久化）服务器的 SM2 密钥对。"""
    if os.path.exists(_SERVER_KEY_FILE):
        with open(_SERVER_KEY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data["private_key"], data["public_key"]
    private_key, public_key = generate_sm2_keypair()
    with open(_SERVER_KEY_FILE, "w", encoding="utf-8") as f:
        json.dump({"private_key": private_key, "public_key": public_key}, f)
    return private_key, public_key


# ========================= Token =========================
def create_token(user_id: int, username: str) -> str:
    """签发登录 token：base64(payload) + "." + SM2签名。"""
    payload = json.dumps(
        {
            "user_id": user_id,
            "username": username,
            "exp": int(time.time()) + config.TOKEN_EXPIRE_SECONDS,
        },
        separators=(",", ":"),
    )
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    private_key, _ = get_server_keypair()
    signature = sm2_sign(private_key, payload_b64.encode())
    return f"{payload_b64}.{signature}"


def verify_token(token: str):
    """校验 token，成功返回 payload dict，失败返回 None。"""
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError:
        return None
    _, public_key = get_server_keypair()
    if not sm2_verify(public_key, signature, payload_b64.encode()):
        return None
    padding = "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding))
    if payload.get("exp", 0) < time.time():
        return None
    return payload
