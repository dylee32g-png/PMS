# -*- coding: utf-8 -*-
"""
PMS 진척자료 클라우드 자동 반영기  (2026-07-30)
──────────────────────────────────────────────────────────────────────────────
하는 일
    ① Microsoft에 앱 권한으로 토큰 요청 (사람 로그인 없음)
    ② Graph API로 오피스365 클라우드의 엑셀 셀을 직접 읽음
    ③ PMS와 똑같은 규칙으로 계산 (PLC · ETOS · 하위 공종표)
    ④ 값이 달라졌으면 Firestore에 기록 → 직원 PMS 화면에 즉시 반영

왜 이렇게 만드나
    기존 방식은 공용 PC 브라우저가 NAS(또는 OneDrive 동기화) 폴더의 '파일'을 읽었다.
    2026-07-30 실측 결과 OneDrive 동기화가 파일 시각만 갱신하고 내용을 안 가져오는
    현상이 재현되어(두 차례), 동기화 폴더 경유는 신뢰할 수 없다고 판단.
    이 프로그램은 클라우드를 직접 읽으므로 동기화를 기다리지 않는다.

설정은 config.json 에서 읽는다. 비밀키는 이 파일에 들어있지 않다.
"""

import json, time, sys, os, re, math, datetime
import requests
import firebase_admin
from firebase_admin import credentials, firestore

HERE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(HERE, 'config.json')
GRAPH = 'https://graph.microsoft.com/v1.0'


# ── 로그 ─────────────────────────────────────────────────────────────────────
def log(msg):
    t = datetime.datetime.now().strftime('%m-%d %H:%M:%S')
    print(f'[{t}] {msg}', flush=True)


# ── 설정 ─────────────────────────────────────────────────────────────────────
def load_config():
    if not os.path.exists(CFG_PATH):
        log(f'★ config.json 이 없습니다: {CFG_PATH}')
        sys.exit(1)
    with open(CFG_PATH, encoding='utf-8') as f:
        c = json.load(f)
    need = ['tenant', 'client_id', 'client_secret', 'drive_user', 'folder',
            'firebase_key', 'app_id', 'team']
    miss = [k for k in need if not c.get(k) or str(c[k]).startswith('여기에')]
    if miss:
        log(f'★ config.json 에 아직 안 채운 항목: {", ".join(miss)}')
        sys.exit(1)
    c.setdefault('interval_min', 15)
    c.setdefault('dry_run', False)
    return c


# ── ① Microsoft 토큰 (앱 권한 · 사람 로그인 없음) ─────────────────────────────
_tok = {'v': None, 'exp': 0}

def ms_token(cfg):
    if _tok['v'] and time.time() < _tok['exp'] - 120:
        return _tok['v']
    url = f"https://login.microsoftonline.com/{cfg['tenant']}/oauth2/v2.0/token"
    r = requests.post(url, data={
        'client_id':     cfg['client_id'],
        'client_secret': cfg['client_secret'],
        'scope':         'https://graph.microsoft.com/.default',
        'grant_type':    'client_credentials',
    }, timeout=30)
    j = r.json()
    if not r.ok:
        raise RuntimeError(f"토큰 발급 실패 {r.status_code}: {j.get('error_description', j)}")
    _tok['v'] = j['access_token']
    _tok['exp'] = time.time() + int(j.get('expires_in', 3600))
    log(f"MS 토큰 발급 (유효 {j.get('expires_in')}초)")
    return _tok['v']


def g_get(cfg, path):
    r = requests.get(GRAPH + path, headers={'Authorization': 'Bearer ' + ms_token(cfg)}, timeout=60)
    if not r.ok:
        try:   detail = r.json().get('error', {}).get('message', r.text[:200])
        except Exception: detail = r.text[:200]
        raise RuntimeError(f'Graph {r.status_code} — {path}\n    {detail}')
    return r.json()


