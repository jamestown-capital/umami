/* eslint-disable */
const HASH_ERROR = 'f'.repeat(64);

const hashStr = str => {
  try {
    const buf = new TextEncoder().encode(str);
    return crypto.subtle
      .digest('SHA-256', buf)
      .then(h => {
        const arr = new Uint8Array(h);
        let hex = '';
        for (let i = 0; i < arr.length; i++) {
          hex += `0${arr[i].toString(16)}`.slice(-2);
        }
        return hex;
      })
      .catch(() => HASH_ERROR);
  } catch {
    return Promise.resolve(HASH_ERROR);
  }
};

const collectGpu = () => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { error: 'no webgl' };

  const result = {
    vendor: null,
    renderer: null,
    params: {},
    shaderPrecision: {},
    extensions: [],
    extensionParams: {},
  };

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    result.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    result.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  }

  let proto = Object.getPrototypeOf(gl);
  const visited = new Set();
  while (proto && proto !== Object.prototype) {
    Object.getOwnPropertyNames(proto).forEach(name => {
      if (visited.has(name)) return;
      visited.add(name);
      if (!/^[A-Z][A-Z0-9_]+$/.test(name)) return;
      const val = gl[name];
      if (typeof val !== 'number' || val < 0) return;
      try {
        const p = gl.getParameter(val);
        if (p === null || p === undefined) return;
        if (p instanceof Float32Array || p instanceof Int32Array || p instanceof Uint32Array) {
          result.params[name] = Array.from(p);
        } else if (typeof p === 'number' || typeof p === 'boolean' || typeof p === 'string') {
          result.params[name] = p;
        }
      } catch {}
    });
    proto = Object.getPrototypeOf(proto);
  }

  const shaderTypes = [
    [gl.VERTEX_SHADER, 'VERTEX'],
    [gl.FRAGMENT_SHADER, 'FRAGMENT'],
  ];
  const precisionTypes = [
    [gl.HIGH_FLOAT, 'HIGH_FLOAT'],
    [gl.MEDIUM_FLOAT, 'MEDIUM_FLOAT'],
    [gl.LOW_FLOAT, 'LOW_FLOAT'],
    [gl.HIGH_INT, 'HIGH_INT'],
    [gl.MEDIUM_INT, 'MEDIUM_INT'],
    [gl.LOW_INT, 'LOW_INT'],
  ];
  shaderTypes.forEach(st => {
    precisionTypes.forEach(pt => {
      try {
        const fmt = gl.getShaderPrecisionFormat(st[0], pt[0]);
        if (fmt) {
          result.shaderPrecision[`${st[1]}_${pt[1]}`] = [fmt.rangeMin, fmt.rangeMax, fmt.precision];
        }
      } catch {}
    });
  });

  const exts = gl.getSupportedExtensions() || [];
  result.extensions = exts.slice();

  exts.forEach(extName => {
    try {
      const ext = gl.getExtension(extName);
      if (!ext) return;
      Object.getOwnPropertyNames(ext).forEach(prop => {
        if (!/^[A-Z][A-Z0-9_]+$/.test(prop)) return;
        const val = ext[prop];
        if (typeof val !== 'number') return;
        try {
          const p = gl.getParameter(val);
          if (p === null || p === undefined) return;
          if (p instanceof Float32Array || p instanceof Int32Array || p instanceof Uint32Array) {
            result.extensionParams[prop] = Array.from(p);
          } else if (typeof p === 'number' || typeof p === 'boolean' || typeof p === 'string') {
            result.extensionParams[prop] = p;
          }
        } catch {}
      });
    } catch {}
  });

  return Promise.all([
    hashStr(JSON.stringify(result.params)),
    hashStr(JSON.stringify(result.extensions)),
    hashStr(JSON.stringify(result.shaderPrecision)),
  ]).then(hashes => {
    result.paramsHash = hashes[0];
    result.extensionsHash = hashes[1];
    result.shaderPrecisionHash = hashes[2];
    delete result.params;
    delete result.extensions;
    delete result.shaderPrecision;
    return result;
  });
};

const collectOs = () => {
  const result = {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    userAgentData: null,
  };

  if (navigator.userAgentData) {
    result.userAgentData = { brands: navigator.userAgentData.brands };
    return navigator.userAgentData
      .getHighEntropyValues([
        'platform',
        'platformVersion',
        'architecture',
        'model',
        'bitness',
        'fullVersionList',
      ])
      .then(hev => {
        result.userAgentData.platform = hev.platform;
        result.userAgentData.platformVersion = hev.platformVersion;
        result.userAgentData.architecture = hev.architecture;
        result.userAgentData.model = hev.model;
        result.userAgentData.bitness = hev.bitness;
        result.userAgentData.fullVersionList = hev.fullVersionList;
        return result;
      })
      .catch(() => result);
  }

  return result;
};

