# List 화면 자동 검사 (tests/list)

프로젝트 List(`src/components/ProjectListScreen.jsx`)를 고칠 때 돌리는 검사 모음입니다.
전부 **원문 코드를 그대로 꺼내 실행**하므로, 코드가 바뀌면 검사도 같이 반응합니다.
(2026-09-21까지는 Claude 세션 임시 폴더에 있어 세션이 바뀌면 사라졌음 → 저장소로 옮김)

## 돌리는 법 (VS Code 터미널, 프로젝트 루트에서)

```powershell
node tests/list/hdr_oneline_test.js      # 헤더 한 줄 (크롬 헤드리스 사용, ~30초)
node tests/list/sort_keep_test.js        # 정렬 기억
node tests/list/extsync_stale_test.js    # NAS 설정 저장 — 낡은 사본이 규칙을 되돌리지 않는가
node tests/list/chip_label_test.js       # 관리 칸 파일 칩 L1/AX 이름·순서 + Back_up 폴더 제외
node tests/list/chip_cascade_test.js     # 진행현황·관리자·담당자 칩 숫자 연동
node tests/list/default_layout_test.js   # 기술2·3팀 기본 화면 — 열 폭(모니터 무관)·공사 진행 머리글 안 잘림·담당자→관리자 순서 (크롬 헤드리스, ~30초)
node tests/list/tech1_progress_test.js   # 기술1팀 진행 수치 누계 — 적용 규칙 하나·전수 대조(메인표 = 팝업 = 그래프)·팝업 계산 범위·종료 주·모바일 제외 + 자동 칸 전수 점검(달 바뀜 새 달 맞춤·상세 보기 잠금·복사·엑셀 반영 보호·저장 경로 장부 기록·초기화·마감 연도) (크롬 없음, 몇 초)
node tests/list/monthly_close_test.js    # 자동 월간 마감 — 매월 1일 지난달 마감(전 팀)·덮어쓰기 없음·두 PC 동시 1번·기술1팀 9월 값·1월=작년 12월 (크롬 없음, 몇 초)
node tests/list/tech1_col_order_test.js  # 기술1팀 기본 화면 — 칸 위치(의뢰·견적코드·고객사·단계구분·부문·계약 → 비고 앞)·기본 폭(캡쳐 폭 고정)·2021 머리글 어긋남·틀고정 기억 (크롬 헤드리스, ~25초)
```

마지막 줄 `결과: N/N 통과 ✓` 이면 통과입니다. `NG` 줄이 있으면 그 항목이 깨진 것입니다.

## 언제 무엇을 돌리나

