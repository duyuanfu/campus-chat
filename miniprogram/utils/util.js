/**
 * 常用工具函数
 */

function formatTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr.replace(/-/g, '/'));
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;

  const isToday = now.toDateString() === date.toDateString();
  const pad = (n) => (n < 10 ? '0' + n : n);
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (isToday) return timeStr;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) {
    return `昨天 ${timeStr}`;
  }

  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  if (now.getFullYear() === date.getFullYear()) {
    return `${month}-${day} ${timeStr}`;
  }

  return `${date.getFullYear()}-${month}-${day}`;
}

function formatKeyShort(hex, keep = 8) {
  if (!hex || typeof hex !== 'string') return '';
  if (hex.length <= keep * 2) return hex;
  return `${hex.slice(0, keep)}...${hex.slice(-keep)}`;
}

const AVATAR_COLORS = [
  '#2563EB', '#0D9488', '#0284C7', '#4F46E5', '#7C3AED',
  '#C026D3', '#DB2777', '#EA580C', '#059669', '#16A34A'
];

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name) {
  if (!name) return '密';
  const trimmed = name.trim();
  return trimmed.slice(0, 1).toUpperCase();
}

function copyToClipboard(data, message = '已复制到剪贴板') {
  wx.setClipboardData({
    data: String(data),
    success() {
      wx.showToast({ title: message, icon: 'success' });
    }
  });
}

module.exports = {
  formatTime,
  formatKeyShort,
  getAvatarColor,
  getInitials,
  copyToClipboard,
};
