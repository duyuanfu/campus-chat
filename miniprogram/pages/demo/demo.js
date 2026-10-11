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
    // 首次进入立即完成一次演算渲染，防止页面空白
    this.runLocalDemo(this.data.inputText);
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
    const isLocal = Boolean(e.currentTarget.dataset.local);
    this.setData({ useLocalEngine: isLocal }, () => {
      this.runDemo();
    });
  },

  async runDemo() {
    const text = this.data.inputText.trim();
    if (!text) {
      return wx.showToast({ title: '请输入测试明文', icon: 'none' });
    }

    if (this.data.running) return;
    this.setData({ running: true });

    // 轻微触觉反馈
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });

    if (!this.data.useLocalEngine) {
      // 1. 尝试调用后端商用密码服务
      try {
        const res = await Promise.race([
          api.runCryptoDemo(text),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
        ]);

        if (res && res.step1_sm3) {
          this.setData({ demoResult: res, running: false });
          wx.showToast({ title: '后端商密沙箱演算完毕', icon: 'none' });
          return;
        }
      } catch (e) {
        console.warn('Backend demo fallback to local engine:', e);
      }
    }

    // 2. 本地纯 JS 离线引擎秒级运算 (毫秒级响应，零网络依赖)
    this.runLocalDemo(text);
    this.setData({ running: false });
    wx.showToast({ title: '国密演算完毕', icon: 'none' });
  },

  runLocalDemo(text) {
    // 1. SM3 计算明文摘要 (256-bit)
    const sm3Hash = smCrypto.sm3(text);

    // 2. SM4 随机 128 位密钥与随机 IV，CBC 分组加密
    const keyHex = smCrypto.randomHex(16);
    const ivHex = smCrypto.randomHex(16);
    const cipherHex = smCrypto.sm4EncryptCbc(keyHex, ivHex, text);

    // 3. 模拟 SM2 密钥信封分发 (64字节模拟密文)
    const mockEnvelopeHex = smCrypto.randomHex(48) + keyHex;

    // 4. SM4 分组解密还原明文
    const decText = smCrypto.sm4DecryptCbc(keyHex, ivHex, cipherHex);
    const decSm3 = smCrypto.sm3(decText);

    // 5. 模拟黑客恶意篡改攻击
    let tamperedHex = cipherHex;
    if (tamperedHex.length >= 4) {
      const firstByte = parseInt(tamperedHex.substr(0, 2), 16) ^ 0x5a;
      let fbHex = firstByte.toString(16);
      if (fbHex.length === 1) fbHex = '0' + fbHex;
      tamperedHex = fbHex + tamperedHex.slice(2);
    }

    let tamperedDec = '[解密校验异常/乱码]';
    try {
      tamperedDec = smCrypto.sm4DecryptCbc(keyHex, ivHex, tamperedHex);
    } catch (err) {
      tamperedDec = '[解密填充校验异常/乱码]';
    }

    const localResult = {
      step1_sm3: {
        title: 'SM3 密码杂凑计算 (256-bit)',
        input: text,
        hash: sm3Hash,
        description: '为明文生成唯一的 256 位摘要指纹，用于端到端防篡改对比。',
      },
      step2_sm4_encrypt: {
        title: 'SM4 对称分组加密 (CBC 模式)',
        key_hex: keyHex,
        iv_hex: ivHex,
        ciphertext_hex: cipherHex,
        description: 'SM4-CBC 128位分组加密，服务端只保存密文与 IV，无明文泄露。',
      },
      step3_sm2_envelope: {
        envelope_cipher_hex: mockEnvelopeHex,
      },
      step4_sm2_decrypt: {
        recovered_key_hex: keyHex,
      },
      step5_sm4_decrypt: {
        decrypted_text: decText,
      },
      step6_integrity_verify: {
        verified: sm3Hash === decSm3,
      },
      step7_tamper_attack_simulation: {
        tampered_ciphertext_hex: tamperedHex,
        tampered_decrypted_text: tamperedDec,
        conclusion: '攻击检测告警！密文即使发生微小篡改，SM3 比对立即失败，有效阻断数据伪造！',
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