# ── 엑셀 도우미 ───────────────────────────────────────────────────────────────
def col_to_idx(col):
    """'A'→0, 'B'→1, 'AA'→26"""
    n = 0
    for ch in col.upper():
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def split_addr(addr):
    """'L14' → ('L', 14)"""
    m = re.match(r'^([A-Za-z]{1,3})(\d{1,5})$', str(addr).strip())
    if not m:
        raise ValueError(f'셀 주소 형식 오류: {addr}')
    return m.group(1).upper(), int(m.group(2))


def expand_cells(cells):
    """'F24:M25' 같은 범위를 셀 목록으로 펼침 (PMS expandExtCells 와 동일)"""
    out = []
    for raw in (cells or []):
        t = str(raw).strip().upper()
        m = re.match(r'^([A-Z]{1,3})(\d{1,5}):([A-Z]{1,3})(\d{1,5})$', t)
        if m:
            c1, c2 = col_to_idx(m.group(1)), col_to_idx(m.group(3))
            r1, r2 = int(m.group(2)), int(m.group(4))
            for r in range(min(r1, r2), max(r1, r2) + 1):
                for c in range(min(c1, c2), max(c1, c2) + 1):
                    out.append(idx_to_col(c) + str(r))
        else:
            out.append(t)
    return out


def idx_to_col(i):
    s, n = '', i + 1
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def pct(v):
    """PMS와 동일: 0~1.5는 비율로 보고 ×100, 그보다 크면 이미 % 숫자"""
    return v * 100 if 0 <= v <= 1.5 else v


def num_or_none(v):
    """문자열이면 %·콤마·공백 제거 후 숫자 변환 (PMS computeExtRuleValue 와 동일)"""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = re.sub(r'[%,\s]', '', v)
        if s == '':
            return None
        try:    return float(s)
        except ValueError: return None
    return None


def name_date(name):
    """파일명 마지막 6자리 날짜(YYMMDD) — PMS extNameDate 와 동일"""
    m = re.findall(r'\d{6}', str(name or ''))
    return int(m[-1]) if m else 0


# ── ② 클라우드에서 파일·시트·범위 읽기 ────────────────────────────────────────
def list_folder(cfg):
    folder = '/'.join(requests.utils.quote(p, safe='') for p in cfg['folder'].split('/') if p)
    j = g_get(cfg, f"/users/{requests.utils.quote(cfg['drive_user'])}/drive/root:/{folder}:/children")
    return [f for f in j.get('value', []) if 'file' in f]


def pick_latest(files, pattern):
    """PMS pickLatestExtFile 과 동일: 이름 포함 → 파일명 날짜 → 수정시각"""
    pat = re.sub(r'\s', '', str(pattern)).upper()
    cand = [f for f in files
            if not f['name'].startswith('~$')
            and re.search(r'\.(xlsx|xlsm)$', f['name'], re.I)
            and (not pat or pat in re.sub(r'\s', '', f['name']).upper())]
    if not cand:
        return None
    cand.sort(key=lambda f: (name_date(f['name']), f.get('lastModifiedDateTime', '')), reverse=True)
    return cand[0]


_ws_cache = {}

def sheet_id(cfg, item_id, sheet_name):
    key = (item_id, sheet_name)
    if key in _ws_cache:
        return _ws_cache[key]
    j = g_get(cfg, f'/users/{requests.utils.quote(cfg["drive_user"])}/drive/items/{item_id}/workbook/worksheets')
    want = re.sub(r'\s', '', sheet_name)
    for s in j.get('value', []):
        if re.sub(r'\s', '', s['name']) == want:
            _ws_cache[key] = s['id']
            return s['id']
    raise RuntimeError(f"시트 '{sheet_name}' 없음 (있는 시트: {[s['name'] for s in j.get('value', [])][:10]})")


def read_range(cfg, item_id, ws_id, address):
    p = (f'/users/{requests.utils.quote(cfg["drive_user"])}/drive/items/{item_id}'
         f'/workbook/worksheets/{requests.utils.quote(ws_id, safe="")}'
         f"/range(address='{address}')")
    return g_get(cfg, p).get('values', [])


