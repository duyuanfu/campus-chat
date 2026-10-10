const api = require('../../utils/api.js');
const ws = require('../../utils/ws.js');
const util = require('../../utils/util.js');

const app = getApp();

Page({
  data: {
    friendId: null,
    friendName: '',
    currentUserId: null,

    myAvatarChar: '我',
    myAvatarColor: '#0284C7',
    friendAvatarChar: '友',
    friendAvatarColor: '#0D9488',

    messages: [],
    inputText: '',
    scrollToView: '',
  },

  onLoad(options) {
    const friendId = Number(options.friendId);
    const friendName = decodeURIComponent(options.name || '好友');

    wx.setNavigationBarTitle({
      title: friendName,
    });

    const currentUser = api.getCurrentUser();
    const myName = (currentUser && (currentUser.nickname || currentUser.username)) || '我';

    this.setData({
      friendId,
      friendName,
      currentUserId: currentUser ? currentUser.id : null,
      myAvatarChar: util.getInitials(myName),
      myAvatarColor: util.getAvatarColor(myName),
      friendAvatarChar: util.getInitials(friendName),
      friendAvatarColor: util.getAvatarColor(friendName),
    });

    app.globalData.activeChatFriendId = friendId;

    this.handleIncomingMessage = this.handleIncomingMessage.bind(this);
    this.handleAckMessage = this.handleAckMessage.bind(this);

    ws.on('message', this.handleIncomingMessage);
    ws.on('ack', this.handleAckMessage);

    this.loadHistory();
  },

  onUnload() {
    app.globalData.activeChatFriendId = null;
    ws.off('message', this.handleIncomingMessage);
    ws.off('ack', this.handleAckMessage);
  },

  async loadHistory() {
    try {
      const list = await api.getMessages(this.data.friendId);
      const formatted = (list || []).reverse().map((m) => ({
        ...m,
        formattedTime: util.formatTime(m.created_at),
      }));

      this.setData({ messages: formatted }, () => {
        this.scrollToBottom();
      });
    } catch (e) {
      console.error('Load chat history error:', e);
    }
  },

  scrollToBottom() {
    setTimeout(() => {
      this.setData({
        scrollToView: 'scroll-bottom-anchor',
      });
    }, 100);
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  async handleSend() {
    const content = this.data.inputText.trim();
    if (!content) return;

    const now = new Date();
    const pad = (n) => (n < 10 ? '0' + n : n);
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const tempId = 'temp_' + Date.now();

    // 乐观更新：本地立即展示
    const optimisticMsg = {
      id: tempId,
      sender_id: this.data.currentUserId,
      receiver_id: this.data.friendId,
      content: content,
      created_at: timeStr,
      formattedTime: util.formatTime(timeStr),
    };

    const updatedMsgs = [...this.data.messages, optimisticMsg];
    this.setData({
      messages: updatedMsgs,
      inputText: '',
    }, () => {
      this.scrollToBottom();
    });

    // 缓存最近一条消息
    if (!app.globalData.recentMessages) app.globalData.recentMessages = {};
    app.globalData.recentMessages[this.data.friendId] = {
      last_message: content,
      last_time: timeStr,
    };

    // 优先尝试 WebSocket 发送
    const sentViaWs = ws.send(this.data.friendId, content);

    if (!sentViaWs) {
      try {
        const res = await api.sendMessage(this.data.friendId, content);
        const finalMsgs = this.data.messages.map((m) => {
          if (m.id === tempId) {
            return { ...m, id: res.id };
          }
          return m;
        });
        this.setData({ messages: finalMsgs });
      } catch (err) {
        console.warn('REST send failed:', err);
      }
    }
  },

  handleIncomingMessage(data) {
    if (data.from === this.data.friendId) {
      const newMsg = {
        id: data.id,
        sender_id: data.from,
        receiver_id: data.to,
        content: data.content,
        created_at: data.created_at,
        formattedTime: util.formatTime(data.created_at),
      };

      if (!app.globalData.recentMessages) app.globalData.recentMessages = {};
      app.globalData.recentMessages[this.data.friendId] = {
        last_message: data.content,
        last_time: data.created_at,
      };

      const msgs = [...this.data.messages, newMsg];
      this.setData({ messages: msgs }, () => {
        this.scrollToBottom();
      });
    }
  },

  handleAckMessage(data) {
    if (data.to === this.data.friendId) {
      let replaced = false;
      const msgs = this.data.messages.map((m) => {
        if (typeof m.id === 'string' && m.id.startsWith('temp_') && m.content === data.content) {
          replaced = true;
          return {
            ...m,
            id: data.id,
            created_at: data.created_at,
            formattedTime: util.formatTime(data.created_at),
          };
        }
        return m;
      });

      if (!replaced) {
        const exists = msgs.some((m) => m.id === data.id);
        if (!exists) {
          msgs.push({
            id: data.id,
            sender_id: data.from,
            receiver_id: data.to,
            content: data.content,
            created_at: data.created_at,
            formattedTime: util.formatTime(data.created_at),
          });
        }
      }

      this.setData({ messages: msgs }, () => {
        this.scrollToBottom();
      });
    }
  },
});
