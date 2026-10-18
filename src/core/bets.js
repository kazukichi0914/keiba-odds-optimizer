// 買い目の的中判定と、買い目セットの評価。
// Bet: { type: 'win'|'wide'|'quinella'|'trio', horses: number[]（昇順）, odds: number }

export const betKey = (horses) => [...horses].sort((a, b) => a - b).join('-');

// order は上位3頭の着順。fieldSize が7頭以下ならワイドは2着まで。
export function betHits(bet, order, fieldSize) {
  const h = bet.horses;
  switch (bet.type) {
    case 'win':
      return order[0] === h[0];
    case 'quinella':
      return h.includes(order[0]) && h.includes(order[1]);
    case 'trio':
      return h.every((x) => order.includes(x));
    case 'wide': {
      const places = fieldSize <= 7 ? order.slice(0, 2) : order;
      return h.every((x) => places.includes(x));
    }
    default:
      throw new Error(`未対応の券種: ${bet.type}`);
  }
}

export const payoutOf = (bet, amount) => Math.floor(amount * bet.odds);

export function evaluate(stakes, outcomes, fieldSize) {
  const total = stakes.reduce((a, s) => a + s.amount, 0);
  let hitRate = 0, expected = 0, minHitPayout = Infinity;
  for (const { order, p } of outcomes) {
    let pay = 0;
    for (const s of stakes) if (betHits(s.bet, order, fieldSize)) pay += payoutOf(s.bet, s.amount);
    if (pay > 0) {
      hitRate += p;
      expected += p * pay;
      minHitPayout = Math.min(minHitPayout, pay);
    }
  }
  return {
    total,
    hitRate,
    expectedReturn: total > 0 ? expected / total : 0,
    minHitPayout: minHitPayout === Infinity ? 0 : minHitPayout,
  };
}
