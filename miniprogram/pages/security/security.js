const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

const app = getApp();

Page({
  data: {
    userInfo: {},
    avatarChar: '密',
    avatarColor: '#0284C7',
    stats: {},
    sm2Info: {},
    complianceList: [],
    loading: false,
  },

  onShow() {
    if (!app.checkLoginStatus()) {
      wx.reLaunch({ url: '/pages/auth/index' });
      return;
    }
    this.loadSecurityData();
  },

  onPullDownRefresh() {
    this.loadSecurityData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadSecurityData() {
    const user = api.getCurrentUser() || {};
    const name = user.nickname || user.username || '';

    this.setData({
      userInfo: user,
      avatarChar: util.getInitials(name),
      avatarColor: util.getAvatarColor(name),
    });

    try {
      const data = await api.getSecurityStats();
      this.setData({
        stats: data.stats || {},
        sm2Info: data.sm2 || {},
        complianceList: data.compliance || [],
      });
    } catch (e) {
      console.error('Load security stats error:', e);
    }
  },

  copyPublicKey() {
    const key = this.data.sm2Info.public_key || this.data.userInfo.sm2_public_key;
    if (key) {
      util.copyToClipboard(key, 'SM2 公钥已复制');
    }
  },

  goToDemo() {
    wx.switchTab({ url: '/pages/demo/demo' });
  },

  handleLogout() {
    wx.showModal({
      title: '确认退出登录',
      content: '退出登录后将关闭当前的加密 WebSocket 连接并清除本地令牌，是否确定？',
      confirmColor: '#DC2626',
      success: (res) => {
        if (res.confirm) {
          app.logout();
        }
      }
    });
  }
});
