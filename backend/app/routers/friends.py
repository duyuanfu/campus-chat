"""好友管理：好友列表、申请、同意/拒绝、删除。"""
from fastapi import APIRouter, Depends, HTTPException

from ..database import db
from ..deps import get_current_user
from ..schemas import FriendRequestCreate
from ..services import build_friendship_session, get_friendship

router = APIRouter(prefix="/api/friends", tags=["好友"])


def _get_user(conn, user_id):
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


@router.get("", summary="好友列表")
def list_friends(current_user: dict = Depends(get_current_user)):
    """获取当前用户的好友列表。"""
    uid = current_user["user_id"]
    with db() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.username, u.nickname
            FROM friendships f
            JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
            WHERE f.user_a = ? OR f.user_b = ?
            ORDER BY u.username
            """,
            (uid, uid, uid),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/search", summary="搜索用户")
def search_users(keyword: str = "", current_user: dict = Depends(get_current_user)):
    """根据用户名或昵称模糊搜索校园用户，并返回与当前用户的关系状态。"""
    uid = current_user["user_id"]
    kw = f"%{keyword.strip()}%"
    with db() as conn:
        rows = conn.execute(
            "SELECT id, username, nickname, sm2_public_key FROM users WHERE (username LIKE ? OR nickname LIKE ?) AND id != ? LIMIT 20",
            (kw, kw, uid),
        ).fetchall()
        result = []
        for r in rows:
            other_id = r["id"]
            is_friend = get_friendship(conn, uid, other_id) is not None
            pending_sent = conn.execute(
                "SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'",
                (uid, other_id),
            ).fetchone() is not None
            pending_received = conn.execute(
                "SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'",
                (other_id, uid),
            ).fetchone() is not None

            rel = "none"
            if is_friend:
                rel = "friend"
            elif pending_sent:
                rel = "pending_sent"
            elif pending_received:
                rel = "pending_received"

            result.append({
                "id": r["id"],
                "username": r["username"],
                "nickname": r["nickname"] or r["username"],
                "relation": rel,
            })
    return result


@router.post("/request", summary="发送好友申请")
def send_request(req: FriendRequestCreate, current_user: dict = Depends(get_current_user)):
    """发送好友申请。"""
    uid = current_user["user_id"]
    to_username = req.to_username.strip()
    with db() as conn:
        target = conn.execute(
            "SELECT * FROM users WHERE username = ?", (to_username,)
        ).fetchone()
        if target is None:
            raise HTTPException(status_code=404, detail="用户不存在")
        if target["id"] == uid:
            raise HTTPException(status_code=400, detail="不能添加自己为好友")
        if get_friendship(conn, uid, target["id"]) is not None:
            raise HTTPException(status_code=400, detail="你们已经是好友了")
        if conn.execute(
            "SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'",
            (uid, target["id"]),
        ).fetchone():
            raise HTTPException(status_code=400, detail="好友申请已发送，等待对方处理")
        if conn.execute(
            "SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'",
            (target["id"], uid),
        ).fetchone():
            raise HTTPException(status_code=400, detail="对方已向你发过申请，请直接同意")
        conn.execute(
            "INSERT INTO friend_requests (from_id, to_id) VALUES (?,?)",
            (uid, target["id"]),
        )
    return {"message": "申请已发送"}


@router.get("/requests", summary="收到的好友申请")
def list_requests(current_user: dict = Depends(get_current_user)):
    """获取收到的好友申请（待处理）。"""
    uid = current_user["user_id"]
    with db() as conn:
        rows = conn.execute(
            """
            SELECT fr.id, fr.from_id, fr.created_at, u.username, u.nickname
            FROM friend_requests fr
            JOIN users u ON u.id = fr.from_id
            WHERE fr.to_id = ? AND fr.status = 'pending'
            ORDER BY fr.id DESC
            """,
            (uid,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "from_id": r["from_id"],
            "from_username": r["username"],
            "from_nickname": r["nickname"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.post("/requests/{request_id}/accept", summary="同意好友申请")
def accept_request(request_id: int, current_user: dict = Depends(get_current_user)):
    """同意好友申请，建立好友关系并分发 SM4 会话密钥。"""
    uid = current_user["user_id"]
    with db() as conn:
        req = conn.execute(
            "SELECT * FROM friend_requests WHERE id = ?", (request_id,)
        ).fetchone()
        if req is None or req["to_id"] != uid:
            raise HTTPException(status_code=404, detail="申请不存在")
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail="该申请已处理")
        if get_friendship(conn, req["from_id"], req["to_id"]) is not None:
            raise HTTPException(status_code=400, detail="你们已经是好友了")
        from_user = _get_user(conn, req["from_id"])
        to_user = _get_user(conn, req["to_id"])
        # 生成 SM4 会话密钥，分别用双方 SM2 公钥加密后存储
        build_friendship_session(
            conn,
            from_user["id"], from_user["sm2_public_key"],
            to_user["id"], to_user["sm2_public_key"],
        )
        conn.execute(
            "UPDATE friend_requests SET status = 'accepted' WHERE id = ?", (request_id,)
        )
    return {"message": "已添加为好友"}


@router.post("/requests/{request_id}/reject", summary="拒绝好友申请")
def reject_request(request_id: int, current_user: dict = Depends(get_current_user)):
    """拒绝好友申请。"""
    uid = current_user["user_id"]
    with db() as conn:
        req = conn.execute(
            "SELECT * FROM friend_requests WHERE id = ?", (request_id,)
        ).fetchone()
        if req is None or req["to_id"] != uid:
            raise HTTPException(status_code=404, detail="申请不存在")
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail="该申请已处理")
        conn.execute(
            "UPDATE friend_requests SET status = 'rejected' WHERE id = ?", (request_id,)
        )
    return {"message": "已拒绝"}


@router.delete("/{friend_id}", summary="删除好友")
def remove_friend(friend_id: int, current_user: dict = Depends(get_current_user)):
    """删除好友。"""
    uid = current_user["user_id"]
    with db() as conn:
        f = get_friendship(conn, uid, friend_id)
        if f is None:
            raise HTTPException(status_code=404, detail="对方不是你的好友")
        conn.execute("DELETE FROM friendships WHERE id = ?", (f["id"],))
    return {"message": "已删除好友"}
