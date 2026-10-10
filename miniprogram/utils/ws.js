/**
 * 微信小程序 WebSocket 封装
 * 用于实时聊天消息推送与状态同步
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
  }

  // 获取 ws URL
  getWsUrl() {
    const host = api.getApiHost();
    const token = api.getToken();
    let wsHost = host.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsHost}/ws?token=${encodeURIComponent(token)}`;
  }

  connect() {
    const token = api.getToken();
    if (!token) return;
    if (this.isConnected || this.isConnecting) return;

    this.shouldReconnect = true;
    this.isConnecting = true;
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
      console.log('WebSocket connected');
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
        this.socketTask.send({
          data: JSON.stringify({ type: 'ping' }),
          fail: () => {}
        });
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
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      const token = api.getToken();
      if (token && this.shouldReconnect) {
        this.connect();
      }
    }, 3000);
  }

  send(toId, content) {
    if (!this.isConnected || !this.socketTask) {
      return false;
    }
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
  }

  close() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socketTask) {
      this.socketTask.close({});
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