const collectVoices = () => {
  const mapVoices = list =>
    list.map(v => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
      localService: v.localService,
      voiceURI: v.voiceURI,
    }));

  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(mapVoices(voices));
      return;
    }
    let resolved = false;
    speechSynthesis.addEventListener('voiceschanged', () => {
      if (resolved) return;
      resolved = true;
      resolve(mapVoices(speechSynthesis.getVoices()));
    });
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      resolve(mapVoices(speechSynthesis.getVoices()));
    }, 2000);
  }).then(arr => hashStr(JSON.stringify(arr)).then(h => ({ count: arr.length, hash: h })));
};

const collectScreen = () => ({
  width: screen.width,
  height: screen.height,
  availWidth: screen.availWidth,
  availHeight: screen.availHeight,
  colorDepth: screen.colorDepth,
  pixelDepth: screen.pixelDepth,
  devicePixelRatio: window.devicePixelRatio,
  orientation: screen.orientation ? screen.orientation.type : null,
});

const collectHardware = () => ({
  cores: navigator.hardwareConcurrency,
  memory: navigator.deviceMemory,
});

const collectNetwork = () => {
  const conn = navigator.connection;
  if (!conn) return { error: 'no connection api' };
  return {
    rtt: conn.rtt,
    downlink: conn.downlink,
    effectiveType: conn.effectiveType,
    saveData: conn.saveData,
  };
};

const collectLocale = () => ({
  language: navigator.language,
  languages: navigator.languages ? Array.from(navigator.languages) : [navigator.language],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  timezoneOffset: new Date().getTimezoneOffset(),
});

const collectMedia = () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return Promise.resolve({ error: 'no mediaDevices api' });
  }
  return navigator.mediaDevices.enumerateDevices().then(devices =>
    devices.map(d => ({
      kind: d.kind,
      deviceId: d.deviceId,
      groupId: d.groupId,
      label: d.label,
    })),
  );
};

const collectCanvas = () => {
  const c1 = document.createElement('canvas');
  c1.width = 240;
  c1.height = 60;
  const ctx1 = c1.getContext('2d');
  ctx1.textBaseline = 'alphabetic';
  ctx1.font = "14px 'Arial'";
  ctx1.fillStyle = '#f60';
  ctx1.fillRect(125, 1, 62, 20);
  ctx1.fillStyle = '#069';
  ctx1.fillText('Cwm fjordbank gly 😃', 2, 15);
  ctx1.fillStyle = 'rgba(102, 204, 0, 0.7)';
  ctx1.fillText('Cwm fjordbank gly 😃', 4, 17);
  const textDataUrl = c1.toDataURL();

  const c2 = document.createElement('canvas');
  c2.width = 122;
  c2.height = 110;
  const ctx2 = c2.getContext('2d');
  ctx2.globalCompositeOperation = 'multiply';
  [
    ['#f2f', 40, 40, 40],
    ['#2ff', 80, 40, 40],
    ['#ff2', 60, 80, 40],
  ].forEach(item => {
    ctx2.fillStyle = item[0];
    ctx2.beginPath();
    ctx2.arc(item[1], item[2], item[3], 0, Math.PI * 2, true);
    ctx2.closePath();
    ctx2.fill();
  });
  ctx2.fillStyle = '#f9c';
  ctx2.arc(60, 60, 60, 0, Math.PI * 2, true);
  ctx2.arc(60, 60, 20, 0, Math.PI * 2, true);
  ctx2.fill('evenodd');
  const geometryDataUrl = c2.toDataURL();

  return Promise.all([hashStr(textDataUrl), hashStr(geometryDataUrl)]).then(hashes => ({
    textHash: hashes[0],
    geometryHash: hashes[1],
  }));
};

const collectAudio = () =>
  new Promise(resolve => {
    try {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(10000, ctx.currentTime);
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-50, ctx.currentTime);
      comp.knee.setValueAtTime(40, ctx.currentTime);
      comp.ratio.setValueAtTime(12, ctx.currentTime);
      comp.attack.setValueAtTime(0, ctx.currentTime);
      comp.release.setValueAtTime(0.25, ctx.currentTime);
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      ctx
        .startRendering()
        .then(buffer => {
          const data = buffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < data.length; i++) {
            sum += Math.abs(data[i]);
          }
          resolve({
            fingerprint: sum,
            sampleCount: data.length,
            baseLatency: ctx.baseLatency ?? null,
          });
        })
        .catch(e => resolve({ error: e.message }));
    } catch (e) {
      resolve({ error: e.message });
    }
  });

