"""FastAPI 应用入口：注册路由、CORS、WebSocket 实时聊天、中文接口文档。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from .database import get_conn, init_db
from .routers import auth, friends, messages, security_demo
from .security import verify_token
from .services import store_message


init_db()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="校园聊天后端（国密 SM2/SM3/SM4）",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,    # 关闭默认英文文档，改用下面自定义的中文文档
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(friends.router)
app.include_router(messages.router)
app.include_router(security_demo.router)


# ------------------------- 中文接口文档 -------------------------
# 注入一段 JS，把 Swagger UI 自带的英文界面文字翻译成中文。
_ZH_TRANSLATION = """
<script>
(function () {
  var ZH = {
    // 顶部
    "Select a definition": "选择模型定义",
    "Select one": "请选择",
    "Authorize": "授权",
    "Logout": "退出登录",
    "Close": "关闭",
    "Available authorizations": "可用授权",
    "Authorization": "授权",
    "api_key": "API 密钥",
    // 操作区
    "Try it out": "试一试",
    "Cancel": "取消",
    "Execute": "执行",
    "Clear": "清空",
    "Request body": "请求体",
    "Parameters": "参数",
    "No parameters": "无参数",
    "Responses": "响应",
    "Response": "响应",
    "Server response": "服务器响应",
    "Server responses": "服务器响应",
    "Code": "状态码",
    "Details": "详情",
    "Description": "描述",
    "Links": "链接",
    "No links": "无链接",
    "Media type": "媒体类型",
    "Example Value": "示例值",
    "Schema": "模型",
    "Schemas": "模型",
    "Models": "模型",
    "Model": "模型",
    "Download": "下载",
    "Copy": "复制",
    "Copied": "已复制",
    "Expand all": "全部展开",
    "Collapse all": "全部折叠",
    "Default": "默认",
    "Deprecated": "已弃用",
    "deprecated": "已弃用",
    "Required": "必填",
    "Nullable": "可为空",
    "Send empty value": "发送空值",
    "Send an empty value": "发送空值",
    "Request URL": "请求地址",
    "Curl": "Curl",
    // 搜索
    "Filter by tag": "按标签过滤",
    "Search": "搜索",
    "No operations defined in spec!": "接口文档中未定义任何操作！"
  };

  function translate(node) {
    if (node.nodeType === 3) {           // 文本节点
      var t = node.nodeValue.trim();
      if (t && ZH.hasOwnProperty(t) && ZH[t] !== t) {
        node.nodeValue = node.nodeValue.replace(t, ZH[t]);
      }
    } else if (node.nodeType === 1) {    // 元素节点
      if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
      ["title", "placeholder", "aria-label"].forEach(function (attr) {
        var v = node.getAttribute && node.getAttribute(attr);
        if (v && ZH.hasOwnProperty(v)) {
          node.setAttribute(attr, ZH[v]);
        }
      });
      for (var i = 0; i < node.childNodes.length; i++) {
        translate(node.childNodes[i]);
      }
    }
  }

  function run() {
    translate(document.body);
    // Swagger UI 是异步渲染的，用 MutationObserver 持续翻译新出现的文字
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === 'characterData') {
          if (m.target.nodeType === 3) translate(m.target);
        } else {
          for (var i = 0; i < m.addedNodes.length; i++) translate(m.addedNodes[i]);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
</script>
"""


@app.get("/docs", include_in_schema=False)
async def custom_swagger_docs():
    """中文版 Swagger UI 接口文档。"""
    resp = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title="校园聊天后端 API 文档",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
    )
    body = resp.body.decode("utf-8")
    body = body.replace("</body>", _ZH_TRANSLATION + "\n</body>")
    return HTMLResponse(body)


@app.get("/", summary="服务信息")
def index():
    return {"名称": "校园聊天后端", "接口文档": "/docs", "WebSocket": "/ws?token=<token>"}


# ------------------------- WebSocket 实时聊天 -------------------------
# 在线连接表：user_id -> WebSocket
connections: dict[int, WebSocket] = {}


@app.websocket("/ws")
async def websocket_chat(websocket: WebSocket, token: str = Query(default="")):
    """实时聊天：连接时携带 ?token=<登录token>。"""
    payload = verify_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="未登录或 token 失效")
        return

    user_id = payload["user_id"]
    await websocket.accept()
    connections[user_id] = websocket
    try:
        while True:
            data = await websocket.receive_json()
            await _handle_ws_message(websocket, user_id, data)
    except WebSocketDisconnect:
        pass
    finally:
        connections.pop(user_id, None)


async def _handle_ws_message(websocket: WebSocket, user_id: int, data: dict):
    """处理客户端消息。

    客户端发：{"type": "send", "to": 2, "content": "你好"}
    服务端回：
      - 给发送者：{"type": "ack", ...同下}
      - 给接收者：{"type": "message", "id": 1, "from": 1, "to": 2, "content": "你好", "created_at": "..."}
    """
    msg_type = data.get("type")
    if msg_type == "ping":
        await websocket.send_json({"type": "pong"})
        return

    if msg_type != "send":
        await websocket.send_json({"type": "error", "message": "未知的消息类型"})
        return

    to_id = data.get("to")
    content = data.get("content", "")
    if not isinstance(to_id, int) or not isinstance(content, str) or not content:
        await websocket.send_json({"type": "error", "message": "参数错误：需要 to 和 content"})
        return

    conn = get_conn()
    try:
        sender = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if sender is None:
            await websocket.send_json({"type": "error", "message": "用户不存在"})
            return
        try:
            msg = store_message(conn, user_id, sender["sm2_private_key"], to_id, content)
        except ValueError as e:
            await websocket.send_json({"type": "error", "message": str(e)})
            return
        conn.commit()
    finally:
        conn.close()

    payload = {
        "type": "message",
        "id": msg["id"],
        "from": msg["sender_id"],
        "to": msg["receiver_id"],
        "content": msg["content"],
        "created_at": msg["created_at"],
    }
    await websocket.send_json({"type": "ack", **payload})

    target_ws = connections.get(to_id)
    if target_ws is not None:
        await target_ws.send_json(payload)