# ── ③ 규칙 계산 (PMS projectListData.js 와 동일 규칙) ─────────────────────────
def compute_cells_rule(cfg, item_id, rule):
    """target/sheet/cells/op/decimals 형태의 단순 규칙"""
    ws = sheet_id(cfg, item_id, rule['sheet'])
    addrs = expand_cells(rule.get('cells'))
    if not addrs:
        raise RuntimeError('읽을 셀이 없음')
    if len(addrs) > 200:
        raise RuntimeError(f'셀이 {len(addrs)}개 — 범위를 확인하세요(200개 초과)')

    # 흩어진 셀을 감싸는 최소 사각형 하나로 읽어 호출 수를 줄인다
    cols = [col_to_idx(split_addr(a)[0]) for a in addrs]
    rows = [split_addr(a)[1] for a in addrs]
    box = f'{idx_to_col(min(cols))}{min(rows)}:{idx_to_col(max(cols))}{max(rows)}'
    values = read_range(cfg, item_id, ws, box)
    r0, c0 = min(rows), min(cols)

    nums = []
    for a in addrs:
        c, r = split_addr(a)
        try:
            raw = values[r - r0][col_to_idx(c) - c0]
        except IndexError:
            raise RuntimeError(f'셀 {a} 를 읽지 못함')
        v = num_or_none(raw)
        if v is None:
            raise RuntimeError(f'셀 {a} 값이 숫자가 아님 (빈칸?) — 읽은 값 {raw!r}')
        nums.append(pct(v))

    total = sum(nums)
    raw = total if rule.get('op') == 'sum' else total / len(nums)
    d = rule.get('decimals')
    d = d if isinstance(d, (int, float)) else 1
    return round(raw, int(d)), len(nums)


def compute_subtable(cfg, item_id, rule):
    """하위 공종표 규칙 — PMS computeExtSubTable 과 동일 판정
       · 이름열에 글자 + 총점열·첫 %열이 숫자인 행 = 공종 데이터 행
       · B열 또는 이름열이 '총계'인 행을 만나면 부모 총계로 쓰고 중단"""
    ws = sheet_id(cfg, item_id, rule['sheet'])
    values = read_range(cfg, item_id, ws, 'A1:AZ200')

    def cell(col, r):
        try:    return values[r - 1][col_to_idx(col)]
        except (IndexError, TypeError): return None

    def isnum(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool)

    d = rule.get('decimals')
    d = int(d) if isinstance(d, (int, float)) else 1
    sub_cols   = rule.get('subCols') or {}
    parent_cols = rule.get('parentCols') or {}
    name_col   = rule.get('nameCol') or 'C'
    first_col  = list(sub_cols.values())[0] if sub_cols else None

    rows, total = [], None
    for r in range(1, 201):
        raw_name = cell(name_col, r)
        b_val    = cell('B', r)
        norm = lambda v: re.sub(r'\s', '', str(v if v is not None else ''))
        if norm(b_val) == '총계' or norm(raw_name) == '총계':
            vals = {}
            for tgt, col in parent_cols.items():
                v = cell(col, r)
                if not isnum(v):
                    raise RuntimeError(f'총계행 {col}{r} 값이 숫자가 아님')
                vals[tgt] = round(pct(v), d)
            acc = None
            if rule.get('parentAccCol'):
                v = cell(rule['parentAccCol'], r)
                if not isnum(v):
                    raise RuntimeError(f"총계행 {rule['parentAccCol']}{r}(누적) 값이 숫자가 아님")
                acc = v
            total = {'values': vals, 'acc': acc}
            break
        if raw_name is None or str(raw_name).strip() == '':
            continue
        if not isnum(cell(rule.get('subPtCol'), r)) or not isnum(cell(first_col, r)):
            continue
        vals = {}
        bad = ''
        for tgt, col in sub_cols.items():
            v = cell(col, r)
            if not isnum(v):
                bad = f'{col}{r}'
                break
            vals[tgt] = round(pct(v), d)
        if bad:
            raise RuntimeError(f"공종 '{str(raw_name).strip()}' {bad} 값이 숫자가 아님")
        acc_v = cell(rule.get('parentAccCol'), r) if rule.get('parentAccCol') else None
        rows.append({'name': str(raw_name).strip(), 'row': r, 'values': vals,
                     'pt': cell(rule.get('subPtCol'), r),
                     'acc': acc_v if isnum(acc_v) else None})

    if not rows:
        raise RuntimeError('공종 행을 못 찾음 (이름열·시트 확인)')
    if total is None:
        raise RuntimeError("'총계' 행을 못 찾음")
    return rows, total


