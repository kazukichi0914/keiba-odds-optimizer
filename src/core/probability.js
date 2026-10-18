// 勝率の見立てと、Harville 式による上位3頭の着順確率。

const MARK_POINTS = { '◎': 5, '○': 3, '〇': 3, '▲': 2, '△': 1, '☆': 1, '★': 1, '注': 1 };
const MAX_POINT = 5;

export function markScore(symbol) {
  return MARK_POINTS[(symbol || '').trim()] ?? 0;
}

function normalize(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const out = {};
  for (const [k, v] of Object.entries(weights)) out[k] = v / total;
  return out;
}

// 単勝オッズの逆数を合計1に正規化した「市場の勝率」。
export function marketWinProbs(winOdds) {
  const w = {};
  for (const [no, odds] of Object.entries(winOdds)) w[no] = 1 / odds;
  return normalize(w);
}

// 予想印で勝率を補正する。p × exp(k × 平均点) を再正規化。
// 平均点 = 合計点 ÷ (記者数 × 5)。
export function applyMarks(probs, marks, k = 0.4) {
  const reporters = Math.max(0, ...Object.values(marks).map((a) => a.length));
  if (reporters === 0) return probs;
  const w = {};
  for (const [no, p] of Object.entries(probs)) {
    const total = (marks[no] || []).reduce((a, b) => a + b, 0);
    w[no] = p * Math.exp(k * (total / (reporters * MAX_POINT)));
  }
  return normalize(w);
}

// 上位3頭の着順と確率（Harville 式）。
export function enumerateOutcomes(probs) {
  const horses = Object.keys(probs).map(Number);
  if (horses.length <= 4) throw new Error('頭数不足のため計算できません（5頭以上が必要です）');
  const out = [];
  for (const a of horses) {
    const pa = probs[a];
    for (const b of horses) {
      if (b === a) continue;
      const pb = probs[b] / (1 - pa);
      for (const c of horses) {
        if (c === a || c === b) continue;
        const pc = probs[c] / (1 - pa - probs[b]);
        out.push({ order: [a, b, c], p: pa * pb * pc });
      }
    }
  }
  return out;
}
