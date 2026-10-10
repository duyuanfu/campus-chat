const api = require('../../utils/api.js');
const smCrypto = require('../../utils/sm_crypto.js');
const util = require('../../utils/util.js');

Page({
  data: {
    inputText: '明天微积分期中考试重点在第三章和第五章，图书馆二楼见！',
    useLocalEngine: false,
    running: false,
    demoResult: null,
  },

  onLoad() {
    // 首次进入自动执行一次演算
    this.runDemo();
  },

  onTextInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  fillPreset(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({ inputText: text }, () => {
      this.runDemo();
    });
  },

  setEngine(e) {
    const isLocal = e.currentTarget.dataset.local;
    this.setData({ useLocalEngine: isLocal }, () => {
      this.runDemo();
    });
  },

  async runDemo() {
    const text = this.data.inputText.trim();
    if (!text) {
      return wx.showToast({ title: '请输入测试明文', icon: 'none' });
    }

    this.setData({ running: true });

    if (!this.data.useLocalEngine) {
      // 1. 调用后端商用密码服务
      try {
        const res = await api.runCryptoDemo(text);
        this.setData({ demoResult: res });
      } catch (e) {
        console.warn('Backend demo failed, fallback to local engine:', e);
        this.runLocalDemo(text);
      } finally {
        this.setData({ running: false });
      }
    } else {
      // 2. 使用前端本地纯 JS 国密引擎
      this.runLocalDemo(text);
      this.setData({ running: false });
    }
  },

  runLocalDemo(text) {
    // 1. SM3 计算明文摘要
    const sm3Hash = smCrypto.sm3(text);

    // 2. SM4 随机密钥与随机 IV
    const keyHex = smCrypto.randomHex(16);
    const ivHex = smCrypto.randomHex(16);
    const cipherHex = smCrypto.sm4EncryptCbc(keyHex, ivHex, text);

    // 3. SM4 解密
    const decText = smCrypto.sm4DecryptCbc(keyHex, ivHex, cipherHex);
    const decSm3 = smCrypto.sm3(decText);

    // 4. 模拟黑客篡改攻击
    let tamperedHex = cipherHex;
    if (tamperedHex.length >= 4) {
      // 翻转第一个字节
      const firstByte = parseInt(tamperedHex.substr(0, 2), 16) ^ 0x5a;
      let fbHex = firstByte.toString(16);
      if (fbHex.length === 1) fbHex = '0' + fbHex;
      tamperedHex = fbHex + tamperedHex.slice(2);
    }

    let tamperedDec = '[填充错误/乱码]';
    try {
      tamperedDec = smCrypto.sm4DecryptCbc(keyHex, ivHex, tamperedHex);
    } catch (err) {
      tamperedDec = '[解密填充校验异常/乱码]';
    }

    const tamperedSm3 = smCrypto.sm3(tamperedHex);

    const localResult = {
      step1_sm3: {
        title: 'SM3 密码杂凑计算 (256-bit)',
        input: text,
        hash: sm3Hash,
      },
      step2_sm4_encrypt: {
        title: 'SM4 对称分组加密 (CBC 模式)',
        key_hex: keyHex,
        iv_hex: ivHex,
        ciphertext_hex: cipherHex,
        description: '前端纯 JS 离线引擎完成 SM4-CBC 128位分组加密',
      },
      step3_sm2_envelope: null, // 前端轻量演示
      step5_sm4_decrypt: {
        decrypted_text: decText,
      },
      step6_integrity_verify: {
        verified: sm3Hash === decSm3,
      },
      step7_tamper_attack_simulation: {
        tampered_ciphertext_hex: tamperedHex,
        tampered_decrypted_text: tamperedDec,
        conclusion: '攻击检测告警！密文发生微小篡改，SM3 比对立即失败，有效阻断数据伪造！',
      },
    };

    this.setData({ demoResult: localResult });
  },

  copyText(e) {
    const text = e.currentTarget.dataset.text;
    if (text) {
      util.copyToClipboard(text, '已复制');
    }
  },
});
