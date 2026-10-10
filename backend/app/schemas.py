"""Pydantic 请求/响应模型（字段标题、说明均为中文，用于接口文档汉化）。"""
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, title="用户名", description="用户名（3-32 位）")
    password: str = Field(min_length=6, max_length=64, title="密码", description="密码（6-64 位）")
    nickname: str = Field(default="", max_length=32, title="昵称", description="昵称（可选）")


class LoginRequest(BaseModel):
    username: str = Field(title="用户名", description="用户名")
    password: str = Field(title="密码", description="密码")


class FriendRequestCreate(BaseModel):
    to_username: str = Field(title="对方用户名", description="对方的用户名")


class MessageCreate(BaseModel):
    to_id: int = Field(title="接收方 ID", description="接收方用户 ID")
    content: str = Field(min_length=1, max_length=5000, title="消息内容", description="消息内容")


class UserOut(BaseModel):
    id: int = Field(title="用户 ID", description="用户 ID")
    username: str = Field(title="用户名", description="用户名")
    nickname: str = Field(title="昵称", description="昵称")
    sm2_public_key: str = Field(title="SM2 公钥", description="SM2 公钥")


class FriendOut(BaseModel):
    id: int = Field(title="用户 ID", description="用户 ID")
    username: str = Field(title="用户名", description="用户名")
    nickname: str = Field(title="昵称", description="昵称")


class MessageOut(BaseModel):
    id: int = Field(title="消息 ID", description="消息 ID")
    sender_id: int = Field(title="发送者 ID", description="发送者 ID")
    receiver_id: int = Field(title="接收者 ID", description="接收者 ID")
    content: str = Field(title="消息内容", description="消息内容（服务端解密后的明文）")
    created_at: str = Field(title="发送时间", description="发送时间")
