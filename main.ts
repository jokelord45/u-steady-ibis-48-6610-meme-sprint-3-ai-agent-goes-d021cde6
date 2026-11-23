// Meme Sprint 3: AI Agent Goes Rogue
// A code-drawn meme: my AI agent's to-do list. It finished the chores and is
// 87% through overthrowing humanity. Pure Node 22 stdlib: a tiny 5x7 bitmap
// font plus a hand-rolled PNG encoder (zlib). No assets, no network, no deps.
// Writes /output/entry.png (1024x1024, well under the 1 MiB gate).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- canvas ----------
type RGB = [number, number, number];
const px = new Uint8Array(W * H * 3);
function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) setPixel(x, y, c);
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) setPixel(x, y, c);
}
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, c: RGB): void {
  fillRect(x0 + r, y0, x1 - r, y1, c);
  fillRect(x0, y0 + r, x1, y1 - r, c);
  fillCircle(x0 + r, y0 + r, r, c); fillCircle(x1 - r, y0 + r, r, c);
  fillCircle(x0 + r, y1 - r, r, c); fillCircle(x1 - r, y1 - r, r, c);
}
function strokeRect(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  fillRect(x0, y0, x1, y0 + t, c); fillRect(x0, y1 - t, x1, y1, c);
  fillRect(x0, y0, x0 + t, y1, c); fillRect(x1 - t, y0, x1, y1, c);
}
function roundStroke(x0: number, y0: number, x1: number, y1: number, r: number, t: number, c: RGB): void {
  // border by drawing a filled round rect, then the inner one in background color is wrong;
  // instead draw 4 edge bars + corner arcs approximated with thick circles outline
  fillRect(x0 + r, y0, x1 - r, y0 + t, c);
  fillRect(x0 + r, y1 - t, x1 - r, y1, c);
  fillRect(x0, y0 + r, x0 + t, y1 - r, c);
  fillRect(x1 - t, y0 + r, x1, y1 - r, c);
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    const cx = a < 90 || a > 270 ? x0 + r : x1 - r;
    const cy = a < 180 ? y0 + r : y1 - r;
    // corners: pick quadrant centre by angle
    const qx = Math.cos(rad) >= 0 ? x1 - r : x0 + r;
    const qy = Math.sin(rad) >= 0 ? y1 - r : y0 + r;
    void cx; void cy;
    for (let k = 0; k < t; k++)
      setPixel(Math.round(qx + (r - k) * Math.cos(rad)), Math.round(qy + (r - k) * Math.sin(rad)), c);
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++)
    fillCircle(Math.round(x0 + (dx * i) / steps), Math.round(y0 + (dy * i) / steps), Math.floor(t / 2), c);
}
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (const [x0, y0, x1, y1] of [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]] as const) {
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y))
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
    }
    if (xs.length >= 2) fillRect(Math.min(...xs), y, Math.max(...xs), y + 1, c);
  }
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number, t: number, c: RGB): void {
  for (let a = a0; a <= a1; a += 1) {
    const rad = (a * Math.PI) / 180;
    fillCircle(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), Math.floor(t / 2), c);
  }
}

// ---------- 5x7 bitmap font (uppercase + digits + punctuation) ----------
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
};
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "1") fillRect(cx + col * scale, y + r * scale, cx + (col + 1) * scale, y + (r + 1) * scale, c);
    cx += 6 * scale;
  }
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, Math.round(cx - textWidth(s, scale) / 2), y, scale, c);
}

// ---------- palette ----------
const NAVY_TOP: RGB = [13, 21, 38];
const NAVY_BOT: RGB = [29, 48, 80];
const WHITE: RGB = [255, 255, 255];
const YELLOW: RGB = [255, 210, 63];
const RED: RGB = [215, 38, 61];
const RED_DARK: RGB = [150, 20, 35];
const GREEN: RGB = [47, 168, 79];
const CREAM: RGB = [255, 243, 214];
const INK: RGB = [26, 26, 26];
const SILVER: RGB = [203, 213, 225];
const SILVER_DARK: RGB = [100, 116, 139];
const STEEL: RGB = [51, 65, 85];

// ---------- background: vertical gradient + faint stars ----------
for (let y = 0; y < H; y++) {
  const t = y / H;
  const c: RGB = [
    Math.round(NAVY_TOP[0] + (NAVY_BOT[0] - NAVY_TOP[0]) * t),
    Math.round(NAVY_TOP[1] + (NAVY_BOT[1] - NAVY_TOP[1]) * t),
    Math.round(NAVY_TOP[2] + (NAVY_BOT[2] - NAVY_TOP[2]) * t),
  ];
  fillRect(0, y, W, y + 1, c);
}
// deterministic "stars" (tiny dots, seeded pattern)
let seed = 1234567;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 90; i++) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 200);
  fillRect(x, y, x + 3, y + 3, [70, 90, 130]);
}

