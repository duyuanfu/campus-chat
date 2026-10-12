/**
 * 微信小程序 WebSocket 封装
 * 用于实时聊天消息推送与状态同步（带防并发泄露与重连熔断保护）
 */

const api = require('./api.js');

class ChatSocket {
  constructor() {
    this.socketTask = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.listeners = {};
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.shouldReconnect = true;
    this.reconnectCount = 0;
    this.MAX_RECONNECT = 4; // 最大重试次数，防止死循环拖垮小程序
  }

  getWsUrl() {
    const host = api.getApiHost();
    const token = api.getToken();
    let wsHost = host.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsHost}/ws?token=${encodeURIComponent(token)}`;
  }

  connect() {
    const token = api.getToken();
    if (!token) {
      this.close();
      return;
    }

    if (this.isConnected || this.isConnecting) return;

    this.shouldReconnect = true;
    this.isConnecting = true;

    // 清理可能遗留的旧 Socket 任务，防止超过微信并发上限
    if (this.socketTask) {
      try {
        this.socketTask.close({});
      } catch (e) {}
      this.socketTask = null;
    }

    const url = this.getWsUrl();

    this.socketTask = wx.connectSocket({
      url,
      header: {
        'content-type': 'application/json'
      },
      fail: (err) => {
        console.warn('WebSocket connect failed:', err);
        this.isConnecting = false;
        this.scheduleReconnect();
      }
    });

    this.socketTask.onOpen(() => {
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectCount = 0; // 重置重试计数
      console.log('WebSocket connected successfully');
      this.trigger('open', null);
      this.startHeartbeat();
    });

    this.socketTask.onMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        if (data.type === 'message') {
          this.trigger('message', data);
        } else if (data.type === 'ack') {
          this.trigger('ack', data);
        } else if (data.type === 'pong') {
          // 心跳正常回应
        } else if (data.type === 'error') {
          this.trigger('error', data);
        }
      } catch (e) {
        console.error('Parse ws msg error:', e);
      }
    });

    this.socketTask.onClose((res) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.stopHeartbeat();
      console.log('WebSocket closed:', res);
      this.trigger('close', res);

      // 如果是认证失效 (code 1008)，彻底停止重试，防止死循环
      if (res && (res.code === 1008 || String(res.reason).includes('token'))) {
        this.shouldReconnect = false;
        api.clearAuth();
        return;
      }

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.socketTask.onError((err) => {
      console.warn('WebSocket error:', err);
      this.isConnected = false;
      this.isConnecting = false;
      this.trigger('error', err);
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.socketTask) {
        try {
          this.socketTask.send({
            data: JSON.stringify({ type: 'ping' }),
            fail: () => {}
          });
        } catch (e) {}
      }
    }, 25000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  scheduleReconnect() {
    if (!this.shouldReconnect) return;
    if (this.reconnectCount >= this.MAX_RECONNECT) {
      console.warn('WebSocket reached max reconnect limit, stopping.');
      return;
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectCount++;

    this.reconnectTimer = setTimeout(() => {
      const token = api.getToken();
      if (token && this.shouldReconnect) {
        this.connect();
      }
    }, 3500);
  }

  send(toId, content) {
    if (!this.isConnected || !this.socketTask) {
      return false;
    }
    try {
      this.socketTask.send({
        data: JSON.stringify({
          type: 'send',
          to: Number(toId),
          content: String(content)
        }),
        fail: (err) => {
          console.warn('WS send failed:', err);
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  close() {
    this.shouldReconnect = false;
    this.reconnectCount = 0;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socketTask) {
      try {
        this.socketTask.close({});
      } catch (e) {}
      this.socketTask = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    if (!callback) {
      this.listeners[event] = [];
    } else {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  trigger(event, payload) {
    const list = this.listeners[event] || [];
    list.forEach(cb => {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }
}

const socketInstance = new ChatSocket();
module.exports = socketInstance;
