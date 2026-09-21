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

## 주의

- `hdr_oneline_test.js`는 `build/static/css/*.css`(마지막 `npm run build` 결과)와 같은 폴더의 `tailwind.cdn.js`(앱과 같은 Tailwind 런타임)를 씁니다. 빌드가 한 번도 없으면 먼저 `npm run build`.
- 크롬 경로는 `C:/Program Files/Google/Chrome/Application/chrome.exe` 기준입니다.
- 검사 결과 페이지는 임시 폴더(`%TEMP%/pms_hdr_measure.html`)에 씁니다. 저장소에는 아무것도 남기지 않습니다.
- `extsync_stale_test.js`는 옛 코드로 사고를 재현합니다. 백업 파일(`.bak-2026-09-21-extsync`)이 있으면 그것을, 없으면 검사 안에 박아 둔 원문 4줄을 씁니다.
