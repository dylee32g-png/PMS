# -*- coding: utf-8 -*-
"""subCreate 오프라인 시뮬 — 실제 백업 JSON(2026-07-30)의 011행·하위 8행으로 검증.
   Firestore 는 가짜(FakeDB)로 바꿔 쓰기 내용을 전부 수집해 검사한다."""
import json, re, sys, os, copy, types

# 클라우드 시뮬 환경에는 requests·firebase_admin 이 없다 → 가짜 모듈로 대체 (호출 안 함)
sys.modules['requests'] = types.ModuleType('requests')
_fa = types.ModuleType('firebase_admin')
_fa._apps = []
_fa.credentials = types.SimpleNamespace(Certificate=lambda p: None)
_fa.firestore = types.SimpleNamespace(client=lambda: None)
sys.modules['firebase_admin'] = _fa

sys.path.insert(0, '.')
import main as M


# ── 가짜 Firestore ───────────────────────────────────────────────────────────
class FakeSnap:
    def __init__(self, data): self._d = data
    @property
    def exists(self): return self._d is not None
    def to_dict(self): return copy.deepcopy(self._d) if self._d else None

class FakeDoc:
    def __init__(self, store, path): self.store, self.path = store, path
    def collection(self, name): return FakeCol(self.store, self.path + '/' + name)
    def get(self): return FakeSnap(self.store.get(self.path))
    def set(self, data, merge=False):
        if merge and self.path in self.store:
            cur = self.store[self.path]
            for k, v in data.items():
                if isinstance(v, dict) and isinstance(cur.get(k), dict):
                    cur[k] = {**cur[k], **v}
                else:
                    cur[k] = v
        else:
            self.store[self.path] = copy.deepcopy(data)
        self.store.setdefault('_writes', []).append(self.path)

class FakeCol:
    def __init__(self, store, path): self.store, self.path = store, path
    def document(self, name): return FakeDoc(self.store, self.path + '/' + name)

class FakeDB:
    def __init__(self): self.store = {}
    def collection(self, name): return FakeCol(self.store, name)


CFG = {'app_id': 'tech-team-pms-app', 'team': '기술2팀', 'dry_run': False, 'sub_create': True}
ROWS_PREFIX = "artifacts/tech-team-pms-app/public/data/projectListRows_기술2팀/"
LEDG_PREFIX = "artifacts/tech-team-pms-app/public/data/progressRecords_기술2팀/"


BACKUP_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'PMS백업_기술2팀_20260730_1133.json'),
    '/mnt/user-data/uploads/pms-app/PMS백업_기술2팀_20260730_1133.json',
)


def load_backup():
    path = next((p for p in BACKUP_CANDIDATES if os.path.exists(p)), None)
    if not path:
        raise SystemExit('백업 JSON을 못 찾음 — pms-app 폴더의 PMS백업_기술2팀_20260730_1133.json 필요')
    with open(path, encoding='utf-8') as f:
        b = json.load(f)
    # 백업 구조 탐색 — rows 목록 찾기
    if isinstance(b, dict):
        for key in ('rows', 'projectListRows', 'data'):
            if key in b and isinstance(b[key], list):
                return b[key]
        # dict 안에서 가장 그럴듯한 리스트
        for v in b.values():
            if isinstance(v, list) and v and isinstance(v[0], dict) and '_id' in v[0]:
                return v
    if isinstance(b, list):
        return b
    raise SystemExit('백업 JSON 구조를 못 읽음: ' + str(type(b)) + ' keys=' + str(list(b.keys())[:10] if isinstance(b, dict) else ''))


rows_list = load_backup()
# 백업 파일은 문서 id를 _docId 로 갖고 있다 (라이브 Firestore 의 문서 id 에 해당)
all_rows = {(r.get('_docId') or r.get('_id')): r for r in rows_list
            if isinstance(r, dict) and (r.get('_docId') or r.get('_id'))}
from collections import Counter
c = Counter(re.sub(r'_sub\d+$', '', rid) for rid in all_rows if '_sub' in str(rid))
parent_id = c.most_common(1)[0][0]   # 하위 행이 가장 많은 부모 = 011행(P10)
parent = all_rows[parent_id]
subs = {rid: r for rid, r in all_rows.items() if str(rid).startswith(parent_id + '_sub')}
name_col = M.project_name_col(parent)
print(f"부모: {parent_id} · 하위 {len(subs)}개 · 이름열 '{name_col}'")
for rid in sorted(subs):
    print('   ', rid, repr(subs[rid].get(name_col)))

