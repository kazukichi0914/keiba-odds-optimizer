// 予算内で「ワイド必須・トリガミなし・的中率下限以上」を満たし、期待回収率が最大の買い目セットを探す。
import { enumerateOutcomes } from './probability.js';
import { betHits, betKey, payoutOf } from './bets.js';

export const DEFAULT_OPTIONS = { minHitRate: 0.35, minWideShare: 0.5, maxBets: 3, poolSize: 5, minPayoutMargin: 1.1 };
const UNIT = 100;

function combinations(items, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) {
    out.push(prefix);
    return out;
  }
  for (let i = start; i < items.length; i++) combinations(items, k, i + 1, [...prefix, items[i]], out);
  return out;
}

function candidateBets(pool, odds) {
  const bets = [];
  for (const h of pool.slice(0, 3)) bets.push({ type: 'win', horses: [h], odds: odds.win[h] });
  const add = (type, table, size) => {
    if (!table) return;
    for (const hs of combinations(pool, size)) {
      const horses = [...hs].sort((a, b) => a - b);
      const o = table[betKey(horses)];
      if (o > 0) bets.push({ type, horses, odds: o });
    }
  };
  add('wide', odds.wide, 2);
  add('quinella', odds.quinella, 2);
  add('trio', odds.trio, 3);
  return bets;
}

// 払戻がそろうよう 1/odds に比例して配分し、余りは最小払戻が上がる買い目に足す。単位は100円。
function dutch(bets, units) {
  const w = bets.map((b) => 1 / b.odds);
  const sw = w.reduce((a, b) => a + b, 0);
  const alloc = w.map((x) => Math.floor((units * x) / sw));
  let rest = units - alloc.reduce((a, b) => a + b, 0);
  while (rest-- > 0) {
    let low = 0;
    for (let i = 1; i < bets.length; i++) if (alloc[i] * bets[i].odds < alloc[low] * bets[low].odds) low = i;
    alloc[low]++;
  }
  return alloc;
}

// その券種のオッズ表から見た、市場の的中確率（払戻率で正規化）。
function impliedProb(bet, odds, fieldSize) {
  const table = odds[bet.type];
  const inv = Object.values(table).reduce((a, o) => a + 1 / o, 0);
  const winners = bet.type === 'wide' ? (fieldSize <= 7 ? 2 : 3) : 1;
  return (1 / bet.odds / inv) * winners;
}

// probs: 印で補正した勝率、marketProbs: 補正前の勝率（省略時は probs）。
// 期待値は「券種ごとの市場確率 × (補正後 / 補正前 の Harville 確率の比)」で見積もる。
// Harville 式そのものの偏りが期待値に乗らないよう、印による差分だけを使う。
export function recommend({ probs, marketProbs = probs, odds, budget, options = {} }) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const none = { status: 'none', stakes: [], hitRate: 0, expectedReturn: 0, total: 0 };
  const units = Math.floor(budget / UNIT);
  if (units < 1) return none;

  // 取消馬（単勝オッズなし）を除いて勝率を正規化し直す。
  const live = Object.keys(probs).map(Number).filter((h) => odds.win[h] > 0);
  const s = live.reduce((a, h) => a + probs[h], 0);
  const p = Object.fromEntries(live.map((h) => [h, probs[h] / s]));
  const sm = live.reduce((a, h) => a + marketProbs[h], 0);
  const pm = Object.fromEntries(live.map((h) => [h, marketProbs[h] / sm]));
  const fieldSize = live.length;
  const outcomes = enumerateOutcomes(p);
  const marketOutcomes = enumerateOutcomes(pm);

  const pool = [...live].sort((a, b) => p[b] - p[a]).slice(0, opt.poolSize);
  const cands = candidateBets(pool, odds);
  // 各候補が当たる着順のインデックスを前計算する。
  const hitIdx = cands.map((b) => {
    const idx = [];
    outcomes.forEach((o, i) => { if (betHits(b, o.order, fieldSize)) idx.push(i); });
    return idx;
  });
  // 各候補の「1円あたりの期待払戻」。
  const evPerYen = cands.map((b, ci) => {
    const hp = hitIdx[ci].reduce((a, i) => a + outcomes[i].p, 0);
    const hm = hitIdx[ci].reduce((a, i) => a + marketOutcomes[i].p, 0);
    return hm > 0 ? b.odds * impliedProb(b, odds, fieldSize) * (hp / hm) : 0;
  });

  const pay = new Float64Array(outcomes.length);
  let best = null;
  for (let k = 1; k <= opt.maxBets; k++) {
    for (const set of combinations([...cands.keys()], k)) {
      if (!set.some((i) => cands[i].type === 'wide')) continue;
      const bets = set.map((i) => cands[i]);
      const alloc = dutch(bets, units);
      if (alloc.some((a) => a === 0)) continue;
      const amounts = alloc.map((a) => a * UNIT);
      const total = amounts.reduce((a, b) => a + b, 0);
      const wideAmt = amounts.reduce((a, x, j) => a + (bets[j].type === 'wide' ? x : 0), 0);
      if (wideAmt / total < opt.minWideShare) continue;

      pay.fill(0);
      set.forEach((ci, j) => {
        const v = payoutOf(bets[j], amounts[j]);
        for (const oi of hitIdx[ci]) pay[oi] += v;
      });
      let hitRate = 0, minHit = Infinity;
      for (let i = 0; i < outcomes.length; i++) {
        if (pay[i] > 0) {
          hitRate += outcomes[i].p;
          if (pay[i] < minHit) minHit = pay[i];
        }
      }
      if (hitRate < opt.minHitRate || minHit < total * opt.minPayoutMargin) continue;
      const er = set.reduce((a, ci, j) => a + amounts[j] * evPerYen[ci], 0) / total;
      if (!best || er > best.expectedReturn + 1e-12 || (Math.abs(er - best.expectedReturn) <= 1e-12 && hitRate > best.hitRate)) {
        best = {
          stakes: bets.map((bet, j) => ({ bet, amount: amounts[j], payout: payoutOf(bet, amounts[j]) })),
          hitRate,
          expectedReturn: er,
          total,
        };
      }
    }
  }
  if (!best) return none;
  return { status: best.expectedReturn > 1 ? 'ok' : 'negative', ...best };
}
