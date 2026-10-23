// seed から 0〜1 の乱数を順に出す（小さく速い擬似乱数 mulberry32）。
// 形や並びを保存せずに作り直すもの（石・砂利）は、同じ seed から必ず同じ結果を作るために Math.random ではなくこれを使う
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
