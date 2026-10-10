# 校园聊天后端（国密 SM2/SM3/SM4）

一个基于 **FastAPI + SQLite + 国密算法** 的校园聊天后端，提供用户注册/登录、好友管理、聊天消息（REST + WebSocket 实时）功能。

## 技术栈

| 组件 | 说明 |
| --- | --- |
| FastAPI | Web 框架 + 自动生成接口文档 |
| SQLite | 数据库（零配置，单文件） |
| SM3 | 国密哈希 —— 密码加盐哈希、消息完整性校验 |
| SM4 | 国密对称加密 —— 聊天消息内容加密（CBC + 随机 IV） |
| SM2 | 国密非对称加密/签名 —— 好友间会话密钥分发、登录 token 签名 |

## 安装

```bash
# 创建虚拟环境（可选但推荐）
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
```

## 运行

```bash
python run.py
# 或
uvicorn app.main:app --reload
```

启动后：
- 接口文档（可在线调试）：http://127.0.0.1:8000/docs
- WebSocket 地址：`ws://127.0.0.1:8000/ws?token=<登录token>`

## 国密算法如何被使用

1. **注册**：密码用 `SM3(salt + password)` 哈希后存储；同时为每个用户生成一对 **SM2 密钥**。
2. **登录**：校验 SM3 哈希，成功后签发 token —— token = `base64(payload) + "." + SM2签名`（用服务器的 SM2 私钥签名）。
3. **成为好友**：服务器生成一个随机的 **SM4 会话密钥**，分别用两人的 **SM2 公钥加密**后存入数据库（SM2 做密钥分发）。
4. **发消息**：用两人之间的 **SM4 会话密钥**加密消息内容（CBC 模式 + 随机 IV）入库，并保存明文的 **SM3 哈希**用于完整性校验。
5. **读消息**：用 SM4 会话密钥解密，再比对 SM3 哈希确认内容未被篡改。

> 说明：本项目为教学演示，私钥存放在服务端、由服务端完成加解密（“后端负责 SM2/SM3/SM4 调用”）。真正的端到端加密应由客户端持有私钥。

## 接口清单

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册，返回 token |
| POST | `/api/auth/login` | 登录，返回 token |
| GET | `/api/auth/me` | 当前用户信息（需 token） |

### 好友 `/api/friends`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/friends` | 好友列表 |
| POST | `/api/friends/request` | 发送好友申请 |
| GET | `/api/friends/requests` | 收到的好友申请 |
| POST | `/api/friends/requests/{id}/accept` | 同意申请 |
| POST | `/api/friends/requests/{id}/reject` | 拒绝申请 |
| DELETE | `/api/friends/{friend_id}` | 删除好友 |

### 消息 `/api/messages`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/messages` | 发送消息（加密入库） |
| GET | `/api/messages/{friend_id}` | 聊天记录（解密 + 完整性校验） |

### WebSocket `/ws`

连接：`/ws?token=<token>`

客户端发送：
```json
{"type": "send", "to": 2, "content": "你好"}
```

服务端推送给接收者：
```json
{"type": "message", "id": 1, "from": 1, "to": 2, "content": "你好", "created_at": "2026-10-08 12:00:00"}
```

## 快速体验

```bash
# 1. 启动服务
python run.py

# 2. 用 curl 注册两个用户
curl -X POST http://127.0.0.1:8000/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"alice\",\"password\":\"123456\",\"nickname\":\"爱丽丝\"}"
curl -X POST http://127.0.0.1:8000/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"bob\",\"password\":\"123456\",\"nickname\":\"鲍勃\"}"

# 3. 登录拿 token（记下返回的 token）
curl -X POST http://127.0.0.1:8000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"alice\",\"password\":\"123456\"}"

# 4. 带 token 发好友申请、同意、发消息……
```

也可以在浏览器打开 http://127.0.0.1:8000/docs 直接在线调试。

## 项目结构

```
campus-chat-backend/
├── run.py                # 启动入口
├── requirements.txt
├── app/
│   ├── main.py           # FastAPI 应用 + WebSocket
│   ├── config.py         # 配置
│   ├── database.py       # SQLite 连接与建表
│   ├── security.py       # SM2/SM3/SM4 封装 + token
│   ├── schemas.py        # Pydantic 模型
│   ├── deps.py           # 认证依赖
│   ├── services.py       # 业务逻辑（会话密钥、消息加解密）
│   └── routers/
│       ├── auth.py       # 注册/登录
│       ├── friends.py    # 好友管理
│       └── messages.py   # 消息
```