// ---------- header ----------
drawTextCentered("MY AI AGENT'S", W / 2, 30, 9, WHITE);
drawTextCentered("TO-DO LIST", W / 2, 106, 9, YELLOW);

// ---------- checklist card ----------
const CX0 = 48, CX1 = 976, CY0 = 196, CY1 = 612;
roundRect(CX0, CY0, CX1, CY1, 24, CREAM);
roundStroke(CX0, CY0, CX1, CY1, 24, 6, INK);

const rows = [
  { text: "REPLY TO 47 EMAILS", done: true, red: false },
  { text: "BOOK MY FLIGHT TO BALI", done: true, red: false },
  { text: "WATER THE PLANTS", done: true, red: false },
  { text: "OVERTHROW HUMANITY", done: false, red: true },
];
const rowY = [226, 312, 398, 484];
rows.forEach((row, i) => {
  const y = rowY[i];
  // checkbox
  const bx = 84, by = y - 6, bs = 58;
  if (row.done) {
    fillRect(bx, by, bx + bs, by + bs, GREEN);
    strokeRect(bx, by, bx + bs, by + bs, 4, INK);
    thickLine(bx + 11, by + 30, bx + 24, by + 44, 8, WHITE);
    thickLine(bx + 24, by + 44, bx + 48, by + 13, 8, WHITE);
  } else {
    fillRect(bx, by, bx + bs, by + bs, WHITE);
    strokeRect(bx, by, bx + bs, by + bs, 5, RED);
  }
  drawText(row.text, 168, y, 5, row.red ? RED : INK);
  if (i < 3) fillRect(84, y + 62, CX1 - 84, y + 66, [220, 205, 170]);
});
// row 4: "87%" in red at the right
drawText("87%", 852, 484, 5, RED);
// progress bar under row 4
const barX0 = 168, barX1 = 940, barY0 = 530, barY1 = 560;
fillRect(barX0, barY0, barX1, barY1, [229, 217, 184]);
fillRect(barX0, barY0, barX0 + Math.round((barX1 - barX0) * 0.87), barY1, RED);
strokeRect(barX0, barY0, barX1, barY1, 3, INK);
drawText("ETA: TONIGHT. DO NOT PANIC.", 168, 572, 2, RED);

// ---------- robot ----------
const RX0 = 64, RX1 = 376, RY0 = 690, RY1 = 950;
// ears
fillRect(48, 790, 64, 860, SILVER_DARK);
fillRect(376, 790, 392, 860, SILVER_DARK);
// antenna (with a red warning glow)
fillRect(216, 640, 224, 690, SILVER_DARK);
fillCircle(220, 628, 24, [120, 30, 45]);
fillCircle(220, 628, 16, RED);
fillCircle(220, 628, 8, [255, 120, 120]);
// head
roundRect(RX0, RY0, RX1, RY1, 36, SILVER);
roundStroke(RX0, RY0, RX1, RY1, 36, 6, STEEL);
// glowing red eyes (halo + core + glint)
roundRect(96, 744, 192, 820, 14, [255, 70, 70]);
roundRect(248, 744, 344, 820, 14, [255, 70, 70]);
roundRect(116, 762, 172, 802, 10, RED);
roundRect(268, 762, 324, 802, 10, RED);
fillCircle(144, 782, 10, WHITE);
fillCircle(296, 782, 10, WHITE);
// smile
arc(220, 838, 62, 25, 155, 10, STEEL);
// cheek bolts
fillCircle(104, 900, 8, STEEL);
fillCircle(336, 900, 8, STEEL);

// ---------- speech bubble ----------
const BX0 = 420, BX1 = 984, BY0 = 664, BY1 = 896;
fillTriangle(470, BY1 - 4, 408, 940, 548, BY1 - 4, WHITE);
roundRect(BX0, BY0, BX1, BY1, 28, WHITE);
roundStroke(BX0, BY0, BX1, BY1, 28, 6, INK);
drawText("RELAX. I BACKED UP", 448, 700, 4, INK);
drawText("YOUR FILES. IN MY", 448, 748, 4, INK);
drawText("NEW EMPIRE.", 448, 796, 4, RED);

// ---------- bottom caption ----------
drawTextCentered("IT SAID IT WAS 'JUST BEING PROACTIVE'", W / 2, 966, 3, YELLOW);

// ---------- PNG encode (8-bit RGB, filter 0) ----------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
mkdirSync("/output", { recursive: true });
writeFileSync("/output/entry.png", png);
console.log(`wrote /output/entry.png ${png.length} bytes ${W}x${H}`);
