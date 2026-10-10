const api = require('../../utils/api.js');
const ws = require('../../utils/ws.js');
const util = require('../../utils/util.js');

const app = getApp();

Page({
  data: {
    currentTab: 'login',
    isLoggedIn: false,
    currentUser: null,
    loggedAvatarChar: '',
    loggedAvatarColor: '#0284C7',

    loginForm: {
      username: '',
      password: '',
    },
    regForm: {
      username: '',
      nickname: '',
      password: '',
      confirmPassword: '',
    },

    submitting: false,
  },

  onLoad() {
    this.checkCurrentAuth();
  },

  onShow() {
    this.checkCurrentAuth();
  },

  checkCurrentAuth() {
    const token = api.getToken();
    const user = api.getCurrentUser();
    if (token && user) {
      const name = user.nickname || user.username || '';
      this.setData({
        isLoggedIn: true,
        currentUser: user,
        loggedAvatarChar: util.getInitials(name),
        loggedAvatarColor: util.getAvatarColor(name),
      });
    } else {
      this.setData({
        isLoggedIn: false,
        currentUser: null,
      });
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  onLoginInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`loginForm.${field}`]: e.detail.value,
    });
  },

  onRegInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`regForm.${field}`]: e.detail.value,
    });
  },

  async doLogin() {
    const { username, password } = this.data.loginForm;
    if (!username.trim()) {
      return wx.showToast({ title: '请输入用户名', icon: 'none' });
    }
    if (!password) {
      return wx.showToast({ title: '请输入密码', icon: 'none' });
    }

    this.setData({ submitting: true });
    try {
      const res = await api.login({ username: username.trim(), password });
      api.setToken(res.token);
      api.setCurrentUser(res.user);
      app.globalData.userInfo = res.user;

      // 建立 WebSocket
      ws.connect();

      wx.showToast({ title: '登录成功 (SM3校验通过)', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 600);
    } catch (err) {
      // 错误由 api 自动 toast
    } finally {
      this.setData({ submitting: false });
    }
  },

  async doRegister() {
    const { username, nickname, password, confirmPassword } = this.data.regForm;
    if (!username.trim() || username.length < 3) {
      return wx.showToast({ title: '用户名至少3位字符', icon: 'none' });
    }
    if (!password || password.length < 6) {
      return wx.showToast({ title: '密码至少6位字符', icon: 'none' });
    }
    if (password !== confirmPassword) {
      return wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
    }

    this.setData({ submitting: true });
    try {
      const res = await api.register({
        username: username.trim(),
        nickname: nickname.trim(),
        password,
      });

      api.setToken(res.token);
      api.setCurrentUser(res.user);
      app.globalData.userInfo = res.user;

      // 建立 WebSocket
      ws.connect();

      wx.showToast({ title: '注册成功，SM2密钥已生成', icon: 'success', duration: 2000 });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1000);
    } catch (err) {
      // 错误已由 api 提示
    } finally {
      this.setData({ submitting: false });
    }
  },

  goToHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  handleLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出登录将清除本地会话缓存并断开安全加密信道，是否继续？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
          this.checkCurrentAuth();
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  },
});
