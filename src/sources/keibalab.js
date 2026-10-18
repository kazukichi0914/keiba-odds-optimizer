// 競馬ラボ出馬表（/db/race/<id>/syutsuba.html）の予想印の読み取り。
// 未ログインでも見える α・β・Ω の3列を「3人分の印」として扱う（2026-10-18 秋華賞で確認）。
// 予想家の印は競馬ラボIDでのログインが必要で、この版では読まない。
import { markScore } from '../core/probability.js';

const MARK_COLUMNS = ['α', 'β', 'Ω'];

export function keibalabRaceIdFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'www.keibalab.jp') return null;
    return u.pathname.match(/^\/db\/race\/(\d{12})\//)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const syutsubaUrl = (raceId) => `https://www.keibalab.jp/db/race/${raceId}/syutsuba.html`;

export function parseMarks(html, DOMParserImpl = globalThis.DOMParser) {
  const doc = new DOMParserImpl().parseFromString(html, 'text/html');
  const horses = {};
  const marks = {};
  const table = [...doc.querySelectorAll('table')].find((t) =>
    [...t.querySelectorAll('thead th')].some((th) => th.textContent.trim() === '馬'));
  if (!table) return { horses, marks, reporters: 0 };

  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  const noIdx = heads.indexOf('馬');
  const markIdx = MARK_COLUMNS.map((m) => heads.indexOf(m)).filter((i) => i >= 0);

  for (const tr of table.querySelectorAll('tbody tr')) {
    const tds = [...tr.children].filter((el) => el.tagName === 'TD');
    const no = Number(tds[noIdx]?.textContent.trim());
    const name = tr.querySelector('[data-hsnm]')?.getAttribute('data-hsnm');
    if (!(no > 0) || !name) continue;
    horses[no] = name;
    if (markIdx.length) marks[no] = markIdx.map((i) => markScore(tds[i]?.textContent));
  }
  const reporters = Object.keys(marks).length ? markIdx.length : 0;
  return { horses, marks: reporters ? marks : {}, reporters };
}