# 엑셀 공종표를 흉내낸 sub_rows — 하위 행 이름에서 역으로 구성 (compute_subtable 출력과 같은 모양)
def fake_sub_rows(names, base=70):
    out = []
    for i, nm in enumerate(names):
        out.append({'name': nm, 'row': 10 + i,
                    'values': {'도면입수': 90.0, 'I/OMAP': 80.5, '화면작성': 70.0,
                               '기준정보': 60.0, '자체시운전': 50.0, '통합시운전': 40.0},
                    'pt': 6.0, 'acc': float(base + i)})
    return out

excel_names = [re.sub(r'^[-\s]+', '', str(subs[rid].get(name_col) or '')).strip() for rid in sorted(subs)]

ok = fail = 0
def check(name, cond, detail=''):
    global ok, fail
    if cond: ok += 1; print(f"  ✓ {name}")
    else:    fail += 1; print(f"  ✗ {name} — {detail}")

# ── 시험 1: 짝이 다 있으면 아무것도 안 만든다 ────────────────────────────────
print('\n[시험 1] 짝 8/8 → 생성 0건 (멱등)')
db = FakeDB()
ar = copy.deepcopy(all_rows)
plan = M.plan_subtable_rows(parent_id, parent, fake_sub_rows(excel_names), ar)
made = M.create_sub_rows(db, CFG, parent_id, parent, plan, ar)
check('생성 0건', made == [], str(made))
check('Firestore 쓰기 0회', not db.store.get('_writes'), str(db.store.get('_writes')))

# ── 시험 2: 새 공종 1개 → 행 1개 생성, PMS 규칙 그대로 ──────────────────────
print('\n[시험 2] 새 공종 1개(짝 없음) → 자동 생성')
db = FakeDB()
ar = copy.deepcopy(all_rows)
new_names = excel_names + ['시험용신규공종']
plan = M.plan_subtable_rows(parent_id, parent, fake_sub_rows(new_names), ar)
made = M.create_sub_rows(db, CFG, parent_id, parent, plan, ar)
check('생성 1건', len(made) == 1, str(made))

max_seq = max(int(re.search(r'_sub(\d+)$', rid).group(1)) for rid in subs)
new_id = f"{parent_id}_sub{str(max_seq + 1).zfill(2)}"
nr = db.store.get(ROWS_PREFIX + new_id)
check(f'_id 번호 = 기존 최대+1 ({new_id})', nr is not None, '문서 없음: ' + str([p for p in db.store if ROWS_PREFIX in p]))
if nr:
    check("_pid 형식 P-32자리", bool(re.match(r'^P-[0-9a-f]{32}$', nr.get('_pid', ''))), nr.get('_pid'))
    check("실행번호 's'", nr.get('실행번호') == 's', repr(nr.get('실행번호')))
    stc = M.status_col_of(parent)
    check(f"진행현황열('{stc}') = 'sub'", stc and nr.get(stc) == 'sub', repr(nr.get(stc) if stc else None))
    check(f"이름 '- 시험용신규공종'", nr.get(name_col) == '- 시험용신규공종', repr(nr.get(name_col)))
    check('_subParent = 부모 _pid', nr.get('_subParent') == parent.get('_pid'), repr(nr.get('_subParent')))
    check('_year = 부모 _year', nr.get('_year') == parent.get('_year'), f"{nr.get('_year')!r} vs {parent.get('_year')!r}")
    copied = [h for h in parent if not h.startswith('_') and M.copy_col(h)]
    bad = [h for h in copied if nr.get(h) != (parent.get(h) or '')]
    check(f'부모 복사 칸({len(copied)}개: {copied}) 일치', not bad, str(bad))
    # 값 8칸 — 문자열로
    h = lambda n: M.hdr_of(parent, n)
    want_chk = {h('도면입수'): '90', h('I/OMAP'): '80.5', h('화면작성'): '70',
                h('기준정보'): '60', h('자체시운전'): '50', h('통합시운전'): '40',
                h('포인트'): '6', h('누적'): str(70 + len(excel_names))}
    bad = {k: (nr.get(k), v) for k, v in want_chk.items() if nr.get(k) != v}
    check('값 8칸 문자열 저장', not bad, str(bad))
    check('_naOn 5항목', nr.get('_naOn') == M.SUB_NA_ON, str(nr.get('_naOn')))
    check("_updatedBy = 'NAS-Graph-Reader'", nr.get('_updatedBy') == 'NAS-Graph-Reader', repr(nr.get('_updatedBy')))
    empty_ok = all(nr.get(k2) == '' for k2 in parent if not k2.startswith('_')
                   and not M.copy_col(k2) and k2 not in want_chk
                   and k2 not in (name_col, '실행번호', stc))
    check('나머지 열은 빈칸', empty_ok)
    # 자기 주간 장부 — 공정률 4 + 누적만
    led = db.store.get(LEDG_PREFIX + nr['_pid'])
    check('자기 장부 생성(docKey=_pid)', led is not None)
    if led:
        wk = led.get('weekly', {})
        check('장부 항목 = 공정률4+누적(5개)', sorted(wk.keys()) == sorted(['drawing', 'iomap', 'screen', 'baseinfo', 'intCommissioning']), str(sorted(wk.keys())))
        check("장부 execNo 's'", led.get('execNo') == 's', repr(led.get('execNo')))
        wkey = M.week_key()[0]
        check(f'누적 {70 + len(excel_names)} 이번주({wkey}) 기록', wk.get('intCommissioning', {}).get(wkey) == float(70 + len(excel_names)), str(wk.get('intCommissioning')))
    check('all_rows 에 등록(다음 단계에서 보임)', new_id in ar)