const collectWebglRender = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const gl = canvas.getContext('webgl');
  if (!gl) return { error: 'no webgl' };

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(
    vs,
    'attribute vec2 p;uniform float t;void main(){float s=sin(t);float c=cos(t);gl_Position=vec4(p.x*c-p.y*s,p.x*s+p.y*c,0,1);}',
  );
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, 'precision mediump float;void main(){gl_FragColor=vec4(1,0,0,1);}');
  gl.compileShader(fs);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL method, not a React hook
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, -1, -1, 1, -1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tLoc = gl.getUniformLocation(prog, 't');
  gl.uniform1f(tLoc, 3.65);

  gl.clearColor(0, 0, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const dataUrl = canvas.toDataURL();
  const attrs = gl.getContextAttributes();

  return hashStr(dataUrl).then(h => ({
    hash: h,
    contextAttributes: attrs,
  }));
};

const collectFonts = () => {
  if (!window.queryLocalFonts) {
    return Promise.resolve({ error: 'Local Font Access API not available' });
  }
  return window.queryLocalFonts().then(fonts => {
    const families = new Set();
    const details = fonts.map(f => {
      families.add(f.family);
      return {
        family: f.family,
        fullName: f.fullName,
        postscriptName: f.postscriptName,
        style: f.style,
      };
    });
    return {
      families: Array.from(families).sort(),
      count: details.length,
      details,
    };
  });
};

const collectBattery = () => {
  if (!navigator.getBattery) return Promise.resolve({ error: 'no battery api' });
  return navigator.getBattery().then(bat => ({
    charging: bat.charging,
    level: bat.level,
    chargingTime: bat.chargingTime,
    dischargingTime: bat.dischargingTime,
  }));
};

const collectStorage = () => {
  if (!navigator.storage?.estimate) {
    return Promise.resolve({ error: 'no storage api' });
  }
  return Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
  ]).then(results => ({
    quota: results[0].quota,
    usage: results[0].usage,
    persisted: results[1],
  }));
};

const collectPermissions = () => {
  if (!navigator.permissions) return Promise.resolve({ error: 'no permissions api' });
  return navigator.permissions
    .query({ name: 'notifications' })
    .then(result => ({ notifications: result.state }))
    .catch(e => ({ error: e.message }));
};

const collectFeatures = () => ({
  webShare: 'canShare' in navigator,
  bluetooth: 'bluetooth' in navigator,
  batteryManager: 'BatteryManager' in window,
  rtcPeerConnection: 'RTCPeerConnection' in window,
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
  sharedArrayBuffer: 'SharedArrayBuffer' in window,
  webTransport: 'WebTransport' in window,
  usb: 'usb' in navigator,
  hid: 'hid' in navigator,
  serial: 'serial' in navigator,
  xr: 'xr' in navigator,
  wakeLock: 'wakeLock' in navigator,
  storageManager: 'storage' in navigator,
  serviceWorker: 'serviceWorker' in navigator,
  credentials: 'credentials' in navigator,
});

const collectMediaQueries = () => {
  const mq = q => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return null;
    }
  };
  return {
    colorGamutP3: mq('(color-gamut: p3)'),
    colorGamutSrgb: mq('(color-gamut: srgb)'),
    prefersColorSchemeLight: mq('(prefers-color-scheme: light)'),
    prefersColorSchemeDark: mq('(prefers-color-scheme: dark)'),
    prefersReducedMotion: mq('(prefers-reduced-motion: reduce)'),
    prefersContrast: mq('(prefers-contrast: more)'),
    forcedColors: mq('(forced-colors: active)'),
    dynamicRangeHigh: mq('(dynamic-range: high)'),
    invertedColors: mq('(inverted-colors: inverted)'),
    hdrVideoReady: mq('(video-dynamic-range: high)'),
    pointerFine: mq('(pointer: fine)'),
    hoverHover: mq('(hover: hover)'),
    anyPointerFine: mq('(any-pointer: fine)'),
    anyHoverHover: mq('(any-hover: hover)'),
  };
};