# ── ④-1 주간 진행실적 장부 (progressRecords) ─────────────────────────────────
#   PMS ProjectListScreen.jsx 의 syncProgressCellToLedger 와 동일 규칙:
#     · 공정률 7개만 기록 (포인트·시운전%·날짜·상태는 제외)
#     · docKey = _pid → pid → 실행번호 → execNo → 행ID
#     · 주차 = ceil(일/7), 최대 5.  키 형식 '2026-7-5' (월 0채움 없음)
#     · 같은 달에서 현재 주차보다 미래인 값은 지움 → 현재 주차가 '누적 최신값'
PROG_COL_TO_KEY = {'도면입수': 'drawing', 'I/OMAP': 'iomap', '화면작성': 'screen',
                   '기준정보': 'baseinfo', 'PLC': 'plc', 'ETOS': 'etos', 'HMI': 'hmi'}
# 기본 '미적용'이라 값이 들어가면 켜줘야 하는 항목 (PMS _naOn 과 동일)
NA_ON_TARGETS = {'도면입수': '도면입수', 'I/OMAP': 'I/O Map', '화면작성': '화면작성', '기준정보': '기준정보'}


def prog_item_key(header):
    return PROG_COL_TO_KEY.get(re.sub(r'\s+', '', str(header or '')).upper())


