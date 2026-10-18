import { raceIdFromUrl, oddsApiUrl, shutubaUrl, parseOdds, parseEntries, isLiveOdds, oddsTime, missingOddsMessage } from '../sources/netkeiba.js';
import { keibalabRaceIdFromUrl, syutsubaUrl, parseMarks } from '../sources/keibalab.js';
import { assemble } from '../core/assemble.js';
import { fillMissingOdds } from '../core/estimate.js';
import { recommend } from '../core/optimizer.js';

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { win: '単勝', wide: 'ワイド', quinella: '馬連', trio: '三連複' };
const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function findTabs() {
  const tabs = await chrome.tabs.query({});
  const pick = (fn) => tabs.filter((t) => fn(t.url || '')).sort((a, b) => (b.active - a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  const nk = pick(raceIdFromUrl);
  const kl = pick(keibalabRaceIdFromUrl);
  return {
    netkeiba: nk && { raceId: raceIdFromUrl(nk.url), title: nk.title || '' },
    keibalab: kl && { raceId: keibalabRaceIdFromUrl(kl.url) },
  };
}

// 文字コードはレスポンスヘッダに従う（netkeiba の出馬表は UTF-8）。
// netkeiba はログイン中の Cookie を送るとユーザーごとの更新回数制限（status=limit）に
// かかるので、未ログインの閲覧と同じく Cookie を送らない。競馬ラボはログイン状態を使う。
async function fetchText(url, credentials = 'omit') {
  const res = await fetch(url, { credentials });
  if (!res.ok) throw new Error(`${url} の取得に失敗しました（${res.status}）`);
  return res.text();
}

async function fetchOddsJson(raceId, kind) {
  try {
    return JSON.parse(await fetchText(oddsApiUrl(raceId, kind)));
  } catch (err) {
    return { fetchError: err.message || String(err) }; // 原因を画面に出せるよう残す
  }
}

// エラー文に、取得結果の中身を添える。
function oddsDetail(json) {
  if (json.fetchError) return `詳細: ${json.fetchError}`;
  return `詳細: status=${json.status ?? 'なし'} reason=${json.reason ?? 'なし'}`;
}

async function loadRace(tabs) {
  const raceId = tabs.netkeiba.raceId;
  const { names, drawn } = parseEntries(await fetchText(shutubaUrl(raceId)));
  const winJson = await fetchOddsJson(raceId, 'win');
  const raw = { win: parseOdds('win', winJson) };
  if (!Object.keys(raw.win).length) throw new Error(`${missingOddsMessage(winJson)}（レースID ${raceId}、${oddsDetail(winJson)}）`);
  for (const kind of ['wide', 'quinella', 'trio']) raw[kind] = parseOdds(kind, await fetchOddsJson(raceId, kind)); // 直列で取得

  // 発売前などで取れない券種は、単勝（予想）オッズから推定して計算を続ける。
  const { odds, estimated } = fillMissingOdds(raw);
  const extraWarnings = [];
  if (!drawn) extraWarnings.push('枠順確定前のため、表の番号は netkeiba の登録順です（馬番ではありません）。競馬ラボの印も使えません');
  if (!isLiveOdds(winJson)) extraWarnings.push('発売前のため、netkeiba の予想オッズで計算しています。実際のオッズとは違います');
  if (estimated.length) {
    const label = { wide: 'ワイド', quinella: '馬連', trio: '三連複' };
    extraWarnings.push(`${estimated.map((k) => label[k]).join('・')}のオッズは単勝オッズからの推定値です。購入前に実際のオッズで計算し直してください`);
  }

  let keibalab = { horses: {}, marks: {}, reporters: 0 };
  if (tabs.keibalab && drawn) {
    try {
      keibalab = parseMarks(await fetchText(syutsubaUrl(tabs.keibalab.raceId), 'include'));
    } catch {
      extraWarnings.push('競馬ラボのページを取得できなかったため、印を使っていません');
    }
  }
  return { names, odds, keibalab, time: oddsTime(winJson), extraWarnings };
}

function horseLabel(horses, names) {
  return horses.map((h) => `${h}${names[h] ? ` ${esc(names[h])}` : ''}`).join(' - ');
}

function render(rec, names, time) {
  const out = $('result');
  out.textContent = '';
  if (rec.status === 'none') {
    out.innerHTML = '<p><span class="badge none">おすすめなし</span></p><p>条件を満たす買い方がありません。予算を増やすか、詳細設定の的中率の下限を下げてください。</p>';
    return;
  }
  const badge = rec.status === 'ok'
    ? '<span class="badge ok">おすすめ</span>'
    : '<span class="badge negative">期待値マイナス</span> 条件内で最も良い買い方です';
  const rows = rec.stakes.map((s) => `
    <tr>
      <td>${TYPE_LABEL[s.bet.type]}</td>
      <td>${horseLabel(s.bet.horses, names)}</td>
      <td class="num">${yen(s.amount)}</td>
      <td class="num">${s.bet.odds.toFixed(1)}</td>
      <td class="num">${yen(s.payout)}</td>
    </tr>`).join('');
  out.innerHTML = `
    <p>${badge}</p>
    <table>
      <thead><tr><th>券種</th><th>馬番</th><th class="num">金額</th><th class="num">オッズ</th><th class="num">払戻</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="summary">合計 <b>${yen(rec.total)}</b> ／ 的中率の目安 <b>${pct(rec.hitRate)}</b> ／ 期待回収率 <b>${pct(rec.expectedReturn)}</b></p>
    <p class="notice">オッズ時刻 ${esc(time)}。オッズは締切まで動くので、購入の直前にもう一度計算してください。ワイドのオッズは下限値で計算しています。</p>`;
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = false;
  $('result').textContent = '';
}

async function main() {
  const tabs = await findTabs();
  if (!tabs.netkeiba) {
    $('race').textContent = '';
    showError('netkeiba の対象レースのページ（出馬表やオッズ）と、競馬ラボの同じレースのページを開いてください。');
    $('run').disabled = true;
    return;
  }
  $('race').textContent = tabs.netkeiba.title.split('|')[0].trim() || `レースID ${tabs.netkeiba.raceId}`;
  if (!tabs.keibalab) $('race').textContent += '（競馬ラボのページが開かれていません）';

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('error').hidden = true;
    $('warnings').textContent = '';
    $('result').textContent = '計算中…';
    $('run').disabled = true;
    try {
      const { names, odds, keibalab, time, extraWarnings } = await loadRace(tabs);
      const { probs, marketProbs, warnings } = assemble({ netkeibaNames: names, odds, keibalab, k: Number($('k').value) });
      if (!tabs.keibalab) warnings.unshift('競馬ラボのページが開かれていないため、印を使っていません');
      warnings.unshift(...extraWarnings);
      for (const w of warnings) {
        const li = document.createElement('li');
        li.textContent = w;
        $('warnings').append(li);
      }
      const rec = recommend({
        probs,
        marketProbs,
        odds,
        budget: Number($('budget').value),
        options: { minHitRate: Number($('minHit').value) / 100, minWideShare: Number($('minWide').value) / 100 },
      });
      render(rec, names, time);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      $('run').disabled = false;
    }
  });
}

main();
