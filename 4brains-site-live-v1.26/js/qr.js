/* ==========================================================================
   qr.js — tiny dependency-free QR code encoder (byte mode, versions 1–40,
   ECC levels L/M/Q/H, automatic mask selection).

   Why our own: the roadshow site must work with no CDN and no npm. This is a
   compact, readable implementation of the ISO/IEC 18004 algorithm.

   Usage:
     const svg = QR.toSVG('https://4brains.in', { ecc: 'M', margin: 2 });
     el.innerHTML = svg;

   QR.encode(text, ecc) returns { size, modules } where modules[y][x] is true
   for a dark module — use it if you want to draw on Canvas instead.
   ========================================================================== */
(function (global) {
  'use strict';

  // Number of error-correction codewords per block, indexed [ecc][version]
  const ECC_CODEWORDS_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  // Number of error-correction blocks, indexed [ecc][version]
  const NUM_ERROR_CORRECTION_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };
  const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  /* ---------- capacity helpers ---------- */
  function numRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function numDataCodewords(ver, ecc) {
    return Math.floor(numRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecc][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecc][ver];
  }

  /* ---------- Reed–Solomon over GF(2^8), polynomial 0x11D ---------- */
  function rsMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = new Array(divisor.length).fill(0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= rsMultiply(coef, factor); });
    }
    return result;
  }

  /* ---------- bit buffer ---------- */
  function appendBits(buf, val, len) {
    for (let i = len - 1; i >= 0; i--) buf.push((val >>> i) & 1);
  }

  /* ---------- UTF-8 ---------- */
  function toUtf8Bytes(str) {
    const enc = encodeURIComponent(str);
    const out = [];
    for (let i = 0; i < enc.length; i++) {
      if (enc[i] === '%') { out.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2; }
      else out.push(enc.charCodeAt(i));
    }
    return out;
  }

  /* ---------- main encode ---------- */
  function encode(text, ecc) {
    ecc = (ecc || 'M').toUpperCase();
    if (!ECC_FORMAT_BITS.hasOwnProperty(ecc)) ecc = 'M';
    const bytes = toUtf8Bytes(text);

    // pick the smallest version that fits
    let ver = 1;
    for (;; ver++) {
      if (ver > 40) throw new Error('QR: text too long');
      const ccBits = ver < 10 ? 8 : 16;
      const needed = 4 + ccBits + bytes.length * 8;
      if (needed <= numDataCodewords(ver, ecc) * 8) break;
    }
    const capacityBits = numDataCodewords(ver, ecc) * 8;

    // data bit stream: mode(0100) + count + bytes + terminator + pad
    const bb = [];
    appendBits(bb, 0x4, 4);
    appendBits(bb, bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(b => appendBits(bb, b, 8));
    appendBits(bb, 0, Math.min(4, capacityBits - bb.length));
    appendBits(bb, 0, (8 - bb.length % 8) % 8);
    for (let pad = 0xEC; bb.length < capacityBits; pad ^= 0xEC ^ 0x11) appendBits(bb, pad, 8);
    const data = [];
    for (let i = 0; i < bb.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j];
      data.push(v);
    }

    // split into blocks, add ECC, interleave
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const blocks = [];
    const rsDiv = rsDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const eccBytes = rsRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0); // placeholder so all blocks have equal length
      blocks.push(dat.concat(eccBytes));
    }
    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
      });
    }

    // build the module matrix
    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

    function setFn(x, y, dark) { modules[y][x] = dark; isFunction[y][x] = true; }
    function drawFinder(cx, cy) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
    function drawAlign(cx, cy) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    function alignPositions() {
      if (ver === 1) return [];
      const numAlign = Math.floor(ver / 7) + 2;
      const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
      const res = [6];
      for (let pos = size - 7; res.length < numAlign; pos -= step) res.splice(1, 0, pos);
      return res;
    }
    function drawFormatBits(mask) {
      const dataBits = (ECC_FORMAT_BITS[ecc] << 3) | mask;
      let rem = dataBits;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((dataBits << 10) | rem) ^ 0x5412;
      const bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
      setFn(8, size - 8, true); // the always-dark module
    }
    function drawVersion() {
      if (ver < 7) return;
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const b = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + i % 3, c = Math.floor(i / 3);
        setFn(a, c, b); setFn(c, a, b);
      }
    }

    // function patterns
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
    const ap = alignPositions();
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      drawAlign(ap[i], ap[j]);
    }
    drawFormatBits(0); // reserve the area; real value set after masking
    drawVersion();

    // place data codewords in the zigzag pattern
    let bitIdx = 0;
    const totalBits = result.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && bitIdx < totalBits) {
            modules[y][x] = ((result[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
        }
      }
    }

    // masking: try all 8, keep the lowest penalty
    function applyMask(mask) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = x * y % 2 + x * y % 3 === 0; break;
          case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
        }
        if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
      }
    }
    function penalty() {
      let res = 0;
      const N1 = 3, N2 = 3, N3 = 40, N4 = 10;
      // adjacent same-color runs + finder-like patterns, rows and columns
      for (let y = 0; y < size; y++) {
        let runColor = false, runX = 0, hist = [0, 0, 0, 0, 0, 0, 0];
        for (let x = 0; x < size; x++) {
          if (modules[y][x] === runColor) {
            runX++;
            if (runX === 5) res += N1; else if (runX > 5) res++;
          } else {
            finderPenaltyAddHistory(runX, hist);
            if (!runColor) res += finderPenaltyCount(hist) * N3;
            runColor = modules[y][x]; runX = 1;
          }
        }
        res += finderPenaltyTerminate(runColor, runX, hist) * N3;
      }
      for (let x = 0; x < size; x++) {
        let runColor = false, runY = 0, hist = [0, 0, 0, 0, 0, 0, 0];
        for (let y = 0; y < size; y++) {
          if (modules[y][x] === runColor) {
            runY++;
            if (runY === 5) res += N1; else if (runY > 5) res++;
          } else {
            finderPenaltyAddHistory(runY, hist);
            if (!runColor) res += finderPenaltyCount(hist) * N3;
            runColor = modules[y][x]; runY = 1;
          }
        }
        res += finderPenaltyTerminate(runColor, runY, hist) * N3;
      }
      // 2x2 blocks
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) res += N2;
      }
      // dark/light balance
      let dark = 0;
      for (const row of modules) for (const m of row) if (m) dark++;
      const total = size * size;
      const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      res += k * N4;
      return res;
    }
    function finderPenaltyCount(h) {
      const n = h[1];
      const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    }
    function finderPenaltyTerminate(color, runLen, h) {
      if (color) { finderPenaltyAddHistory(runLen, h); runLen = 0; }
      runLen += size;
      finderPenaltyAddHistory(runLen, h);
      return finderPenaltyCount(h);
    }
    function finderPenaltyAddHistory(runLen, h) {
      if (h[0] === 0) runLen += size;
      h.pop(); h.unshift(runLen);
    }

    let bestMask = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormatBits(m);
      const s = penalty();
      if (s < bestScore) { bestScore = s; bestMask = m; }
      applyMask(m); // undo (XOR twice)
    }
    applyMask(bestMask);
    drawFormatBits(bestMask);

    return { size, modules, version: ver, ecc, mask: bestMask };
  }

  /* ---------- SVG output ---------- */
  function toSVG(text, opts) {
    opts = opts || {};
    const { size, modules } = encode(text, opts.ecc || 'M');
    const margin = opts.margin == null ? 2 : opts.margin;
    const dim = size + margin * 2;
    const fg = opts.fg || 'currentColor';
    const bg = opts.bg || 'none';
    let d = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (modules[y][x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
    const label = opts.label || `QR code linking to ${text}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="${escapeAttr(label)}" shape-rendering="crispEdges">`
      + (bg !== 'none' ? `<rect width="${dim}" height="${dim}" fill="${bg}"/>` : '')
      + `<path d="${d}" fill="${fg}"/></svg>`;
  }
  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  const QR = { encode, toSVG };
  if (typeof module !== 'undefined' && module.exports) module.exports = QR;
  global.QR = QR;
})(typeof window !== 'undefined' ? window : globalThis);
