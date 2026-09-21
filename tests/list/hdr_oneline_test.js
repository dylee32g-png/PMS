/* 헤더 한 줄 전수 검사 (2026-09-18)
 *   ProjectListScreen.jsx의 <header> JSX 원문을 그대로 떼어 내 React로 렌더하고,
 *   진짜 크롬(헤드리스)에 실제 배포 CSS와 함께 올려 "두 줄이 되는가"를 눈이 아니라 좌표로 잰다.
 *   판정 = 헤더 직계 자식들의 offsetTop이 전부 같으면 한 줄.
 *
 *   상태 = 5팀(유지보수 포함) × 초안 4가지 × 창 폭 3가지 = 60가지
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.resolve(__dirname, '..', '..');   // 저장소 루트 (tests/list 기준)
const SRC = process.env.HDR_SRC || path.join(ROOT, 'src/components/ProjectListScreen.jsx');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = __dirname;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  OK   ' + m); } else { fail++; console.log('  NG   ' + m + (extra !== undefined ? '  → ' + extra : '')); } };

// ── 1. 소스 가드 (구조가 다시 무너지지 않게) ─────────────────────────────
const src = fs.readFileSync(SRC, 'utf8');
console.log('■ 1. 구조 가드 — 헤더가 줄을 늘릴 수 없는 모양인가');
const hStart = src.indexOf('<header className=');
const hEnd = src.indexOf('</header>', hStart);
ok(hStart > 0 && hEnd > hStart, '<header> 블록을 찾음');
const headerSrc = src.slice(hStart, hEnd + '</header>'.length);
const headOpen = headerSrc.slice(0, headerSrc.indexOf('>') + 1);
ok(/flex-nowrap/.test(headOpen), 'header = flex-nowrap (줄 늘리기 금지)', headOpen.slice(0, 90));
ok(!/\bflex-wrap\b/.test(headOpen), 'header에 flex-wrap 없음');
// 설정 드롭다운(절대위치)·서식 팔레트 안쪽은 제외하고, 헤더 '줄'을 이루는 부분만 본다
const rowPart = headerSrc.slice(0, headerSrc.indexOf('{/* 설정 드롭다운') > 0 ? headerSrc.indexOf('{/* 설정 드롭다운') : headerSrc.length);
const wrapHits = (rowPart.match(/\bflex-wrap\b/g) || []).length;
ok(wrapHits === 0, '헤더 줄을 이루는 곳에 flex-wrap 0개', wrapHits);
ok(/gap-2 min-w-0 flex-1"/.test(rowPart), '왼쪽 그룹 = 줄어드는 쪽(flex-1)');
ok(!/min-w-0 flex-1 overflow-hidden/.test(rowPart),
   '★왼쪽 그룹에 overflow-hidden 금지 (팀 전환 드롭다운이 잘림 — 2026-09-18 실제로 겪음)');
ok(/gap-1\.5 min-w-0 overflow-hidden/.test(rowPart), '자르기는 미니 요약에서만');
ok(/justify-end gap-1 shrink-0/.test(rowPart), '오른쪽 도구 줄 = shrink-0 (항상 온전)');

// ── 2. draftLabel 단위 검사 ──────────────────────────────────────────────
console.log('\n■ 2. [저장] 버튼 라벨 (짧아야 예산이 남는다)');
const lblSrc = src.match(/const draftLabel = \(\) => [^\n]+/)[0];
const mkLabel = new Function('draftCellCount', 'draftNewCount',
    lblSrc.replace('const draftLabel = () =>', 'return') + ';');
const LBL = [[3, 0, '3칸'], [0, 1, '새 행 1건'], [3, 1, '3칸+새 행 1건'], [12, 5, '12칸+새 행 5건']];
LBL.forEach(([c, n, want]) => ok(mkLabel(c, n) === want, `칸 ${c} · 새 행 ${n} → "${want}"`, mkLabel(c, n)));
ok(!mkLabel(0, 1).includes('0칸'), '새 행만 있을 때 "0칸"이 안 나옴', mkLabel(0, 1));

// ── 3. 헤더 JSX 원문을 그대로 렌더 ───────────────────────────────────────
console.log('\n■ 3. 헤더 원문 렌더 (실제 JSX · 가짜로 다시 만든 것 아님)');
// 헬퍼(require) 줄이 맨 위로 올라오므로, JSX는 함수 안에 넣어 통째로 모듈처럼 실행한다
const compiled = babel.transformSync(
    'module.exports = function (ctx) { with (ctx) { return (' + headerSrc + '); } };', {
    presets: [['babel-preset-react-app', { runtime: 'classic' }]],
    filename: 'hdr.js', babelrc: false, configFile: false, sourceType: 'script',
}).code.replace(/^["']use strict["'];?/, '');
const renderHeader = (() => { const m = { exports: {} }; new Function('module', 'require', compiled)(m, require); return m.exports; })();

const GLOBALS = new Set(['Math', 'Number', 'String', 'Object', 'Array', 'JSON', 'Date', 'Boolean', 'Set', 'Map',
    'WeakMap', 'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'console', 'Promise', 'Error', 'Symbol',
    'Intl', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'Infinity', 'NaN', 'undefined']);

// 아이콘(lucide)·모르는 이름은 안전한 대역으로 — 아이콘은 size 만큼 자리를 차지하게
const Icon = (p) => React.createElement('i', { style: { display: 'inline-block', width: (p.size || 16) + 'px', height: (p.size || 16) + 'px', flex: 'none' } });
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const SCALE_OPTIONS = [70, 80, 90, 100, 110, 120, 130, 140, 150];

function ctxFor(team, cells, news, filters) {
    const base = {
        React, currentTeam: team, selectedYear: '2026', MONTHS, SCALE_OPTIONS,
        dataSource: 'firebase', isAdmin: true, devC: true, tableScale: 100, compactMode: 0,
        searchTerm: '', draftCellCount: cells, draftNewCount: news, draftTotal: cells + news,
        draftLabel: () => mkLabel(cells, news), selectedMonth: 'all', statusFilter: 'all',
        onBack: () => {}, guardNav: (f) => f, showSettings: false, backlogOpen: false,
        draftSaving: false, teamDropOpen: !!process.env.HDR_DROP, settingsOpen: false, fmtBar: null, sortConfig: { key: null },
        availableYears: ['2026', '2025', '2024', '2023', '2022', '2021', '2020'],
        monthCountMap: { all: 215, etc: 12, '01': 18, '02': 17, '03': 21, '04': 19, '05': 16, '06': 20, '07': 22, '08': 19, '09': 17, '10': 14, '11': 12, '12': 8 },
        kpiData: {
            total: 215, ccOn: true, ccTotal: 215, ccStName: '진행 현황', avgPct: 62, pctN: 130,
            ccItems: [{ 라벨: '진행중', cnt: 130 }, { 라벨: '추진중', cnt: 53 }, { 라벨: '완료', cnt: 32 }],
            ptPct: 22, accSum: 3766, totSum: 17230, doneThisMonth: 3, dmOn: true,
        },
        columnFilters: filters ? { '진행 현황': ['진행중'], 담당자: ['김준혁 팀장'], 공장: ['P9'] } : {},
        // ★ 눈금 보완 (2026-09-21): 아래 이름들이 '없음'이면 실제 화면에 늘 있는 단추·배지가 안 그려져 폭을 적게 잰다
        //   (9/18에 고치기 전 백업이 1920px에서 '1줄'로 나온 원인 — 실제 사진은 2줄). 실제 앱은 이 셋을 항상 넘긴다.
        activeFilterCount: filters ? 3 : 0,                // 왼쪽 '필터 N' 배지
        onGoToPms: () => {}, onGoToBacklog: () => {},      // 오른쪽 [월간 업무 보고]·[작업 백로그] 단추 (App.js가 항상 넘김)
        activeStatusChips: new Set(), hiddenCols: [], teamProfile: { 팀: team, 열: {}, 기능: {} },
        LIST_TEAMS: ['기술1팀', '기술2팀', '기술3팀', 'Software팀'],
    };
    return new Proxy(base, {
        has: () => true,                                   // with(ctx) 가 모든 이름을 여기서 찾게
        get(t, k) {
            if (k in t) return t[k];
            if (typeof k !== 'string') return undefined;
            if (GLOBALS.has(k)) return globalThis[k];       // Math·Number 같은 기본 기능은 그대로
            if (/^[A-Z]/.test(k)) return Icon;              // 대문자 시작 = 부품(아이콘 등)
            if (NOOP.has(k)) return () => undefined;        // 그리는 도중 불리는 함수(아래에서 자동 학습)
            return undefined;   // ★모르는 이름은 '없음'(거짓) — 조건부 블록이 함부로 켜지지 않게
        },
    });
}

const NOOP = new Set();
function markup(team, cells, news, filters) {
    for (let i = 0; i < 80; i++) {
        try { return renderToStaticMarkup(renderHeader(ctxFor(team, cells, news, filters))); }
        catch (e) {
            const m = String(e.message).match(/^(\w+) is not a function/);   // 그리는 도중 불리는 함수는 빈 함수로
            if (m && !NOOP.has(m[1])) { NOOP.add(m[1]); continue; }
            throw e;
        }
    }
    throw new Error('렌더 실패');
}
const sample = markup('기술2팀', 0, 0, false);
ok(sample.startsWith('<header'), '헤더가 실제로 그려짐');
ok(sample.includes('프로젝트 List'), '제목이 들어 있음');
ok(sample.includes('기준연도'), '기준연도 선택기가 들어 있음');
ok(markup('기술2팀', 0, 1, false).includes('저장 새 행 1건'), '새 행 1건일 때 버튼 = "저장 새 행 1건"');
// ★ 눈금 검사 (2026-09-21): 실제 화면에 늘 있는 단추가 검사 그림에도 전부 있는가 — 하나라도 빠지면 폭을 적게 재서 눈금이 틀린다
console.log('\n■ 3-1. 눈금 — 실제 화면의 단추·배지가 검사 그림에도 전부 있는가');
const full = markup('기술2팀', 3, 1, true);
const rightHtml = full.slice(full.lastIndexOf('justify-end gap-1 shrink-0'));
const MUST = [['홈', '홈 — 팀 선택 화면으로'], ['서식 팔레트', 'title="서식'], ['프로젝트 추가', 'title="프로젝트 추가"'], ['월간 업무 보고', 'title="월간 업무 보고"'],
              ['작업 백로그', 'title="작업 백로그'], ['[저장 N칸]', '저장 3칸+새 행 1건'], ['[취소]', 'title="임시 편집 전부 되돌리기']];
MUST.forEach(([nm, sig]) => ok(rightHtml.includes(sig), '오른쪽 단추 있음: ' + nm));
ok(full.includes('필터 3'), "왼쪽 '필터 N' 배지 있음 (열 필터 켜진 상태)");
const btnN = (rightHtml.match(/<button/g) || []).length;
const srcRight = headerSrc.slice(headerSrc.indexOf('justify-end gap-1 shrink-0'), headerSrc.indexOf('{/* 설정 드롭다운'));
const srcBtnN = (srcRight.replace(/\{false && \(isAdmin[\s\S]*?\n\s*\)\}/, '').match(/<button/g) || []).length + 1;   // +1 = ⚙ 설정 단추(드롭다운 주석 뒤에 있음)
ok(btnN >= 9 && btnN === srcBtnN, `오른쪽 단추 개수 = 원문 단추 개수 (${btnN} = ${srcBtnN}, 항상 꺼진 전체 저장 제외·⚙ 포함)`, btnN + ' vs ' + srcBtnN);

// ── 4. 진짜 크롬으로 폭 재기 ────────────────────────────────────────────
console.log('\n■ 4. 실제 크롬에서 두 줄이 되는지 좌표로 측정');
const cssFile = fs.readdirSync(path.join(ROOT, 'build/static/css')).find(f => f.endsWith('.css'));
const css = fs.readFileSync(path.join(ROOT, 'build/static/css', cssFile), 'utf8');
console.log('     실제 배포 CSS 사용: build/static/css/' + cssFile);

const TEAMS = ['기술1팀', '기술2팀', '기술3팀', 'Software팀', 'Software팀 유지보수'];   // 제목이 가장 긴 유지보수 장표까지 (사진 속 화면)
const DRAFTS = [[0, 0, '초안 없음'], [3, 0, '고친 칸 3'], [0, 1, '새 행 1'], [12, 5, '칸 12 + 새 행 5']];
const WIDTHS = [1920, 1600, 1366];
const cases = [];
TEAMS.forEach(t => DRAFTS.forEach(([c, n, dl]) => WIDTHS.forEach(w => cases.push({ t, c, n, dl, w }))));

const blocks = cases.map((cs, i) => `
<div class="case" data-i="${i}" style="width:${cs.w}px">
  <div class="p-4">${markup(cs.t, cs.c, cs.n, cs.w < 1600)}</div>
</div>`).join('\n');

// 팀 전환 드롭다운이 잘리지 않는지 (2026-09-18: 왼쪽 그룹에 overflow-hidden을 주면 잘려서 안 보였음)
process.env.HDR_DROP = '1';
const dropHtml = `<div class="case" data-drop="1" style="width:1366px"><div class="p-4">${markup('Software팀 유지보수', 0, 1, true)}</div></div>`;
delete process.env.HDR_DROP;
ok(dropHtml.includes('기술1팀'), '드롭다운이 열린 상태를 그림 (팀 목록 포함)');

// ★앱은 Tailwind을 CDN 런타임으로 씁니다(public/index.html) — 검사 페이지도 똑같이 올려야 폭이 실제와 같다
const twjs = fs.readFileSync(path.join(TMP, 'tailwind.cdn.js'), 'utf8');
const _idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const _a = _idx.indexOf('tailwind.config =');
const twcfg = _idx.slice(_a, _idx.indexOf('</' + 'script>', _a));
ok(twjs.length > 300000 && twcfg.includes('slate'), '앱과 같은 Tailwind(CDN) + 설정을 실었음');

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<script>${twjs}<\/script>
<script>${twcfg}<\/script>
<style>${css}</style>
<style>body{margin:0}.case{overflow:hidden;border:0}</style>
</head><body>
${blocks}
${dropHtml}
<pre id="out"></pre>
<script>
const res = [];
if (!getComputedStyle(document.querySelector('.case header')).display.includes('flex')) {
  document.getElementById('out').textContent = 'RESULT[]';   // Tailwind 미적용 = 측정 무효
  throw new Error('tailwind not applied');
}
document.querySelectorAll('.case:not([data-drop])').forEach(box => {
  const h = box.querySelector('header');
  const kids = [...h.children].filter(e => getComputedStyle(e).position !== 'absolute' && e.offsetParent !== null);
  const rc = kids.map(e => e.getBoundingClientRect());
  let lines = 1;
  for (let i = 1; i < rc.length; i++) if (Math.round(rc[i].top) >= Math.round(rc[i-1].bottom)) lines++;
  const maxKid = Math.max(0, ...rc.map(r => r.height));
  const right = kids[kids.length - 1];
  const hcs = getComputedStyle(h);
  const padV = parseFloat(hcs.paddingTop) + parseFloat(hcs.paddingBottom);
  res.push({ i: +box.dataset.i, lines, padV: Math.round(padV), h: Math.round(h.getBoundingClientRect().height),
             maxKid: Math.round(maxKid), over: Math.round(h.scrollWidth - h.clientWidth),
             rightW: right ? Math.round(right.getBoundingClientRect().width) : 0 });
});
// 팀 드롭다운이 조상의 overflow:hidden 에 잘리지 않는가
const dbox = document.querySelector('[data-drop]');
const dd = dbox && [...dbox.querySelectorAll('header .absolute')].find(e => e.textContent.includes('기술1팀'));
let drop = { found: !!dd, h: 0, clipped: null };
if (dd) {
  const r = dd.getBoundingClientRect();
  drop.h = Math.round(r.height);
  let cl = false;
  for (let p = dd.parentElement; p && !p.classList.contains('case'); p = p.parentElement) {   /* .case = 검사 장치의 틀이라 제외 */
    const o = getComputedStyle(p).overflow + getComputedStyle(p).overflowY;
    if (o.includes('hidden') || o.includes('clip')) {
      const pr = p.getBoundingClientRect();
      if (Math.round(r.bottom) > Math.round(pr.bottom) + 1) cl = true;   // 부모 밖으로 나가는데 잘림
    }
  }
  drop.clipped = cl;
}
document.getElementById('out').textContent = 'RESULT' + JSON.stringify({ res, drop });
</script></body></html>`;

const page = path.join(os.tmpdir(), 'pms_hdr_measure.html');   // 결과 페이지는 임시 폴더에 (저장소 오염 방지)
fs.writeFileSync(page, html, 'utf8');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hdrchrome-'));
const dump = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=4000', '--window-size=1920,1200', '--user-data-dir=' + profile,
    '--dump-dom', 'file:///' + page.replace(/\\/g, '/')], { encoding: 'utf8', maxBuffer: 1 << 28 });
const m = dump.match(/RESULT(\{.*\})<\/pre>/s);
ok(!!m, '크롬 측정 결과를 받음');
const _all = JSON.parse(m[1]); const res = _all.res; const drop = _all.drop;
ok(res.length === cases.length, `${cases.length}가지 상태 전부 측정됨`, res.length);

const bad = [];
res.forEach(r => { const cs = cases[r.i]; if (r.lines !== 1) bad.push(`${cs.t} · ${cs.dl} · ${cs.w}px → ${r.lines}줄(높이 ${r.h}px)`); });
ok(bad.length === 0, `전 상태(${cases.length}가지) 헤더 한 줄`, '\n       ' + bad.slice(0, 8).join('\n       '));

const h1 = [...new Set(res.map(r => r.h))];
const gaps = [...new Set(res.map(r => r.h - r.maxKid - r.padV))];
ok(res.every(r => r.h - r.maxKid - r.padV <= 4), '헤더 높이 = 가장 높은 묶음 하나치 + 여백 (줄이 안 늘어남)',
   '헤더 ' + h1.join(',') + 'px · 남는 차 ' + gaps.join(',') + 'px');
const rw = res.filter(r => cases[r.i].w === 1920).map(r => r.rightW);
ok(Math.min(...rw) > 300, '1920px에서 오른쪽 도구 줄이 안 눌림', Math.min(...rw) + 'px');

ok(drop.found, '팀 전환 드롭다운이 실제로 그려짐');
ok(drop.h > 40, '드롭다운이 찌그러지지 않음', drop.h + 'px');
ok(drop.clipped === false, '★드롭다운이 조상 overflow:hidden 에 안 잘림', drop.clipped);

console.log('\n     폭별 결과(줄 수 / 헤더 높이):');
WIDTHS.forEach(w => {
    const rs = res.filter(r => cases[r.i].w === w);
    console.log(`       ${w}px : ${[...new Set(rs.map(r => r.lines))].join(',')}줄 · 높이 ${[...new Set(rs.map(r => r.h))].join(',')}px`);
});

console.log('\n' + '='.repeat(62));
console.log(`결과: ${pass}/${pass + fail} 통과` + (fail ? `  ★ 실패 ${fail}건` : '  ✓'));
process.exit(fail ? 1 : 0);
