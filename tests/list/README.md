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
node tests/list/row_insert_test.js       # 행 순서·중간 삽입·잘라내기(Ctrl+X) 옮기기·되돌리기(Ctrl+Z)·수행번호 직접 입력·빈칸 회색/X 키인 — 무작위 조작 1만6천 번 엑셀식 모형 대조 포함 (크롬 없음, 몇 초)
node tests/list/prog_item_sync_test.js   # 기술2·3팀 메인표 × = 진행실적 팝업에 없음 — 메인표·팝업·상세 보기 스위치·모바일 네 화면 대조 + 팝업 '전체 기간' 1월부터 + 모바일 [적용하기] 저장 + 사람이 친 진행 값의 장부 날짜(끝난 프로젝트 = 새 날짜 안 만듦) (크롬 없음, 몇 초)
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
| 진행 항목 '적용' 판정(기술2·3팀 등 — projectListData `emptyProgOffOf`·`naProgressItemsOf`, List `naToProgressItems`·`isNaItemCell`·`isExOnProgCell`·`progSwitchOf`·`blankProgressCopyOf`·`autoLockedColsOf`, 메인표 칸 × 판정, DetailModal 스위치(통합시운전 묶음 `group`·`intColAlias`), ProgressModal 보기 범위(`DISP_MONTHS`·`yearGroups`)·`pointsForMain`·[적용하기] 항목, MobileInputScreen `applyToMain`) | `prog_item_sync_test.js` — 경우별 행(001형 캡쳐·전부 빈칸·총점만·0도 값·켠 항목·끈 Point·NAS 010형)을 기술2·3팀 카드로 돌려 **메인표 × ⇔ 팝업 줄 없음 ⇔ 상세 보기 꺼짐 ⇔ 모바일**이 같은지 · 상세 보기 스위치를 jsdom에서 실제로 눌러 봄 · '전체 기간 보기' 9/30 = 2026-01~2027-03 · 모바일 [적용하기]를 가짜 서버에(바뀐 칸만 merge·NAS 칸 제외·Point·진행율 %). `PROG_SYNC_DATA=백업JSON경로[;경로2]`를 주면 실제 2026 메인 행 전부 네 화면 대조 · **7장(9/30 오후)**: 메인표·상세/수정·새 행에서 친 PLC·ETOS·HMI·Point의 장부 위치(projectListData `handPctTarget`·`handPointTarget`·`mainBaseOf`, List `syncProgressCellToLedger`·`syncAccPointToLedger`를 가짜 서버에 — 같은 값·0 = 안 씀 · 완료·취소 = 새 날짜 안 만듦 · 진행 중 = 이번 주 · NAS·심기 = 이번 주) · 팝업 합계·진척률·[적용하기]와 App.js 그래프의 기준값(기록 없는 항목 = 메인표 값) · 기술3팀 001 캡쳐 순서 재현. **장부에 쓰는 함수(syncProgressCellToLedger·syncAccPointToLedger)나 팝업 합계 계산을 고치면 필수** |
| 행 순서·중간 삽입(projectListData `orderListRows`·`placeDraftRows`·`planReanchorOnDelete`, List 구독 순서·`pasteCopiedRows`(target)·우클릭 [이 행 위에/아래에 삽입]·`sortedRows` 노란 새 행 자리·`saveDraft` 쪽지 시각·`deleteRow` 옮겨 달기, MobileInputScreen·Tech1MonthlyScreen 순서, 연도별 1:1 검증 순서) · (오후 추가) `planMoveRows`·`cutSelectedRows`·`moveCutRows`·`pushUndoOnce`·`undoDraft`·`execDigitsToNo`·`isProgNumCol`·x 키인 규칙 — **행 순서를 정하는 곳, 하위(공종) 행 부모 규칙, 초안(노란 칸) 쓰는 곳, 키보드(Ctrl+X/V/Z)를 고치면 필수** | `row_insert_test.js` — 원문 함수를 꺼내 '엑셀에서 행 넣고 빼기' 모형과 무작위 조작 400가지 × 40번 대조(삽입·Ctrl+V·하위 추가·완전 삭제·하위 삭제) · 노란 새 행 표시 자리 = [저장] 뒤 자리(1,000가지) · 노란 행/저장 행을 지운 뒤에도 나머지 제자리 · 하위가 늘 진짜 부모 바로 아래 · 쪽지 잘못돼도 행이 안 사라짐 · 2,600행 속도. 쪽지 = 새 행 `_place`({id, side, at}) — 기존 행은 안 바뀜 |
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