| 고친 곳 | 반드시 돌릴 검사 |
|---|---|
| 헤더(제목줄·단추·미니 요약) | `hdr_oneline_test.js` — 5팀 × 초안 4상태 × 폭 3종 = 60가지 전부 한 줄인지 실제 크롬 좌표로 잼 |
| 정렬 관련 | `sort_keep_test.js` |
| NAS 자동 연결 저장(`_extSync`) | `extsync_stale_test.js` |
| 관리 칸 칩·NAS 파일 목록 | `chip_label_test.js` |
| 칩 줄·기준월 건수 | `chip_cascade_test.js` |
| 열 폭·열 순서(팀 카드 `기본맞춤`·`열순서`, `computeDefaultFit`·`applyColOrder`), 표 머리글 | `default_layout_test.js` — 원문 머리글을 크롬에 그려 글자 잘림·16열 폭·1366/1920/2560 모니터 동일 여부를 잼 |
| 기술1팀 진행 수치(카드 `수식.방식: '누계'`, `tech1Progress.js`, List `fmDeriveCum`·`t1EmptyOffOf`·`naToProgressItems`·`syncProgressCellToLedger` 종료 주, App.js 그래프 공정률, 상세 보기 스위치 `progSwitch`·DetailModal `psRule`, ProgressModal 계산 범위 `ALL_WEEKS`·진척률·[적용하기] 값, MobileInputScreen 대상 팀) · **자동 칸이 저장·바뀌는 모든 길**(List `t1ReconcileFixes`·`runT1Reconcile` 새 달 맞춤, `fmMergeFix` 엑셀 반영·확정 저장, `t1BlankProgress` 행 복사, `saveDraft`·`saveDetailRow`·`saveAddingRow` 장부 기록, `handleResetProgress`, `handleMonthlyClose` 연도, `fmAutoTip`, DetailModal `autoLockedCols`) | `tech1_progress_test.js` — 9/29 장부 숫자(숫자만)로 원문 코드를 돌려 2026 17건 + 경우 5건을 전수 대조: 메인표 값 칸 = 진행실적 팝업 줄 = 상세 보기 '적용', 메인표 공정률 = 팝업 진척률(ProgressModal 원문) = 그래프(App 원문). 팝업 ±6개월 범위 시한폭탄 재현·수리 확인. 7~12장 = 자동 칸 전수 점검(10월이 되면 008 금월 1,200 → 빈칸·전월 → 1,200 등 · 엑셀 빈칸이 HMI를 지우지 않음 · 복사한 새 행 = 진행 값 비움) · 13장 = 완료 프로젝트 종료 주 자동 이동(`t1AfterSave`·팝업 `doneWeekKey`)·통합 시운전 자동 칸 · 14장 = 팝업 다음 달 이후 칸 잠금(ProgressModal `isFutureWk`·`lockAfterYm`) |
| 월간 마감(수동 [월간 마감]·자동 마감 — List `buildMonthSnapshot`·`writeMonthSnapshot`·`runAutoMonthlyClose`·`mcTeamsToCheck`, 카드 `월간마감`) | `monthly_close_test.js` — 원문을 가짜 서버(메모리)에 돌림: 10/1 00:01 공용 PC(기술2팀 화면) → 4팀 9월 마감본 · 기술1팀은 그 팀 화면에서 9월 장부 값(008 금월 1,200) · 수동 마감본 안 덮음 · 두 PC 동시 = 팀당 1번 · 2027/1/2 = 2026-12 · 실패 팀 10분 뒤 |
| 열 순서 규칙 중 **묶음째·칸만 빼서**(`{ 묶음: … }`·`{ 열: [ … ] }`), 칸 순서↔머리글 묶음 순서(`alignColsToGroups`), 틀고정 기억 복원, 상세 팝업 섹션, 기술1팀 `기본맞춤.고정폭` | `tech1_col_order_test.js` — 캡쳐 폭 25칸이 1366/1920/2560·배율 80/90/125%에서 그대로·안 잘림인지 잼 · 기술1팀 실제 열 이름(2026·2025·2021·2017·2014)으로 순서·묶음을 보고, 크롬에서 머리글 칸이 자기 본문 칸 바로 위인지 잼. 종전 형식(열 1칸) 규칙이 오전판과 같은지 무작위 2,000가지 비교 |

## 주의

- `hdr_oneline_test.js`·`default_layout_test.js`는 `build/static/css/*.css`(마지막 `npm run build` 결과)와 같은 폴더의 `tailwind.cdn.js`(앱과 같은 Tailwind 런타임)를 씁니다. 빌드가 한 번도 없으면 먼저 `npm run build`.
- 크롬 경로는 `C:/Program Files/Google/Chrome/Application/chrome.exe` 기준입니다.
- 검사 결과 페이지는 임시 폴더(`%TEMP%/pms_hdr_measure.html`·`pms_layout_measure.html`·`pms_t1order_measure.html`)에 씁니다. 저장소에는 아무것도 남기지 않습니다.
- `default_layout_test.js`는 앱 글꼴(Pretendard)을 인터넷(jsdelivr)에서 받아 글자 폭을 잽니다. 인터넷이 안 되면 '앱 글꼴로 그려짐' 항목이 NG가 됩니다(그때 폭 숫자는 믿지 말 것).
- **기본 폭 숫자를 바꿀 때** (tech2.js `기본맞춤.고정폭`): 먼저 조사 모드로 필요한 폭을 봅니다.
  `LAYOUT_PROBE=1` = 열마다 머리글 글자에 필요한 폭 · `LAYOUT_DATA=백업JSON경로[;경로2]` = 실제 2026 값의 칸 폭 분포와 말줄임 건수.
  PowerShell: `$env:LAYOUT_PROBE=1; $env:LAYOUT_DATA='Z:\005 PMS Backup\1.Auto\PMS전체백업_기술2팀_YYYYMMDD_2100.json'; node tests/list/default_layout_test.js`
  고정폭 합계 = `기준폭`(1920 모니터에서 오른쪽 '관리' 칸 앞까지 = 1778)을 맞춰야 1번 항목이 통과합니다.
  기술1팀(tech1.js)은 팀장님 캡쳐 폭 그대로(합계 1727 = 기준폭) — 바꾸면 `tech1_col_order_test.js`의 `SHOT`도 같이 고칩니다.
- 검사가 `babel-preset-react-app`을 쓰므로 환경값이 없으면 멈추던 문제(2026-09-29 발견) → 크롬 검사 맨 위에서 `BABEL_ENV=test`를 기본 지정. 따로 설정할 것 없음.
- `extsync_stale_test.js`는 옛 코드로 사고를 재현합니다. 백업 파일(`.bak-2026-09-21-extsync`)이 있으면 그것을, 없으면 검사 안에 박아 둔 원문 4줄을 씁니다.