# ── 시험 3: 부모에 하위가 하나도 없는 새 프로젝트 → 전부 생성 + 번호 연속 ────
print('\n[시험 3] 하위 0개 프로젝트에 공종 3개 → 3건 생성 · 번호 01~03')
db = FakeDB()
p2_id = '999'
p2 = {k: v for k, v in parent.items()}
p2['_pid'] = 'P-' + 'f' * 32
ar2 = {p2_id: p2}
plan = M.plan_subtable_rows(p2_id, p2, fake_sub_rows(['갑공종', '을공종', '병공종']), ar2)
made = M.create_sub_rows(db, CFG, p2_id, p2, plan, ar2)
check('생성 3건', len(made) == 3, str(made))
ids = sorted(p.replace(ROWS_PREFIX, '') for p in db.store if p.startswith(ROWS_PREFIX))
check('번호 _sub01~03 연속', ids == [f'{p2_id}_sub01', f'{p2_id}_sub02', f'{p2_id}_sub03'], str(ids))
pids = {db.store[ROWS_PREFIX + i]['_pid'] for i in ids}
check('_pid 3개 전부 다름', len(pids) == 3)
check('_subParent 전부 = 부모 _pid', all(db.store[ROWS_PREFIX + i]['_subParent'] == p2['_pid'] for i in ids))

# ── 시험 4: sub_create=false → 만들지 않음 ──────────────────────────────────
print('\n[시험 4] sub_create=false → 생성 0건')
db = FakeDB()
cfg_off = dict(CFG); cfg_off['sub_create'] = False
ar3 = {p2_id: p2}
plan = M.plan_subtable_rows(p2_id, p2, fake_sub_rows(['갑공종']), ar3)
made = M.create_sub_rows(db, cfg_off, p2_id, p2, plan, ar3)
check('생성 0건 · 쓰기 0회', made == [] and not db.store.get('_writes'))

# ── 시험 5: 빈 번호(구멍) 있어도 최대+1 (PMS와 동일) ─────────────────────────
print('\n[시험 5] 기존 _sub03 하나만 → 다음은 _sub04')
db = FakeDB()
ar4 = {p2_id: p2, f'{p2_id}_sub03': {name_col: '- 갑공종', '_pid': 'P-' + 'a' * 32}}
plan = M.plan_subtable_rows(p2_id, p2, fake_sub_rows(['갑공종', '새공종']), ar4)
made = M.create_sub_rows(db, CFG, p2_id, p2, plan, ar4)
ids = [p.replace(ROWS_PREFIX, '') for p in db.store if p.startswith(ROWS_PREFIX)]
check('생성 1건 · _sub04', made and ids == [f'{p2_id}_sub04'], f'{made} {ids}')

print(f'\n결과: 통과 {ok} · 실패 {fail}')
sys.exit(1 if fail else 0)
