const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

const app = getApp();

Page({
  data: {
    friends: [],
    requests: [],
    searchKeyword: '',
    searchResults: [],
    searching: false,
    searchDebounceTimer: null,
  },

  onShow() {
    if (!app.checkLoginStatus()) {
      wx.reLaunch({ url: '/pages/auth/index' });
      return;
    }
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadData() {
    try {
      const [friendsList, reqsList] = await Promise.all([
        api.getFriends(),
        api.getFriendRequests(),
      ]);

      const formattedFriends = (friendsList || []).map((f) => {
        const name = f.nickname || f.username;
        return {
          ...f,
          avatarChar: util.getInitials(name),
          avatarColor: util.getAvatarColor(name),
        };
      });

      const formattedReqs = (reqsList || []).map((r) => {
        const name = r.from_nickname || r.from_username;
        return {
          ...r,
          avatarChar: util.getInitials(name),
          avatarColor: util.getAvatarColor(name),
          formattedTime: util.formatTime(r.created_at),
        };
      });

      this.setData({
        friends: formattedFriends,
        requests: formattedReqs,
      });
    } catch (e) {
      console.error('Load friends data failed:', e);
    }
  },

  onSearchInput(e) {
    const val = e.detail.value;
    this.setData({ searchKeyword: val });

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    if (!val.trim()) {
      this.setData({ searchResults: [], searching: false });
      return;
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.handleSearch();
    }, 400);
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      searching: false,
    });
  },

  async handleSearch() {
    const kw = this.data.searchKeyword.trim();
    if (!kw) return;

    this.setData({ searching: true });
    try {
      const list = await api.searchUsers(kw);
      const formatted = (list || []).map((u) => {
        const name = u.nickname || u.username;
        return {
          ...u,
          avatarChar: util.getInitials(name),
          avatarColor: util.getAvatarColor(name),
        };
      });
      this.setData({ searchResults: formatted });
    } catch (e) {
      console.error('Search user error:', e);
    } finally {
      this.setData({ searching: false });
    }
  },

  async sendFriendReq(e) {
    const username = e.currentTarget.dataset.username;
    try {
      await api.sendFriendRequest(username);
      wx.showToast({ title: '好友申请已发送', icon: 'success' });
      this.handleSearch(); // 刷新搜索结果状态
    } catch (e) {
      // 错误由 api 提示
    }
  },

  async acceptReq(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.acceptFriendRequest(id);
      wx.showToast({ title: '已通过，SM4密钥已就绪', icon: 'success', duration: 1500 });
      this.loadData();
    } catch (e) {
      // 错误由 api 提示
    }
  },

  async rejectReq(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await api.rejectFriendRequest(id);
      wx.showToast({ title: '已忽略该申请', icon: 'none' });
      this.loadData();
    } catch (e) {
      // 错误由 api 提示
    }
  },

  chatWithFriend(e) {
    const friendId = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({
      url: `/pages/chat/chat?friendId=${friendId}&name=${encodeURIComponent(name)}`,
    });
  },

  showFriendMenu(e) {
    const { id, name, username } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: [`给 ${name} 发送加密消息`, `复制学号/用户名 (${username})`, '删除该好友'],
      itemColor: '#0F172A',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chatWithFriend(e);
        } else if (res.tapIndex === 1) {
          util.copyToClipboard(username, '学号已复制');
        } else if (res.tapIndex === 2) {
          this.confirmDeleteFriend(id, name);
        }
      }
    });
  },

  confirmDeleteFriend(friendId, name) {
    wx.showModal({
      title: '确认删除好友',
      content: `确定要删除好友【${name}】吗？删除后将销毁双方协商的 SM4 会话密钥。`,
      confirmColor: '#DC2626',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteFriend(friendId);
            wx.showToast({ title: '已删除好友', icon: 'success' });
            this.loadData();
          } catch (e) {
            // 错误由 api 提示
          }
        }
      }
    });
  }
});
