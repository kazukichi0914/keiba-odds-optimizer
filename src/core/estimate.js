// 発売前などで取れない券種のオッズを、単勝オッズから推定する。
// 単勝オッズ → 市場の勝率 → Harville 式で各組み合わせの的中確率 → 払戻率 ÷ 確率。
import { marketWinProbs, enumerateOutcomes } from './probability.js';

const PAYOUT_RATE = { wide: 0.775, quinella: 0.775, trio: 0.75 };
const key = (hs) => [...hs].sort((a, b) => a - b).join('-');

export function estimateOdds(winOdds) {
  const outcomes = enumerateOutcomes(marketWinProbs(winOdds));
  const wideP = {}, quinP = {}, trioP = {};
  const add = (t, k, p) => { t[k] = (t[k] || 0) + p; };
  for (const { order: [a, b, c], p } of outcomes) {
    add(wideP, key([a, b]), p);
    add(wideP, key([a, c]), p);
    add(wideP, key([b, c]), p);
    add(quinP, key([a, b]), p);
    add(trioP, key([a, b, c]), p);
  }
  // ワイドは1レースで3組当たるので、組ごとの払戻率 ÷ その組の的中確率 がそのままオッズになる。
  const toOdds = (probs, rate) => Object.fromEntries(
    Object.entries(probs).map(([k, p]) => [k, Math.max(1.0, Math.floor((rate / p) * 10) / 10)]));
  return {
    wide: toOdds(wideP, PAYOUT_RATE.wide),
    quinella: toOdds(quinP, PAYOUT_RATE.quinella),
    trio: toOdds(trioP, PAYOUT_RATE.trio),
  };
}

// wide / quinella / trio のうち空のものだけを推定値で埋める。
export function fillMissingOdds(odds) {
  const missing = ['wide', 'quinella', 'trio'].filter((k) => !Object.keys(odds[k] || {}).length);
  if (!missing.length || !Object.keys(odds.win || {}).length) return { odds, estimated: [] };
  const est = estimateOdds(odds.win);
  const filled = { ...odds };
  for (const k of missing) filled[k] = est[k];
  return { odds: filled, estimated: missing };
}
