"""聊天消息：REST 发送 + 历史记录（实时推送走 WebSocket）。"""
from fastapi import APIRouter, Depends, HTTPException

from ..database import db
from ..deps import get_current_user
from ..schemas import MessageCreate
from ..security import sm3_hash
from ..services import decrypt_message, get_friendship, get_session_key, store_message

router = APIRouter(prefix="/api/messages", tags=["消息"])


@router.get("/conversations", summary="最近会话列表")
def get_conversations(current_user: dict = Depends(get_current_user)):
    """获取当前用户所有好友的最近聊天会话列表（包含解密后的最新一条消息与时间）。"""
    uid = current_user["user_id"]
    with db() as conn:
        me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        friend_rows = conn.execute(
            """
            SELECT u.id, u.username, u.nickname
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
            WHERE f.user_a = ? OR f.user_b = ?
            ORDER BY u.username
            """,
            (uid, uid, uid),
        ).fetchall()

        conversations = []
        for friend in friend_rows:
            fid = friend["id"]
            f = get_friendship(conn, uid, fid)
            last_msg_row = conn.execute(
                """
                SELECT * FROM messages
                WHERE (sender_id = ? AND receiver_id = ?)
                   OR (sender_id = ? AND receiver_id = ?)
                ORDER BY id DESC
                LIMIT 1
                """,
                (uid, fid, fid, uid),
            ).fetchone()

            last_msg_content = "暂无消息，基于国密SM4加密"
            last_msg_time = ""
            has_messages = False
            if last_msg_row and f:
                try:
                    session_key = get_session_key(f, uid, me["sm2_private_key"])
                    last_msg_content = decrypt_message(session_key, last_msg_row["ciphertext"], last_msg_row["iv"])
                    last_msg_time = last_msg_row["created_at"]
                    has_messages = True
                except Exception:
                    last_msg_content = "[国密密文解密失败]"
                    last_msg_time = last_msg_row["created_at"]

            conversations.append({
                "friend_id": fid,
                "username": friend["username"],
                "nickname": friend["nickname"] or friend["username"],
                "last_message": last_msg_content,
                "last_time": last_msg_time,
                "has_messages": has_messages,
            })

        # 按最后一条消息时间排序，有新消息的排在前面
        conversations.sort(key=lambda x: x["last_time"], reverse=True)
    return conversations


@router.post("", summary="发送消息")
def send_message(req: MessageCreate, current_user: dict = Depends(get_current_user)):
    """发送消息（持久化加密入库）。实时推送请使用 WebSocket /ws。"""
    uid = current_user["user_id"]
    with db() as conn:
        sender = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if conn.execute("SELECT id FROM users WHERE id = ?", (req.to_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="接收方不存在")
        try:
            return store_message(conn, uid, sender["sm2_private_key"], req.to_id, req.content)
        except ValueError as e:
            raise HTTPException(status_code=403, detail=str(e))


@router.get("/{friend_id}", summary="聊天记录")
def history(friend_id: int, current_user: dict = Depends(get_current_user), limit: int = 40):
    """获取与某好友的聊天记录（默认拉取最近40条，解密为明文并校验完整性）。"""
    uid = current_user["user_id"]
    with db() as conn:
        me = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        f = get_friendship(conn, uid, friend_id)
        if f is None:
            raise HTTPException(status_code=403, detail="你们还不是好友")
        session_key = get_session_key(f, uid, me["sm2_private_key"])
        rows = conn.execute(
            """
            SELECT * FROM messages
            WHERE (sender_id = ? AND receiver_id = ?)
               OR (sender_id = ? AND receiver_id = ?)
            ORDER BY id DESC
            LIMIT ?
            """,
            (uid, friend_id, friend_id, uid, limit),
        ).fetchall()
    result = []
    for r in rows:
        content = decrypt_message(session_key, r["ciphertext"], r["iv"])
        result.append(
            {
                "id": r["id"],
                "sender_id": r["sender_id"],
                "receiver_id": r["receiver_id"],
                "content": content,
                "created_at": r["created_at"],
                "ciphertext": r["ciphertext"],
                "iv": r["iv"],
                "sm3_hash": r["sm3_hash"],
                "integrity_ok": sm3_hash(content.encode("utf-8")) == r["sm3_hash"],
            }
        )
    return result
