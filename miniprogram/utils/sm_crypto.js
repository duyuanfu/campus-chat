/**
 * 国密算法库（SM3 密码杂凑算法 & SM4 分组密码算法）
 * 专为微信小程序环境优化，纯 JavaScript 实现，零外部依赖
 * 符合国家标准 GB/T 32905-2016 (SM3) 和 GB/T 32907-2016 (SM4)
 */

// ==========================================
// 辅助工具函数
// ==========================================
function hexToBytes(hex) {
  hex = hex.replace(/\s+/g, '');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes) {
  const hex = [];
  for (let i = 0; i < bytes.length; i++) {
    let h = (bytes[i] & 0xff).toString(16);
    if (h.length === 1) h = '0' + h;
    hex.push(h);
  }
  return hex.join('');
}

function utf8ToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6));
      bytes.push(0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12));
      bytes.push(0x80 | ((c >> 6) & 0x3f));
      bytes.push(0x80 | (c & 0x3f));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(0xf0 | (c >> 18));
      bytes.push(0x80 | ((c >> 12) & 0x3f));
      bytes.push(0x80 | ((c >> 6) & 0x3f));
      bytes.push(0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

function bytesToUtf8(bytes) {
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    let b1 = bytes[i++];
    if (b1 < 0x80) {
      str += String.fromCharCode(b1);
    } else if (b1 > 0xbf && b1 < 0xe0) {
      let b2 = bytes[i++];
      str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if (b1 > 0xdf && b1 < 0xf0) {
      let b2 = bytes[i++];
      let b3 = bytes[i++];
      str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else {
      let b2 = bytes[i++];
      let b3 = bytes[i++];
      let b4 = bytes[i++];
      let cp = (((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)) - 0x10000;
      str += String.fromCharCode((cp >> 10) + 0xd800, (cp & 0x3ff) + 0xdc00);
    }
  }
  return str;
}

// ==========================================
// SM3 密码杂凑算法 (GB/T 32905-2016)
// ==========================================
function leftRotate(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function sm3FF(j, x, y, z) {
  if (j <= 15) return (x ^ y ^ z) >>> 0;
  return ((x & y) | (x & z) | (y & z)) >>> 0;
}

function sm3GG(j, x, y, z) {
  if (j <= 15) return (x ^ y ^ z) >>> 0;
  return ((x & y) | (~x & z)) >>> 0;
}

function sm3P0(x) {
  return (x ^ leftRotate(x, 9) ^ leftRotate(x, 17)) >>> 0;
}

function sm3P1(x) {
  return (x ^ leftRotate(x, 15) ^ leftRotate(x, 23)) >>> 0;
}

function sm3T(j) {
  return j <= 15 ? 0x79cc4519 : 0x7a879d8a;
}

function sm3(msg) {
  const bytes = typeof msg === 'string' ? utf8ToBytes(msg) : msg;
  const bitLen = bytes.length * 8;

  // 填充
  const padded = bytes.slice();
  padded.push(0x80);
  while ((padded.length + 8) % 64 !== 0) {
    padded.push(0x00);
  }
  // 附加 64 位长度（大端）
  for (let i = 0; i < 4; i++) padded.push(0);
  padded.push((bitLen >>> 24) & 0xff);
  padded.push((bitLen >>> 16) & 0xff);
  padded.push((bitLen >>> 8) & 0xff);
  padded.push(bitLen & 0xff);

  // 初始 IV
  let V = [
    0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
    0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e
  ];

  const n = padded.length / 64;
  const W = new Array(68);
  const W1 = new Array(64);

  for (let i = 0; i < n; i++) {
    const block = padded.slice(i * 64, (i + 1) * 64);
    for (let j = 0; j < 16; j++) {
      W[j] = ((block[j * 4] << 24) | (block[j * 4 + 1] << 16) | (block[j * 4 + 2] << 8) | block[j * 4 + 3]) >>> 0;
    }
    for (let j = 16; j < 68; j++) {
      W[j] = (sm3P1(W[j - 16] ^ W[j - 9] ^ leftRotate(W[j - 3], 15)) ^ leftRotate(W[j - 13], 7) ^ W[j - 6]) >>> 0;
    }
    for (let j = 0; j < 64; j++) {
      W1[j] = (W[j] ^ W[j + 4]) >>> 0;
    }

    let A = V[0], B = V[1], C = V[2], D = V[3], E = V[4], F = V[5], G = V[6], H = V[7];

    for (let j = 0; j < 64; j++) {
      const SS1 = leftRotate((leftRotate(A, 12) + E + leftRotate(sm3T(j), j % 32)) >>> 0, 7);
      const SS2 = (SS1 ^ leftRotate(A, 12)) >>> 0;
      const TT1 = (sm3FF(j, A, B, C) + D + SS2 + W1[j]) >>> 0;
      const TT2 = (sm3GG(j, E, F, G) + H + SS1 + W[j]) >>> 0;
      D = C;
      C = leftRotate(B, 9);
      B = A;
      A = TT1;
      H = G;
      G = leftRotate(F, 19);
      F = E;
      E = sm3P0(TT2);
    }

    V[0] = (V[0] ^ A) >>> 0;
    V[1] = (V[1] ^ B) >>> 0;
    V[2] = (V[2] ^ C) >>> 0;
    V[3] = (V[3] ^ D) >>> 0;
    V[4] = (V[4] ^ E) >>> 0;
    V[5] = (V[5] ^ F) >>> 0;
    V[6] = (V[6] ^ G) >>> 0;
    V[7] = (V[7] ^ H) >>> 0;
  }

  const outBytes = [];
  for (let i = 0; i < 8; i++) {
    outBytes.push((V[i] >>> 24) & 0xff);
    outBytes.push((V[i] >>> 16) & 0xff);
    outBytes.push((V[i] >>> 8) & 0xff);
    outBytes.push(V[i] & 0xff);
  }
  return bytesToHex(outBytes);
}

// ==========================================
// SM4 分组密码算法 (GB/T 32907-2016)
// ==========================================
const SboxTable = [
  0xd6,0x90,0xe9,0xfe,0xcc,0xe1,0x3d,0xb7,0x16,0xb6,0x14,0xc2,0x28,0xfb,0x2c,0x05,
  0x2b,0x67,0x9a,0x76,0x2a,0xbe,0x04,0xc3,0xaa,0x44,0x13,0x26,0x49,0x86,0x06,0x99,
  0x9c,0x42,0x50,0xf4,0x91,0xef,0x98,0x7a,0x33,0x54,0x0b,0x43,0xed,0xcf,0xac,0x62,
  0xe4,0xb3,0x1c,0xa9,0xc9,0x08,0xe8,0x95,0x80,0xdf,0x94,0xfa,0x75,0x8f,0x3f,0xa6,
  0x47,0x07,0xa7,0xfc,0xf3,0x73,0x17,0xba,0x83,0x59,0x3c,0x19,0xe6,0x85,0x4f,0xa8,
  0x68,0x6b,0x81,0xb2,0x71,0x64,0xda,0x8b,0xf8,0xeb,0x0f,0x4b,0x70,0x56,0x9d,0x35,
  0x1e,0x24,0x0e,0x5e,0x63,0x58,0xd1,0xa2,0x25,0x22,0x7c,0x3b,0x01,0x21,0x78,0x87,
  0xd4,0x00,0x46,0x57,0x9f,0xd3,0x27,0x52,0x4c,0x36,0x02,0xe7,0xa0,0xc4,0xc8,0x9e,
  0xea,0xbf,0x8a,0xd2,0x40,0xc7,0x38,0xb5,0xa3,0xf7,0xf2,0xce,0xf9,0x61,0x15,0xa1,
  0xe0,0xae,0x5d,0xa4,0x9b,0x34,0x1a,0x55,0xad,0x93,0x32,0x30,0xf5,0x8c,0xb1,0xe3,
  0x1d,0xf6,0xe2,0x2e,0x82,0x66,0xca,0x60,0xc0,0x29,0x23,0xab,0x0d,0x53,0x4e,0x6f,
  0xd5,0xdb,0x37,0x45,0xde,0xfd,0x8e,0x2f,0x03,0xff,0x6a,0x72,0x6d,0x6c,0x5b,0x51,
  0x8d,0x1b,0xaf,0x92,0xbb,0xdd,0xbc,0x7f,0x11,0xd9,0x5c,0x41,0x1f,0x10,0x5a,0xd8,
  0x0a,0xc1,0x31,0x88,0xa5,0xcd,0x7b,0xbd,0x2d,0x74,0xd0,0x12,0xb8,0xe5,0xb4,0xb0,
  0x89,0x69,0x97,0x4a,0x0c,0x96,0x77,0x7e,0x65,0xb9,0xf1,0x09,0xc5,0x6e,0xc6,0x84,
  0x18,0xf0,0x7d,0xec,0x3a,0xdc,0x4d,0x20,0x79,0xee,0x5f,0x3e,0xd7,0xcb,0x39,0x48
];

const FK = [0xa3b1bac6, 0x56aa3350, 0x677d9197, 0xb27022dc];
const CK = [
  0x00070e15, 0x1c232a31, 0x383f464d, 0x545b6269,
  0x70777e85, 0x8c939aa1, 0xa8afb6bd, 0xc4cbd2d9,
  0xe0e7eef5, 0xfc030a11, 0x181f262d, 0x343b4249,
  0x50575e65, 0x6c737a81, 0x888f969d, 0xa4abb2b9,
  0xc0c7ced5, 0xdce3eaf1, 0xf8ff060d, 0x141b2229,
  0x30373e45, 0x4c535a61, 0x686f767d, 0x848b9299,
  0xa0a7aeb5, 0xbcc3cad1, 0xd8dfe6ed, 0xf4fb0209,
  0x10171e25, 0x2c333a41, 0x484f565d, 0x646b7279
];

function sm4ByteSub(a) {
  return (
    (SboxTable[(a >>> 24) & 0xff] << 24) |
    (SboxTable[(a >>> 16) & 0xff] << 16) |
    (SboxTable[(a >>> 8) & 0xff] << 8) |
    SboxTable[a & 0xff]
  ) >>> 0;
}

function sm4L(b) {
  return (b ^ leftRotate(b, 2) ^ leftRotate(b, 10) ^ leftRotate(b, 18) ^ leftRotate(b, 24)) >>> 0;
}

function sm4LKey(b) {
  return (b ^ leftRotate(b, 13) ^ leftRotate(b, 23)) >>> 0;
}

function sm4ExpandKey(keyBytes) {
  const MK = [
    ((keyBytes[0] << 24) | (keyBytes[1] << 16) | (keyBytes[2] << 8) | keyBytes[3]) >>> 0,
    ((keyBytes[4] << 24) | (keyBytes[5] << 16) | (keyBytes[6] << 8) | keyBytes[7]) >>> 0,
    ((keyBytes[8] << 24) | (keyBytes[9] << 16) | (keyBytes[10] << 8) | keyBytes[11]) >>> 0,
    ((keyBytes[12] << 24) | (keyBytes[13] << 16) | (keyBytes[14] << 8) | keyBytes[15]) >>> 0
  ];
  const K = [MK[0] ^ FK[0], MK[1] ^ FK[1], MK[2] ^ FK[2], MK[3] ^ FK[3]];
  const rk = new Array(32);
  for (let i = 0; i < 32; i++) {
    const temp = (K[i + 1] ^ K[i + 2] ^ K[i + 3] ^ CK[i]) >>> 0;
    rk[i] = (K[i] ^ sm4LKey(sm4ByteSub(temp))) >>> 0;
    K.push(rk[i]);
  }
  return rk;
}

function sm4CryptBlock(rk, blockBytes) {
  let X0 = ((blockBytes[0] << 24) | (blockBytes[1] << 16) | (blockBytes[2] << 8) | blockBytes[3]) >>> 0;
  let X1 = ((blockBytes[4] << 24) | (blockBytes[5] << 16) | (blockBytes[6] << 8) | blockBytes[7]) >>> 0;
  let X2 = ((blockBytes[8] << 24) | (blockBytes[9] << 16) | (blockBytes[10] << 8) | blockBytes[11]) >>> 0;
  let X3 = ((blockBytes[12] << 24) | (blockBytes[13] << 16) | (blockBytes[14] << 8) | blockBytes[15]) >>> 0;

  for (let i = 0; i < 32; i++) {
    const temp = (X1 ^ X2 ^ X3 ^ rk[i]) >>> 0;
    const X4 = (X0 ^ sm4L(sm4ByteSub(temp))) >>> 0;
    X0 = X1;
    X1 = X2;
    X2 = X3;
    X3 = X4;
  }

  const out = [];
  const res = [X3, X2, X1, X0];
  for (let i = 0; i < 4; i++) {
    out.push((res[i] >>> 24) & 0xff);
    out.push((res[i] >>> 16) & 0xff);
    out.push((res[i] >>> 8) & 0xff);
    out.push(res[i] & 0xff);
  }
  return out;
}

// SM4-CBC 加密
function sm4EncryptCbc(keyHex, ivHex, plainStr) {
  const keyBytes = hexToBytes(keyHex);
  const ivBytes = hexToBytes(ivHex);
  const plainBytes = utf8ToBytes(plainStr);

  // PKCS#7 填充
  const padLen = 16 - (plainBytes.length % 16);
  for (let i = 0; i < padLen; i++) {
    plainBytes.push(padLen);
  }

  const rk = sm4ExpandKey(keyBytes);
  const cipherBytes = [];
  let iv = ivBytes.slice();

  for (let i = 0; i < plainBytes.length; i += 16) {
    const block = plainBytes.slice(i, i + 16);
    for (let j = 0; j < 16; j++) {
      block[j] ^= iv[j];
    }
    const encBlock = sm4CryptBlock(rk, block);
    for (let j = 0; j < 16; j++) {
      cipherBytes.push(encBlock[j]);
    }
    iv = encBlock;
  }

  return bytesToHex(cipherBytes);
}

// SM4-CBC 解密
function sm4DecryptCbc(keyHex, ivHex, cipherHex) {
  const keyBytes = hexToBytes(keyHex);
  const ivBytes = hexToBytes(ivHex);
  const cipherBytes = hexToBytes(cipherHex);

  const rk = sm4ExpandKey(keyBytes);
  const decryptRk = rk.slice().reverse();
  const plainBytes = [];
  let iv = ivBytes.slice();

  for (let i = 0; i < cipherBytes.length; i += 16) {
    const block = cipherBytes.slice(i, i + 16);
    const decBlock = sm4CryptBlock(decryptRk, block);
    for (let j = 0; j < 16; j++) {
      plainBytes.push(decBlock[j] ^ iv[j]);
    }
    iv = block;
  }

  // 去除 PKCS#7 填充
  if (plainBytes.length > 0) {
    const padLen = plainBytes[plainBytes.length - 1];
    if (padLen >= 1 && padLen <= 16) {
      plainBytes.splice(plainBytes.length - padLen, padLen);
    }
  }

  return bytesToUtf8(plainBytes);
}

// 生成随机十六进制字符串 (指定字节数)
function randomHex(byteLen = 16) {
  const bytes = [];
  for (let i = 0; i < byteLen; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytesToHex(bytes);
}

module.exports = {
  sm3,
  sm4EncryptCbc,
  sm4DecryptCbc,
  randomHex,
  hexToBytes,
  bytesToHex,
  utf8ToBytes,
  bytesToUtf8,
};
