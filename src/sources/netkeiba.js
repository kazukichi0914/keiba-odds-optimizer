// netkeiba のオッズ API と出馬表の読み取り。
// オッズ API: race.netkeiba.com/api/api_get_jra_odds.html?race_id=...&type=N
//   type 1 = 単勝・複勝（odds["1"] が単勝）, 4 = 馬連, 5 = ワイド（[下限, 上限, 人気]）, 7 = 三連複
//   キーは馬番2桁の連結（"0102", "010203"）。2026-10-18 秋華賞で確認。

const TYPE = { win: 1, quinella: 4, wide: 5, trio: 7 };

export function raceIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'race.netkeiba.com') return null;
    const id = u.searchParams.get('race_id');
    return /^\d{12}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

export const oddsApiUrl = (raceId, kind) =>
  `https://race.netkeiba.com/api/api_get_jra_odds.html?race_id=${raceId}&type=${TYPE[kind]}&action=update`;

export const shutubaUrl = (raceId) => `https://race.netkeiba.com/race/shutuba.html?race_id=${raceId}`;

// 当日の実オッズかどうか（発売前は status が "yoso" で、単勝の予想オッズだけが返る）。
export const isLiveOdds = (json) => ['middle', 'result'].includes(json?.status);

export const oddsTime = (json) => json?.data?.update_datetime || json?.data?.official_datetime || '';

// "0102" → "1-2"。発売前の予想オッズは単勝のキーがゼロ埋めされない（"4"）。
const toKey = (k) => (k.length <= 2 ? String(Number(k)) : (k.match(/\d\d/g) || []).map(Number).join('-'));

export function parseOdds(kind, json) {
  const group = json?.data?.odds?.[String(TYPE[kind])];
  if (!group || typeof group !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(group)) {
    const o = Number(Array.isArray(v) ? v[0] : v);
    if (Number.isFinite(o) && o > 0) out[toKey(k)] = o;
  }
  return out;
}

// 出馬表 HTML から 番号 → 馬名。
// 枠順確定前は馬番が空なので、行の id（tr_20 の 20）を使う。予想オッズのキーもこの番号になっている。
export function parseEntries(html, DOMParserImpl = globalThis.DOMParser) {
  const doc = new DOMParserImpl().parseFromString(html, 'text/html');
  const byUmaban = {}, byEntry = {};
  for (const tr of doc.querySelectorAll('tr.HorseList')) {
    const nameEl = tr.querySelector('.HorseName a');
    const name = nameEl?.getAttribute('title') || nameEl?.textContent.trim();
    if (!name) continue;
    const noCell = [...tr.querySelectorAll('td')].find((td) => /\bUmaban\d*\b/.test(td.className));
    const no = Number(noCell?.textContent.trim());
    if (no > 0) byUmaban[no] = name;
    const entry = Number(tr.id.match(/^tr_(\d+)$/)?.[1]);
    if (entry > 0) byEntry[entry] = name;
  }
  const drawn = Object.keys(byUmaban).length > 0;
  return { names: drawn ? byUmaban : byEntry, drawn };
}

export const parseHorseNames = (html, DOMParserImpl) => parseEntries(html, DOMParserImpl).names;

// 単勝オッズが空のときに、何が足りないのかを伝える。
export function missingOddsMessage(winJson) {
  if (winJson?.status === 'limit') {
    return 'netkeiba のオッズ更新回数の上限に達しました。しばらく時間をおいてからもう一度お試しください';
  }
  if (winJson?.status === 'NG') {
    return 'netkeiba に予想オッズもまだ出ていないため計算できません。予想オッズが公開されてから（重賞はおおむね出走馬確定後）もう一度お試しください';
  }
  return 'オッズを取得できませんでした';
}
