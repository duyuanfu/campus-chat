/**
 * API 网络请求模块与接口统一管理
 */

const DEFAULT_HOST = 'http://127.0.0.1:8000';
const STORAGE_KEY_HOST = 'cc_api_host';
const STORAGE_KEY_TOKEN = 'cc_token';
const STORAGE_KEY_USER = 'cc_current_user';

function getApiHost() {
  return wx.getStorageSync(STORAGE_KEY_HOST) || DEFAULT_HOST;
}

function setApiHost(host) {
  let cleaned = (host || DEFAULT_HOST).trim().replace(/\/+$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'http://' + cleaned;
  }
  wx.setStorageSync(STORAGE_KEY_HOST, cleaned);
  return cleaned;
}

function getToken() {
  return wx.getStorageSync(STORAGE_KEY_TOKEN) || '';
}

function setToken(token) {
  wx.setStorageSync(STORAGE_KEY_TOKEN, token || '');
}

function getCurrentUser() {
  return wx.getStorageSync(STORAGE_KEY_USER) || null;
}

function setCurrentUser(user) {
  wx.setStorageSync(STORAGE_KEY_USER, user || null);
}

function clearAuth() {
  wx.removeStorageSync(STORAGE_KEY_TOKEN);
  wx.removeStorageSync(STORAGE_KEY_USER);
}

function request(urlPath, method = 'GET', data = null, options = {}) {
  const host = getApiHost();
  const token = getToken();
  const url = `${host}${urlPath}`;

  if (options.loading === true) {
    wx.showLoading({ title: options.loadingTitle || '加载中...', mask: false });
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 8000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          clearAuth();
          wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/auth/index' });
          }, 800);
          reject(new Error('未登录或登录已失效'));
        } else {
          const detail = (res.data && res.data.detail) || (res.data && res.data.message) || `请求失败 (${res.statusCode})`;
          if (options.showError !== false) {
            wx.showToast({ title: String(detail), icon: 'none', duration: 2500 });
          }
          reject(new Error(detail));
        }
      },
      fail(err) {
        const msg = err.errMsg && err.errMsg.includes('fail') ? '网络连接失败，请检查后端服务是否启动' : (err.errMsg || '网络请求错误');
        if (options.showError !== false) {
          wx.showToast({ title: msg, icon: 'none', duration: 2500 });
        }
        reject(err);
      },
      complete() {
        if (options.loading === true) {
          wx.hideLoading();
        }
      }
    });
  });
}

// 接口列表
const api = {
  getApiHost,
  setApiHost,
  getToken,
  setToken,
  getCurrentUser,
  setCurrentUser,
  clearAuth,

  // 1. 认证
  login: (data) => request('/api/auth/login', 'POST', data),
  register: (data) => request('/api/auth/register', 'POST', data),
  getMe: () => request('/api/auth/me', 'GET', null, { loading: false, showError: false }),

  // 2. 消息与会话
  getConversations: () => request('/api/messages/conversations', 'GET', null, { loading: false }),
  getMessages: (friendId) => request(`/api/messages/${friendId}`, 'GET', null, { loading: false }),
  sendMessage: (toId, content) => request('/api/messages', 'POST', { to_id: toId, content }, { loading: false }),

  // 3. 好友
  getFriends: () => request('/api/friends', 'GET', null, { loading: false }),
  searchUsers: (keyword) => request(`/api/friends/search?keyword=${encodeURIComponent(keyword)}`, 'GET', null, { loading: false }),
  sendFriendRequest: (toUsername) => request('/api/friends/request', 'POST', { to_username: toUsername }),
  getFriendRequests: () => request('/api/friends/requests', 'GET', null, { loading: false }),
  acceptFriendRequest: (id) => request(`/api/friends/requests/${id}/accept`, 'POST'),
  rejectFriendRequest: (id) => request(`/api/friends/requests/${id}/reject`, 'POST'),
  deleteFriend: (friendId) => request(`/api/friends/${friendId}`, 'DELETE'),

  // 4. 安全与演示
  getSecurityStats: () => request('/api/security/stats', 'GET', null, { loading: false, showError: false }),
  runCryptoDemo: (content) => request('/api/security/demo', 'POST', { content }, { loading: false, showError: false }),
};

module.exports = api;
