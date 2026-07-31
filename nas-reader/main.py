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


# 잠깐 실패했다가 곧 되는 응답들 — 다시 물어보면 대개 성공한다 (2026-07-31)
#   504 = 오피스365가 워크북을 메모리에 올리다 시간 초과 ("taking too long")
#         한 번 올라가면 다음 호출은 몇 초면 끝나므로, 쉬었다 다시 부르는 게 정답이다.
#   429 = 너무 자주 불렀음 (Retry-After 를 지켜준다)
#   500·502·503 = 마이크로소프트 쪽 일시 장애
G_RETRY_CODES = (429, 500, 502, 503, 504)
G_RETRY_MAX = 3            # 처음 1번 + 재시도 3번
G_RETRY_WAIT = (3, 8, 15)  # 초


def g_get(cfg, path):
    last = ''
    for i in range(G_RETRY_MAX + 1):
        try:
            r = requests.get(GRAPH + path, headers={'Authorization': 'Bearer ' + ms_token(cfg)}, timeout=60)
        except requests.RequestException as e:          # 연결 끊김·타임아웃도 다시 시도
            last = f'요청 실패 {type(e).__name__}: {e}'
            code = 0
        else:
            if r.ok:
                if i:
                    log(f'    (재시도 {i}회 만에 성공)')
                return r.json()
            code = r.status_code
            try:   detail = r.json().get('error', {}).get('message', r.text[:200])
            except Exception: detail = r.text[:200]
            last = f'Graph {code} — {path}\n    {detail}'
        if code not in G_RETRY_CODES and code != 0:
            break                                        # 권한·주소 오류 등은 다시 해도 소용없음
        if i < G_RETRY_MAX:
            wait = G_RETRY_WAIT[min(i, len(G_RETRY_WAIT) - 1)]
            try:                                         # 429 면 마이크로소프트가 알려준 시간을 지킨다
                wait = max(wait, int(r.headers.get('Retry-After', 0)))
            except Exception:
                pass
            log(f'    (Graph {code or "연결오류"} — {wait}초 쉬고 다시 시도 {i + 1}/{G_RETRY_MAX})')
            time.sleep(wait)
    raise RuntimeError(last)


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
# 훑을 때 건너뛸 폴더 이름 (NAS 시절과 동일) · 최대 깊이
SKIP_DIRS = ('BACKUP', '백업', 'ARCHIVE', '보관')
MAX_DEPTH = 5


def list_folder(cfg):
    """진척자료 폴더를 하위 폴더까지 훑는다 (2026-07-31 · 프로젝트별 폴더 구조 도입).
       각 파일에 rel(기준폴더 이후 상대경로)·dir(속한 폴더)을 붙여 준다.
       반환 (파일목록, 폴더목록).  Backup·백업 폴더는 건너뛴다."""
    base = '/'.join(requests.utils.quote(x, safe='') for x in cfg['folder'].split('/') if x)
    root = g_get(cfg, f"/users/{requests.utils.quote(cfg['drive_user'])}/drive/root:/{base}:/children")
    files, dirs = [], []

    def walk(items, cur, depth):
        for it in items:
            if 'file' in it:
                it['dir'] = cur
                it['rel'] = (cur + '/' + it['name']) if cur else it['name']
                files.append(it)
            elif 'folder' in it:
                if re.sub(r'\s', '', it['name']).upper() in SKIP_DIRS:
                    continue
                sub = (cur + '/' + it['name']) if cur else it['name']
                dirs.append(sub)
                if depth < MAX_DEPTH:
                    j = g_get(cfg, f"/users/{requests.utils.quote(cfg['drive_user'])}/drive/items/{it['id']}/children")
                    walk(j.get('value', []), sub, depth + 1)

    walk(root.get('value', []), '', 1)
    return files, sorted(dirs)