const RSA_PUBLIC_KEY_B64 =
  'MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAhJ+qMtXYRXJ+CEL9uENIvx5Kpa9rBfJbxoVJi7kTl/sDbHYU9+e88AseU8SN6L26c9qMmkpER48TOj/T971VHbC8pBL8KbSry0zf5uok/vbvlqAv39S8kOT7+yQSNPF3kWTXWUzz2LQ7H9vIxo/fQvTZ00Dzph9M54YOfO0rpRZ7d0uDV/KCX862/e1AVtwWTKtqwbtC+BxqqMnvqo0hrveGleXAg0s6kmm2Btr0wxUewTHkAQDE8XA+W05itTUItvB69XvMuVVTCR91EXQyDq52XoWQmSwt6rt9XwzUtf7luSIBe8K/6EA3rhbE/wRNqumkmkaRxcTF7XyMC9PVGxTOUgVkSHKKpfhvamGPlk4Af0MAedyiq1XLLUVQrgndx4R+96bwgkc54c9ggxBW5Pzov5FBP+rdW39WeVT1V5VFQsF9VijVDniQs6O79zMzd4lU+7jWK40a6GlyIUVdy7TGCPmefchK6OGn0jh2sfAS6061/VOsIwB/imTuVClG1LdjBFfz/6lPZpgawwtATx/4Gbv4qSZoAer672Gewp5KMczZIxq05X/s3BC5HNxUm8o6v1+Mz48d7Z5y/2lA63NBQWPWLqpMd2TVaKw0ek77n2X/yBSPuR14bxZrrgCeA4vNK7j1VqMBLrwSKL6xcfcbtJBcEgADf63CxQ+Vh9kCAwEAAQ==';

const toB64 = buf => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const encrypt = async jsonString => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('crypto.subtle not available');
  }
  const pubKeyBytes = Uint8Array.from(atob(RSA_PUBLIC_KEY_B64), c => c.charCodeAt(0));
  const rsaPub = await crypto.subtle.importKey(
    'spki',
    pubKeyBytes.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(jsonString);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, payload);
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaPub, rawAesKey);
  return btoa(
    JSON.stringify({
      key: toB64(encryptedKey),
      iv: toB64(iv),
      data: toB64(ciphertext),
    }),
  );
};

const waitForSessionInfo = (getSessionInfo, timeoutMs) =>
  new Promise(resolve => {
    const initial = getSessionInfo();
    if (initial.sessionId) {
      resolve(initial);
      return;
    }
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 200;
      const info = getSessionInfo();
      if (info.sessionId) {
        clearInterval(interval);
        resolve(info);
      } else if (elapsed >= timeoutMs) {
        clearInterval(interval);
        resolve(info);
      }
    }, 200);
  });

const wrap = (name, fn) => {
  try {
    const val = fn();
    if (val && typeof val.then === 'function') {
      return val
        .then(r => ({ name, value: r }))
        .catch(e => ({ name, value: { error: e.message } }));
    }
    return Promise.resolve({ name, value: val });
  } catch (e) {
    return Promise.resolve({ name, value: { error: e.message } });
  }
};

const captureFingerprint = async getSessionInfo => {
  const collectors = [
    wrap('gpu', collectGpu),
    wrap('os', collectOs),
    wrap('voices', collectVoices),
    wrap('screen', collectScreen),
    wrap('hardware', collectHardware),
    wrap('network', collectNetwork),
    wrap('locale', collectLocale),
    wrap('media', collectMedia),
    wrap('canvas', collectCanvas),
    wrap('audio', collectAudio),
    wrap('webglRender', collectWebglRender),
    wrap('fonts', collectFonts),
    wrap('battery', collectBattery),
    wrap('storage', collectStorage),
    wrap('permissions', collectPermissions),
    wrap('features', collectFeatures),
    wrap('mediaQueries', collectMediaQueries),
  ];

  const sessionInfoPromise = waitForSessionInfo(getSessionInfo, 10000);

  const results = await Promise.allSettled(collectors);
  const fingerprint = {};
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      fingerprint[r.value.name] = r.value.value;
    }
  });

  const sessionInfo = await sessionInfoPromise;

  fingerprint._meta = {
    timestamp: new Date().toISOString(),
    url: location.href,
    umamiSessionId: sessionInfo.sessionId || null,
    umamiVisitId: sessionInfo.visitId || null,
  };

  return encrypt(JSON.stringify(fingerprint));
};

export const initFingerprint = (track, getSessionInfo) => {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem('__fp_collected')) return;
    sessionStorage.setItem('__fp_collected', '1');
  } catch {
    return;
  }

  captureFingerprint(getSessionInfo)
    .then(b64 => track('fingerprint', { data: b64 }))
    .catch(() => {});
};
