/**
 * 校园安全聊天小程序 - 全局入口
 * 核心特色：采用国家密码管理局规范的 SM2 / SM3 / SM4 国密体系保护通信安全
 */

const api = require('./utils/api.js');
const ws = require('./utils/ws.js');

App({
  globalData: {
    userInfo: null,
    isWsConnected: false,
    activeChatFriendId: null, // 当前正在聊天的好友ID
  },

  onLaunch() {
    this.checkLoginStatus();

    // 监听 WebSocket 状态
    ws.on('open', () => {
      this.globalData.isWsConnected = true;
    });

    ws.on('close', () => {
      this.globalData.isWsConnected = false;
    });

    ws.on('error', () => {
      this.globalData.isWsConnected = false;
    });
  },

  checkLoginStatus() {
    const token = api.getToken();
    const user = api.getCurrentUser();
    if (token && user) {
      this.globalData.userInfo = user;
      // 自动建立 WebSocket 长连接
      ws.connect();
      // 验证 Token 在当前后端环境中是否有效
      api.getMe().then(latestUser => {
        if (latestUser) {
          this.globalData.userInfo = latestUser;
          api.setCurrentUser(latestUser);
        }
      }).catch(err => {
        // 如果后端服务换了环境或重置导致 Token 无效，自动平滑清理，防止死循环重连挂死
        console.warn('Current token invalid in this host:', err);
        ws.close();
        api.clearAuth();
        this.globalData.userInfo = null;
      });
      return true;
    }
    return false;
  },

  logout() {
    ws.close();
    api.clearAuth();
    this.globalData.userInfo = null;
    this.globalData.isWsConnected = false;
    wx.reLaunch({
      url: '/pages/auth/index'
    });
  }
});