def in_dir(f, base_dir):
    """파일이 이 프로젝트가 볼 수 있는 자리에 있는가 (2026-07-31 팀장님 결정).
       · base_dir 가 비면  → 어디든 통과 (예전 동작)
       · base_dir 가 있으면 → 그 폴더(와 하위)  +  맨 위(루트)
       맨 위를 항상 통과시키는 이유: 한 파일을 여러 프로젝트가 같이 쓰기 때문이다.
       (예: '01 진행현황_P9_10 AP4 …' 한 파일에 P9·P10 이 같이 들어 있음)
       → 운영 규칙: 프로젝트 전용 파일은 그 폴더에, 여러 프로젝트가 쓰는 파일은 맨 위에."""
    bd = str(base_dir or '').strip('/')
    if not bd:
        return True
    d = str(f.get('dir') or '')
    return d == '' or d == bd or d.startswith(bd + '/')


def pick_latest(files, pattern, base_dir=''):
    """PMS pickLatestExtFile 과 동일: 이름 포함 → 파일명 날짜 → 수정시각.
       + base_dir 가 있으면 그 프로젝트 폴더 안의 파일만 후보로 본다 (2026-07-31)."""
    pat = re.sub(r'\s', '', str(pattern)).upper()
    cand = [f for f in files
            if in_dir(f, base_dir)
            and not f['name'].startswith('~$')
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


def status_ref(db, cfg):
    """자동 반영기 상태 문서 (2026-07-31)
       PMS 규칙 화면이 '프로그램이 마지막으로 확인한 시각'을 여기서 읽는다.
       경로: artifacts/{app_id}/public/data/pmsReaderStatus/{team}"""
    return (db.collection('artifacts').document(cfg['app_id'])
              .collection('public').document('data')
              .collection('pmsReaderStatus').document(cfg['team']))


def request_ref(db, cfg):
    """PMS [지금 확인] 요청 문서 (2026-07-31) — PMS가 쓰고 리더가 읽기만 한다.
       경로: artifacts/{app_id}/public/data/pmsReaderRequest/{team}"""
    return (db.collection('artifacts').document(cfg['app_id'])
              .collection('public').document('data')
              .collection('pmsReaderRequest').document(cfg['team']))


def read_request(db, cfg):
    """요청 문서 읽기. 없거나 오류면 None (요청 확인 실패로 본 작업이 멈추면 안 된다)"""
    try:
        snap = request_ref(db, cfg).get()
        return (snap.to_dict() or None) if snap.exists else None
    except Exception as e:
        log(f'  (요청 확인 실패 — 무시하고 계속: {e})')
        return None


# 이번 회차가 왜 돌았는지 — 상태 문서에 같이 남겨 PMS가 '요청 처리됨'을 알 수 있게 한다
RUN_TRIGGER = {'why': '정기', 'reqAt': None}


def write_status(db, cfg, **fields):
    """매 회차 끝에 상태를 한 건 기록. 여기서 실패해도 본 작업에는 영향 없음."""
    try:
        doc = {
            'at':          datetime.datetime.now().isoformat(timespec='seconds'),
            'source':      'office365',
            'by':          'NAS-Graph-Reader',
            'folder':      cfg.get('folder', ''),
            'intervalMin': int(cfg.get('interval_min', 15)),
            'dryRun':      bool(cfg.get('dry_run')),
            'trigger':      RUN_TRIGGER.get('why') or '정기',      # '정기' 또는 '요청'
            'lastRequestAt': RUN_TRIGGER.get('reqAt'),             # 처리한 요청의 시각 (PMS가 대조)
        }
        doc.update(fields)
        status_ref(db, cfg).set(doc)
    except Exception as e:
        log(f'  (상태 기록 실패 — 본 작업에는 영향 없음: {e})')


def cur_num(row, header):
    """메인표의 현재 값 (문자열 '89.6' 또는 '89.6%' 형태) → 숫자"""
    return num_or_none(row.get(header))


# ── ⑤ 하위(공종) 8행 — 2026-07-31, 인수인계 문서 2순위 ────────────────────────
#   PMS ProjectListScreen.jsx 의 subSet / subLedger 규칙을 그대로 옮긴 것.
#   이 단계에서는 '무엇을 쓸지' 계산과 로그만 한다 (Firestore 쓰기 없음).
SUB_NA_ON = ['도면입수', 'I/O Map', '화면작성', '기준정보', '자체시운전']
NAME_COL_CANDIDATES = ('Project', '프로젝트명', '프로젝트', '공사명', '건명', '명칭')


def norm_key(v):
    """공백 제거 + 대문자 — 열 이름 비교용"""
    return re.sub(r'\s+', '', str(v if v is not None else '')).upper()


def hdr_of(row, name):
    """행에서 열 이름 찾기 — 공백·대소문자 무시 (PMS hOfA 와 동일). 못 찾으면 준 이름 그대로."""
    want = norm_key(name)
    for k in row.keys():
        if norm_key(k) == want:
            return k
    return name


def sub_name_key(v):
    """하위 행 이름 비교용 — 앞의 '- ' 떼고 공백 제거·대문자 (PMS nrm 과 동일)"""
    return re.sub(r'\s+', '', re.sub(r'^[-\s]+', '', str(v if v is not None else ''))).upper()


def project_name_col(row):
    for cand in NAME_COL_CANDIDATES:
        for k in row.keys():
            if norm_key(k) == norm_key(cand):
                return k
    return None


def plan_subtable_rows(parent_id, parent_row, sub_rows, all_rows):
    """엑셀 공종 줄 ↔ PMS 하위 행 짝짓고 바꿀 칸만 골라낸다 (읽기만).
       반환: [{i, name, sub_id, changes:[{col,header,from,to}], want}] — i = 엑셀 줄 순서"""
    prefix = str(parent_id) + '_sub'
    subs = sorted([(rid, r) for rid, r in all_rows.items() if str(rid).startswith(prefix)])
    name_col = project_name_col(parent_row) or 'Project'
    by_name = {}
    for rid, r in subs:
        by_name.setdefault(sub_name_key(r.get(name_col)), (rid, r))

    plan = []
    for i, exr in enumerate(sub_rows):
        want = dict(exr['values'])
        want['포인트'] = exr['pt']
        if exr.get('acc') is not None:
            want['누적'] = exr['acc']
        hit = by_name.get(sub_name_key(exr['name']))
        if not hit:
            plan.append({'i': i, 'name': exr['name'], 'sub_id': None, 'row': None,
                         'want': want, 'changes': []})
            continue
        rid, r = hit
        changes = []
        for col, v in want.items():
            h = cur = None
            h = hdr_of(r, col)
            cur = num_or_none(r.get(h))
            try:    newv = float(v)
            except (TypeError, ValueError): continue
            if cur is None or abs(cur - newv) >= 0.05:      # PMS와 같은 기준
                raw = r.get(h)
                changes.append({'col': col, 'header': h, 'to': newv,
                                'from': ('—' if raw in (None, '') else str(raw))})
        plan.append({'i': i, 'name': exr['name'], 'sub_id': rid, 'row': r,
                     'want': want, 'changes': changes})
    return plan


def plan_sub_ledger(db, cfg, parent_id, parent_row, sub_rows):
    """부모 장부의 sub_i_intCommissioning(공종별 누적)이 엑셀과 다른지 확인 (읽기만)"""
    dk = doc_key_of(parent_id, parent_row)
    if not dk:
        return None
    try:
        snap = ledger_ref(db, cfg, dk).get()
        weekly = ((snap.to_dict() or {}).get('weekly') or {}) if snap.exists else {}
    except Exception:
        return None
    wkey = week_key()[0]
    ints, ndiff = [], 0
    for i, exr in enumerate(sub_rows):
        newv = float(exr.get('acc') or 0)
        cur = (weekly.get(f'sub_{i}_intCommissioning') or {}).get(wkey) or 0
        ints.append(newv)
        if float(cur) != newv:
            ndiff += 1
    return {'docKey': dk, 'ints': ints, 'ndiff': ndiff, 'weekKey': wkey}


def log_sub_plan(name, plan, led):
    """계획을 사람이 읽는 형태로 로그에 남긴다"""
    matched = sum(1 for p in plan if p['sub_id'])
    tochange = sum(1 for p in plan if p['sub_id'] and p['changes'])
    log(f"    · 하위 행 짝 {matched}/{len(plan)} · 갱신 대상 {tochange}건")
    for p in plan:
        if not p['sub_id']:
            log(f"        └ {p['name']}  ← 짝 없음 (PMS에 하위 행이 없음 · 생성은 아직 미구현)")
        elif not p['changes']:
            log(f"        └ {p['name']}  [{p['sub_id'].split('_')[-1]}]  변경 없음")
        else:
            txt = ' · '.join(f"{c['col']} {c['from']}→{c['to']}" for c in p['changes'][:4])
            more = f" 외 {len(p['changes']) - 4}칸" if len(p['changes']) > 4 else ''
            log(f"        └ {p['name']}  [{p['sub_id'].split('_')[-1]}]  {len(p['changes'])}칸: {txt}{more}")
    if led:
        log(f"    · 부모 팝업 하위별 통합(sub_i) — {led['ndiff']}/{len(led['ints'])}건 다름 "
            f"(주차 {led['weekKey']} · 장부 {led['docKey']})")


def write_week_multi(db, cfg, row_id, row, items):
    """한 행의 주간 장부에 여러 항목을 한 번에 기록 (읽기 1회·쓰기 1회).
       _write_week 와 같은 규칙: 현재 주차에 기록 · 같은 달 미래 주차 제거 · 같은 값이면 안 씀.
       하위 행은 항목이 5개(공정률 4 + 누적)라 한 문서를 5번 읽는 낭비를 피하려고 따로 둔다."""
    dk = doc_key_of(row_id, row)
    if not dk or not items:
        return 0
    wkey, cy, cm, cw = week_key()
    ref = ledger_ref(db, cfg, dk)
    snap = ref.get()
    data = snap.to_dict() if snap.exists else {
        'docKey': dk, 'execNo': str(row.get('실행번호') or row.get('execNo') or '')}
    weekly = dict(data.get('weekly') or {})
    n = 0
    for item_key, value in items.items():
        try:    num = max(0.0, float(value))
        except (TypeError, ValueError): continue
        if not math.isfinite(num):
            continue
        weeks = dict(weekly.get(item_key) or {})
        before = dict(weeks)
        for wk in list(weeks.keys()):                 # 같은 달의 미래 주차 제거
            pp = str(wk).split('-')
            try:
                if int(pp[0]) == cy and int(pp[1]) == cm and int(pp[2]) > cw:
                    del weeks[wk]
            except (ValueError, IndexError):
                pass
        weeks[wkey] = num
        if weeks != before:
            weekly[item_key] = weeks
            n += 1
    if not n:
        return 0
    data['weekly'] = weekly
    data['updatedAt'] = datetime.datetime.now().isoformat()
    ref.set(data)
    return n


def apply_sub_rows(db, cfg, plan):
    """하위 행 메인표 갱신 + 하위 행 주간 장부 (PMS subSet 과 동일)
       · 메인표 = 바뀐 칸만
       · 주간 장부 = 바뀐 칸이 없어도 항상 맞춘다(자기교정형) — 장부만 어긋난 경우를 고친다
       반환 (메인표 칸 수, 장부 건수)"""
    wrote = led = 0
    for p in plan:
        if not p['sub_id']:
            continue
        r = p['row']
        if p['changes']:
            patch = {c['header']: js_num_str(c['to']) for c in p['changes']}
            na_on = list(r.get('_naOn') or [])          # 기본 미적용 항목 켜기 (안 켜면 값이 있어도 화면에서 가려짐)
            for h in SUB_NA_ON:
                if h not in na_on:
                    na_on.append(h)
            patch['_naOn'] = na_on
            now_iso = datetime.datetime.now().isoformat(timespec='seconds')
            hist = list(r.get('_changeHistory') or [])  # 변경 이력 (PMS 와 같은 모양)
            hist.append({'datetime': now_iso,
                         'changes': [{'field': c['col'], 'from': str(c['from']),
                                      'to': js_num_str(c['to'])} for c in p['changes']]})
            patch['_changeHistory'] = hist
            patch['_updatedAt'] = now_iso
            patch['_updatedBy'] = 'NAS-Graph-Reader'
            rows_collection(db, cfg).document(p['sub_id']).set(patch, merge=True)
            wrote += len(p['changes'])
        items = {}                                     # 장부에 넣을 항목 고르기
        for col, v in p['want'].items():
            k = prog_item_key(col)                     # 공정률 4개(도면입수·I/O Map·화면작성·기준정보)
            if k:
                items[k] = v
            elif norm_key(col) == '누적':
                items['intCommissioning'] = v
            # 포인트·자체시운전·통합시운전 = 장부 항목이 아님 (PMS 와 동일하게 건너뜀)
        led += write_week_multi(db, cfg, p['sub_id'], r, items)
    return wrote, led


def write_sub_ledger(db, cfg, parent_id, parent_row, sub_rows):
    """부모 장부의 sub_i_intCommissioning (공종별 누적) — 부모 진행실적 팝업·그래프가 읽는 값.
       ★ i 는 엑셀 공종표의 줄 순서. 엑셀에서 공종 순서를 바꾸면 짝이 어긋난다."""
    dk = doc_key_of(parent_id, parent_row)
    if not dk:
        return 0
    ref = ledger_ref(db, cfg, dk)
    snap = ref.get()
    data = snap.to_dict() if snap.exists else {
        'docKey': dk, 'execNo': str(parent_row.get('실행번호') or parent_row.get('execNo') or '')}
    weekly = dict(data.get('weekly') or {})
    wkey = week_key()[0]
    n = 0
    for i, exr in enumerate(sub_rows):
        k = f'sub_{i}_intCommissioning'
        newv = float(exr.get('acc') or 0)
        weeks = dict(weekly.get(k) or {})
        if weeks.get(wkey) == newv:
            continue
        weeks[wkey] = newv
        weekly[k] = weeks
        n += 1
    if not n:
        return 0
    data['weekly'] = weekly
    data['updatedAt'] = datetime.datetime.now().isoformat()
    ref.set(data)
    return n


# ── 한 바퀴 ──────────────────────────────────────────────────────────────────
def run_once(cfg, db):
    files, dirs = list_folder(cfg)
    log(f"폴더 '{cfg['folder']}' — 하위폴더 {len(dirs)}개 · 파일 {len(files)}개")
    for f in files[:20]:
        log(f"    · {f.get('rel') or f['name']}  ({f.get('lastModifiedDateTime','')[:16]})")
    if len(files) > 20:
        log(f"    · … 외 {len(files) - 20}개")

    # PMS 화면에 보여줄 파일 요약 (최대 60개)
    #   프로젝트가 늘면 폴더 파일도 같이 는다(프로젝트당 2개꼴). 12개로 자르면
    #   어떤 프로젝트의 파일이 목록에서 빠져 화면에 안 보이게 된다 (읽기 자체는 정상). (2026-07-31)
    #   webUrl = 오피스365가 파일마다 주는 웹주소 (2026-07-31).
    #   PMS 규칙 화면의 [엑셀 열기] 버튼이 이 주소로 웹 엑셀을 연다 — 라이선스 있는 계정만 열림.
    file_info = [{'name': f['name'],
                  'rel': f.get('rel') or f['name'],      # 폴더 포함 상대경로 (2026-07-31)
                  'dir': f.get('dir') or '',             # 속한 프로젝트 폴더 ('' = 루트)
                  'modified': (f.get('lastModifiedDateTime') or '')[:16],
                  'webUrl': f.get('webUrl') or ''}
                 for f in files][:60]
    dir_info = dirs[:60]                                 # PMS 폴더 고르기 드롭다운용

    docs = list(rows_collection(db, cfg).stream())
    all_rows = {}                                     # 하위 행 찾기용 — 전체 행 (2026-07-31)
    targets = []
    for d in docs:
        data = d.to_dict() or {}
        all_rows[d.id] = data
        rules = ((data.get('_extSync') or {}).get('rules')) or []
        if rules:
            targets.append((d.id, data, rules))
    if not targets:
        log('자동 반영 규칙이 있는 행이 없습니다 — 할 일 없음')
        write_status(db, cfg, ok=True, targets=0, rules=0, wrote=0, ledger=0,
                     errors=[], files=file_info, dirs=dir_info)
        return
    log(f'규칙이 있는 프로젝트 {len(targets)}건')

    wrote = 0
    led_total = 0
    errors = []
    rule_count = sum(len(r) for _, _, r in targets)
    for row_id, row, rules in targets:
        name = row.get('Project') or row.get('프로젝트') or row_id
        # 이 프로젝트의 폴더 (2026-07-31) — 비어 있으면 예전처럼 폴더 전체에서 찾는다
        row_dir = str(((row.get('_extSync') or {}).get('folder')) or '').strip('/')
        if row_dir:
            log(f"  [{name}] 프로젝트 폴더 '{row_dir}'")
        for rule in rules:
            try:
                picked = pick_latest(files, rule.get('filePattern'), row_dir)
                if not picked:
                    where = f"폴더 '{row_dir}'" if row_dir else '폴더 전체'
                    log(f"  [{name}] '{rule.get('filePattern')}' 파일을 {where}에서 못 찾음")
                    continue

                if rule.get('type') == 'subTable':
                    sub_rows, total = compute_subtable(cfg, picked['id'], rule)
                    log(f"  [{name}] 하위 공종표 — 공종 {len(sub_rows)}개 · "
                        f"총계 {total['values']} · 누적 {total['acc']}  (파일 {picked['name']})")

                    # ── 하위 8행 반영 (2026-07-31 · 2순위) ──
                    #    ① 계획을 계산해 로그로 보여주고  ② dry_run 이 아니면 실제로 쓴다
                    try:
                        sub_plan = plan_subtable_rows(row_id, row, sub_rows, all_rows)
                        sub_led  = plan_sub_ledger(db, cfg, row_id, row, sub_rows)
                        log_sub_plan(name, sub_plan, sub_led)
                        if not cfg['dry_run']:
                            sw, sl = apply_sub_rows(db, cfg, sub_plan)
                            pl = write_sub_ledger(db, cfg, row_id, row, sub_rows)
                            if sw or sl or pl:
                                log(f"    · 하위 반영 완료 — 메인표 {sw}칸 · 하위 장부 {sl}건 · 부모 하위별 통합 {pl}건")
                            wrote += sw
                            led_total += sl + pl
                    except Exception as ep:
                        log(f"    · 하위 행 처리 오류: {ep}")
                        errors.append(f"{name} · 하위 행: {ep}"[:200])

                    # 부모 총계 반영 (하위 행 생성/갱신은 아직 계획만)
                    # ★ 열 이름은 hdr_of 로 찾는다 (2026-07-31) — 규칙에 '통합시운전'이라 적어도
                    #   실제 열이 '통합 시운전'(공백 있음)이면 그 열에 써야 한다.
                    #   안 그러면 없는 열이 새로 하나 생기고, 현재값을 못 읽어 매 회차 계속 쓴다.
                    changed = {}                                  # 실제 열 이름 → 새 값(숫자)
                    for header, val in total['values'].items():
                        h = hdr_of(row, header)
                        c = cur_num(row, h)
                        if c is None or abs(c - val) >= 0.05:
                            changed[h] = val
                    if total['acc'] is not None:
                        h = hdr_of(row, '누적')
                        c = cur_num(row, h)
                        if c is None or abs(c - total['acc']) >= 0.05:
                            changed[h] = total['acc']
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
                    led_total += led
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
                    now_iso = datetime.datetime.now().isoformat(timespec='seconds')
                    # 이 행의 '마지막 자동 반영' 기록 — PMS 규칙 화면이 그대로 읽어 보여준다 (2026-07-31)
                    #   merge=True 는 중첩 맵을 깊게 합치므로 _extSync.rules 는 안 건드린다
                    patch['_extSync'] = {'lastApplied': {
                        h: {'value': v, 'fileName': picked['name'], 'at': now_iso}
                        for h, v in changed.items()}}
                    patch['_updatedAt'] = now_iso
                    patch['_updatedBy'] = 'NAS-Graph-Reader'
                    rows_collection(db, cfg).document(row_id).set(patch, merge=True)
                    wrote += len(changed)
                    continue

                target = rule.get('target')
                target_h = hdr_of(row, target)          # 실제 열 이름 (공백·대소문자 무시로 찾음, 2026-07-31)
                val, n = compute_cells_rule(cfg, picked['id'], rule)
                c = cur_num(row, target_h)
                same = (c is not None and abs(c - val) < 0.05)
                mark = '=' if same else '→'
                log(f"  [{name}] {target} {c} {mark} {val}   (셀 {n}칸 · 파일 {picked['name']})")
                if cfg['dry_run']:
                    continue
                # ② 주간 진행실적 장부 — 메인표가 이미 같아도 장부가 어긋나 있으면 맞춘다
                if sync_ledger(db, cfg, row_id, row, target, val):
                    led_total += 1
                    log(f"    → 주간 장부 기록 ({prog_item_key(target)} {week_key()[0]} = {val})")
                if same:
                    continue
                # ① 메인표
                now_iso = datetime.datetime.now().isoformat(timespec='seconds')
                rows_collection(db, cfg).document(row_id).set({
                    target_h: js_num_str(val),
                    # 이 행의 '마지막 자동 반영' 기록 (2026-07-31) — 중첩 맵이라 _extSync.rules 는 그대로
                    '_extSync': {'lastApplied': {target: {'value': val, 'fileName': picked['name'], 'at': now_iso}}},
                    '_updatedAt': now_iso,
                    '_updatedBy': 'NAS-Graph-Reader',
                }, merge=True)
                wrote += 1
            except Exception as e:
                log(f"  [{name}] {rule.get('target', rule.get('type'))} 오류: {e}")
                errors.append(f"{name} · {rule.get('target', rule.get('type'))}: {e}"[:200])

    write_status(db, cfg, ok=(len(errors) == 0), targets=len(targets), rules=rule_count,
                 wrote=wrote, ledger=led_total, errors=errors[:5], files=file_info, dirs=dir_info)

    if cfg['dry_run']:
        log(f'※ 시험 모드(dry_run) — Firestore에 아무것도 쓰지 않았습니다')
    else:
        log(f'반영 완료 — {wrote}칸 갱신')


# ── 메인 루프 ────────────────────────────────────────────────────────────────
#   예전에는 15분을 통째로 잤다 → 그 사이 PMS가 [지금 확인]을 눌러도 들을 수 없었다.
#   이제 20초씩 짧게 자면서 매번 '요청 문서' 하나만 확인한다 (2026-07-31).
#     · 정기 회차 : interval_min 마다 (지금까지와 동일)
#     · 요청 회차 : PMS가 요청 문서를 새로 쓰면 즉시 (최대 20초 대기)
REQ_TICK_SEC = 20


def main():
    cfg = load_config()
    log('=' * 70)
    log(f"PMS 클라우드 자동 반영기 시작 · {cfg['interval_min']}분 주기"
        + f" · [지금 확인] 요청은 최대 {REQ_TICK_SEC}초 내 처리"
        + ('  [시험 모드: 쓰기 안 함]' if cfg['dry_run'] else ''))
    log(f"  테넌트 {cfg['tenant']} · 드라이브 {cfg['drive_user']} · 폴더 {cfg['folder']}")
    log(f"  팀 {cfg['team']} · appId {cfg['app_id']}")
    log('=' * 70)
    db = firestore_client(cfg)
    interval = max(60, int(cfg['interval_min']) * 60)
    last_run = 0.0                       # 마지막으로 한 바퀴 돈 시각
    # 시작 시점에 이미 있던 요청은 '처리한 것'으로 본다 — 재시작할 때마다 옛 요청으로 또 도는 걸 막는다
    r0 = read_request(db, cfg)
    last_req = r0.get('at') if r0 else None
    if last_req:
        log(f'  (기존 요청 {last_req} 은 처리된 것으로 간주)')

    while True:
        why, req_at = '', None
        if time.time() - last_run >= interval:
            why = '정기'
        else:
            r = read_request(db, cfg)
            if r and r.get('at') and r.get('at') != last_req:
                last_req = req_at = r.get('at')
                why = '요청'
                log(f"── [지금 확인] 요청 받음 ({r.get('by') or 'PMS'}) — 즉시 실행합니다")
        if why:
            last_run = time.time()
            RUN_TRIGGER['why'], RUN_TRIGGER['reqAt'] = why, req_at
            try:
                run_once(cfg, db)
            except Exception as e:
                log(f'★ 이번 회차 실패: {e}')
                # 화면에 '언제부터 멈췄는지'가 보이도록 실패도 남긴다 (2026-07-31)
                write_status(db, cfg, ok=False, errors=[str(e)[:200]],
                             targets=0, rules=0, wrote=0, ledger=0, files=[], dirs=[])
        time.sleep(REQ_TICK_SEC)


if __name__ == '__main__':
    main()