def week_key(now=None):
    now = now or datetime.datetime.now()
    w = min(5, max(1, -(-now.day // 7)))          # ceil(일/7)
    return f'{now.year}-{now.month}-{w}', now.year, now.month, w


def doc_key_of(row_id, row):
    for k in ('_pid', 'pid', '실행번호', 'execNo'):
        v = row.get(k)
        if v not in (None, ''):
            return str(v)
    return str(row_id)


def ledger_ref(db, cfg, doc_key):
    return (db.collection('artifacts').document(cfg['app_id'])
              .collection('public').document('data')
              .collection(f"progressRecords_{cfg['team']}").document(doc_key))


def _write_week(db, cfg, row_id, row, item_key, value):
    """주간 장부의 한 항목·현재 주차에 값 기록 (읽고 고쳐 쓰기 — 다른 항목·과거 주차 보존)"""
    try:
        num = max(0.0, float(value))
    except (TypeError, ValueError):
        return False
    if not math.isfinite(num):
        return False
    dk = doc_key_of(row_id, row)
    if not dk:
        return False
    wkey, cy, cm, cw = week_key()
    ref = ledger_ref(db, cfg, dk)
    snap = ref.get()
    data = snap.to_dict() if snap.exists else {
        'docKey': dk, 'execNo': str(row.get('실행번호') or row.get('execNo') or '')}
    weekly = dict(data.get('weekly') or {})
    weeks = dict(weekly.get(item_key) or {})
    removed = 0
    for wk in list(weeks.keys()):                  # 같은 달의 미래 주차 제거
        p = str(wk).split('-')
        try:
            if int(p[0]) == cy and int(p[1]) == cm and int(p[2]) > cw:
                del weeks[wk]
                removed += 1
        except (IndexError, ValueError):
            pass
    # 이미 같은 값이고 지울 것도 없으면 쓰지 않는다 (매 회차 불필요한 쓰기 방지 · 자기교정형)
    prev = num_or_none(weeks.get(wkey))
    if removed == 0 and prev is not None and abs(prev - num) < 0.05:
        return False
    weeks[wkey] = num
    weekly[item_key] = weeks
    data['weekly'] = weekly
    data['updatedAt'] = datetime.datetime.now().isoformat()
    ref.set(data)
    return True


def sync_ledger(db, cfg, row_id, row, header, value):
    """메인표 공정률 칸 → 주간 장부 (PMS syncProgressCellToLedger 와 동일)"""
    item = prog_item_key(header)
    if not item:
        return False                               # 공정률 7개가 아니면 무시
    if str(value if value is not None else '').strip() == '':
        return False
    return _write_week(db, cfg, row_id, row, item, value)


def sync_int_commissioning(db, cfg, row_id, row, acc_value):
    """누적(진행 pt) → 통합시운전 주간 장부 (PMS 규칙 반영부와 동일)"""
    return _write_week(db, cfg, row_id, row, 'intCommissioning', acc_value)


def js_num_str(v):
    """PMS 는 메인표에 문자열로 저장한다. 91.0 → '91', 89.6 → '89.6' (자바스크립트 String()과 동일)"""
    f = float(v)
    return str(int(f)) if f == int(f) else ('%g' % f)


# ── ④ Firestore ──────────────────────────────────────────────────────────────
def firestore_client(cfg):
    key = cfg['firebase_key']
    if not os.path.isabs(key):
        key = os.path.join(HERE, key)
    if not os.path.exists(key):
        log(f'★ Firebase 키 파일이 없습니다: {key}')
        sys.exit(1)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(key))
    return firestore.client()


def rows_collection(db, cfg):
    return (db.collection('artifacts').document(cfg['app_id'])
              .collection('public').document('data')
              .collection(f"projectListRows_{cfg['team']}"))


def cur_num(row, header):
    """메인표의 현재 값 (문자열 '89.6' 또는 '89.6%' 형태) → 숫자"""
    return num_or_none(row.get(header))


# ── 한 바퀴 ──────────────────────────────────────────────────────────────────
def run_once(cfg, db):
    files = list_folder(cfg)
    log(f"폴더 '{cfg['folder']}' — 파일 {len(files)}개: " +
        ', '.join(f"{f['name']}({f.get('lastModifiedDateTime','')[:16]})" for f in files))

    docs = list(rows_collection(db, cfg).stream())
    targets = []
    for d in docs:
        data = d.to_dict() or {}
        rules = ((data.get('_extSync') or {}).get('rules')) or []
        if rules:
            targets.append((d.id, data, rules))
    if not targets:
        log('자동 반영 규칙이 있는 행이 없습니다 — 할 일 없음')
        return
    log(f'규칙이 있는 프로젝트 {len(targets)}건')

    wrote = 0
    for row_id, row, rules in targets:
        name = row.get('Project') or row.get('프로젝트') or row_id
        for rule in rules:
            try:
                picked = pick_latest(files, rule.get('filePattern'))
                if not picked:
                    log(f"  [{name}] '{rule.get('filePattern')}' 파일을 폴더에서 못 찾음")
                    continue

                if rule.get('type') == 'subTable':
                    sub_rows, total = compute_subtable(cfg, picked['id'], rule)
                    log(f"  [{name}] 하위 공종표 — 공종 {len(sub_rows)}개 · "
                        f"총계 {total['values']} · 누적 {total['acc']}  (파일 {picked['name']})")
                    # v1 은 부모 총계만 반영. 하위 행 생성/갱신은 v2에서.
                    changed = {}                                  # 헤더 → 새 값(숫자)
                    for header, val in total['values'].items():
                        c = cur_num(row, header)
                        if c is None or abs(c - val) >= 0.05:
                            changed[header] = val
                    if total['acc'] is not None:
                        c = cur_num(row, '누적')
                        if c is None or abs(c - total['acc']) >= 0.05:
                            changed['누적'] = total['acc']
                    if cfg['dry_run']:
                        if changed:
                            log(f"    → 변경 {changed}")
                        continue
                    # ② 주간 진행실적 장부 — 메인표 변경 여부와 무관하게 항상 맞춘다
                    #    (이미 같은 값이면 _write_week 이 스스로 건너뛰므로 낭비 없음)
                    led = 0
                    for header, val in total['values'].items():
                        if sync_ledger(db, cfg, row_id, row, header, val):
                            led += 1
                    if total['acc'] is not None and sync_int_commissioning(db, cfg, row_id, row, total['acc']):
                        led += 1
                    if led:
                        log(f"    → 주간 장부 {led}건 기록")
                    if not changed:
                        continue
                    log(f"    → 변경 {changed}")
                    # ① 메인표 — PMS와 동일하게 문자열로 저장
                    patch = {h: js_num_str(v) for h, v in changed.items()}
                    # 기본 '미적용' 항목은 값이 들어가면 켜준다 (PMS _naOn 과 동일)
                    na_on = list(row.get('_naOn') or [])
                    for h in changed:
                        key = re.sub(r'\s+', '', str(h)).upper()
                        if key in NA_ON_TARGETS and NA_ON_TARGETS[key] not in na_on:
                            na_on.append(NA_ON_TARGETS[key])
                    if na_on != list(row.get('_naOn') or []):
                        patch['_naOn'] = na_on
                    patch['_updatedAt'] = datetime.datetime.now().isoformat()
                    patch['_updatedBy'] = 'NAS-Graph-Reader'
                    rows_collection(db, cfg).document(row_id).set(patch, merge=True)
                    wrote += len(changed)
                    continue

                target = rule.get('target')
                val, n = compute_cells_rule(cfg, picked['id'], rule)
                c = cur_num(row, target)
                same = (c is not None and abs(c - val) < 0.05)
                mark = '=' if same else '→'
                log(f"  [{name}] {target} {c} {mark} {val}   (셀 {n}칸 · 파일 {picked['name']})")
                if cfg['dry_run']:
                    continue
                # ② 주간 진행실적 장부 — 메인표가 이미 같아도 장부가 어긋나 있으면 맞춘다
                if sync_ledger(db, cfg, row_id, row, target, val):
                    log(f"    → 주간 장부 기록 ({prog_item_key(target)} {week_key()[0]} = {val})")
                if same:
                    continue
                # ① 메인표
                rows_collection(db, cfg).document(row_id).set({
                    target: js_num_str(val),
                    '_updatedAt': datetime.datetime.now().isoformat(),
                    '_updatedBy': 'NAS-Graph-Reader',
                }, merge=True)
                wrote += 1
            except Exception as e:
                log(f"  [{name}] {rule.get('target', rule.get('type'))} 오류: {e}")

    if cfg['dry_run']:
        log(f'※ 시험 모드(dry_run) — Firestore에 아무것도 쓰지 않았습니다')
    else:
        log(f'반영 완료 — {wrote}칸 갱신')


# ── 메인 루프 ────────────────────────────────────────────────────────────────
def main():
    cfg = load_config()
    log('=' * 70)
    log(f"PMS 클라우드 자동 반영기 시작 · {cfg['interval_min']}분 주기"
        + ('  [시험 모드: 쓰기 안 함]' if cfg['dry_run'] else ''))
    log(f"  테넌트 {cfg['tenant']} · 드라이브 {cfg['drive_user']} · 폴더 {cfg['folder']}")
    log(f"  팀 {cfg['team']} · appId {cfg['app_id']}")
    log('=' * 70)
    db = firestore_client(cfg)
    while True:
        try:
            run_once(cfg, db)
        except Exception as e:
            log(f'★ 이번 회차 실패: {e}')
        time.sleep(max(60, int(cfg['interval_min']) * 60))


if __name__ == '__main__':
    main()
