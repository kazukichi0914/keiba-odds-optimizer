// netkeiba と競馬ラボのデータを突き合わせ、最適化に渡す勝率とオッズを作る。
import { marketWinProbs, applyMarks } from './probability.js';

export const normalizeName = (s) => (s || '').normalize('NFKC').replace(/\s+/g, '');

export function assemble({ netkeibaNames, odds, keibalab, k = 0.4 }) {
  if (!Object.keys(odds.win || {}).length || !Object.keys(odds.wide || {}).length) {
    throw new Error('オッズを取得できませんでした');
  }
  const warnings = [];
  if (!Object.keys(netkeibaNames || {}).length) throw new Error('netkeiba の出馬表から馬名を読み取れませんでした');

  const klNos = Object.keys(keibalab.horses || {});
  if (klNos.length && klNos.length !== Object.keys(netkeibaNames).length) {
    throw new Error('競馬ラボと netkeiba で別のレースが開かれています（頭数が違います）');
  }

  const mismatched = klNos.filter((no) =>
    normalizeName(netkeibaNames[no]) !== normalizeName(keibalab.horses[no]));
  if (mismatched.length >= 2) throw new Error('競馬ラボと netkeiba で別のレースが開かれています');
  for (const no of mismatched) {
    warnings.push(`${no}番の馬名が一致しません（netkeiba: ${netkeibaNames[no]} / 競馬ラボ: ${keibalab.horses[no]}）`);
  }

  if (odds.trio == null) warnings.push('三連複のオッズが取れないため候補から外しました');

  const market = marketWinProbs(odds.win); // 単勝オッズのない取消馬はここで外れる
  let probs = market;
  if (keibalab.reporters > 0) probs = applyMarks(market, keibalab.marks, k);
  else warnings.push('印なし（期待値は控除率分マイナス）');

  return { probs, marketProbs: market, odds, warnings };
}
