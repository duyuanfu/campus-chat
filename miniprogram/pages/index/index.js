const api = require('../../utils/api.js');
const ws = require('../../utils/ws.js');
const util = require('../../utils/util.js');

const app = getApp();

Page({
  data: {
    conversations: [],
    pendingRequestsCount: 0,
    isWsConnected: false,
    loading: false,
  },

  onLoad() {
    this.handleNewMessage = this.handleNewMessage.bind(this);
    this.handleWsStatus = this.handleWsStatus.bind(this);
  },

  onShow() {
    if (!app.checkLoginStatus()) {
      wx.reLaunch({ url: '/pages/auth/index' });
      return;
    }

    this.setData({ isWsConnected: app.globalData.isWsConnected });

    ws.on('message', this.handleNewMessage);
    ws.on('ack', this.handleNewMessage);
    ws.on('open', this.handleWsStatus);
    ws.on('close', this.handleWsStatus);

    // 先应用本地全局最近消息缓存（毫秒级秒显）
    this.applyLocalRecentMessages();
    this.loadData(false);
  },

  applyLocalRecentMessages() {
    const recent = app.globalData.recentMessages || {};
    if (!this.data.conversations || this.data.conversations.length === 0) return;

    let changed = false;
    const convs = this.data.conversations.map((c) => {
      if (recent[c.friend_id]) {
        changed = true;
        return {
          ...c,
          last_message: recent[c.friend_id].last_message,
          last_time: recent[c.friend_id].last_time,
          formattedTime: util.formatTime(recent[c.friend_id].last_time),
          has_messages: true,
        };
      }
      return c;
    });

    if (changed) {
      convs.sort((a, b) => (b.last_time || '').localeCompare(a.last_time || ''));
      this.setData({ conversations: convs });
    }
  },

  onHide() {
    ws.off('message', this.handleNewMessage);
    ws.off('ack', this.handleNewMessage);
    ws.off('open', this.handleWsStatus);
    ws.off('close', this.handleWsStatus);
  },

  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  handleWsStatus() {
    this.setData({ isWsConnected: app.globalData.isWsConnected });
  },

  handleNewMessage(data) {
    // 收到新消息或已发送确认，就地更新会话列表
    if (data && (data.from || data.to)) {
      const fid = data.from === (app.globalData.userInfo && app.globalData.userInfo.id) ? data.to : data.from;
      if (!app.globalData.recentMessages) app.globalData.recentMessages = {};
      app.globalData.recentMessages[fid] = {
        last_message: data.content,
        last_time: data.created_at,
      };
      this.applyLocalRecentMessages();
    }
    this.loadData(false);
  },

  async loadData(showLoading = true) {
    if (showLoading) this.setData({ loading: true });
    try {
      const [convs, requests] = await Promise.all([
        api.getConversations(),
        api.getFriendRequests(),
      ]);

      const formattedConvs = (convs || []).map((item) => {
        const name = item.nickname || item.username;
        return {
          ...item,
          avatarChar: util.getInitials(name),
          avatarColor: util.getAvatarColor(name),
          formattedTime: util.formatTime(item.last_time),
        };
      });

      this.setData({
        conversations: formattedConvs,
        pendingRequestsCount: (requests && requests.length) || 0,
        isWsConnected: app.globalData.isWsConnected,
      });
    } catch (e) {
      console.error('Load conversations error:', e);
    } finally {
      this.setData({ loading: false });
    }
  },

  openChat(e) {
    const friendId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({
      url: `/pages/chat/chat?friendId=${friendId}&name=${encodeURIComponent(name)}`,
    });
  },

  goToFriends() {
    wx.switchTab({ url: '/pages/friends/friends' });
  },

  goToSecurity() {
    wx.switchTab({ url: '/pages/security/security' });
  },
});
