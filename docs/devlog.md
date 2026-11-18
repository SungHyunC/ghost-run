# Ghost Run+ 개발 기록

하루에 한 줄 이상 쓴다. 크레딧은 Kiro 상태 표시줄의 사용량 표시(누르면 계정 대시보드가 열린다), IDE 채팅 메시지마다 붙는 "Est. Credits Used", Kiro CLI `stream-json` 출력의 턴별 사용량에서 읽는다. 처음에는 무료 플랜 월 50크레딧뿐이라 남은 크레딧이 10 아래로 내려가면 멈추기로 했다. 11/18 오전에 해커톤 크레딧 4,000을 받은 뒤부터는 기획서의 점검선(11/23까지 1,300 이하, 11/30까지 2,900 이하, 12/2까지 3,400 이하)을 따르고, 모델은 Auto를 기본으로 쓴다.

역할: 제품 코드, spec, steering, hook, PBT는 Kiro가 만든다. Claude Code는 Kiro 화면 조작(프롬프트 입력과 승인), 결과 검토, 저장소 밖 실험(A·C), 이 기록 정리를 맡는다.

## 2026-11-18 (수)

### Kiro 크레딧

| 시각 (KST) | 시점 | 상태 표시줄 (사용 / 한도) | 메시지별 예상 사용 | 남음 (추정) |
| --- | --- | --- | --- | --- |
| 01:05 | 작업 전. Kiro IDE 1.4.215, Google 로그인, Kiro Free, 모델 Auto | 0 / 50 | | 50 |
| 06:26 | Steering → `+` → Project steering files (Generate Steering Docs와 같은 기능). product·tech·structure.md 생성, 2분 2초 | 0 / 50 (5시간 전 값) | 0.7 | 49.3 |
| 06:36 | steering 다듬기: 세 개 수정 + world-contract·security·halloween-ui 추가, 7분 8초(승인 대기 포함) | | 1.42 | 47.9 |
| 06:37 | 후속 수정: halloween-ui 앞머리 형식, P6 주장 범위, 28초 | | 0.32 | 47.6 |
| 06:38 | 계정 대시보드 확인 (사용량은 12/01에 초기화) | **2.46 / 50** | 합계 2.44 | **47.54** |
| 06:45 | core-contract spec requirements 생성 (Requirements-First, Auto, 약 4분 반). 변경 검토(Accept/Reject)는 사용자 검토 대기라 아직 누르지 않음 | **4.23 / 50** | 턴이 끝나지 않아 표시 없음. 대시보드 차이 1.77 | **45.77** |
| 07:01 | 사용자 검토 뒤 Accept → Kiro가 요구사항마다 하위 에이전트로 다듬는 detailing 단계를 돌리고 턴 종료 (턴 전체 22분 38초, 사용자 대기 시간 포함) | | spec 턴 전체 5.81 | |
| 07:04 | requirements 수정 요청 1회 (detailing 없이 파일만, 1분 42초) | **9.6 / 50** | 1.31 | **40.4** |
| 07:08 | 실험 B: Ask Kiro to create a hook으로 hook 2개 + 판정 스크립트 생성 (1분 44초) | | 0.57 | |
| 07:09 | 실험 B 1차 시험: hook이 돌지 않음 | | 0.13 | |
| 07:13 | 실험 B 2차 시험 (hook 켠 뒤): hook이 여전히 돌지 않음 | | 0.12 | |
| 07:16 | Reload Window 뒤 3차 시험: `rm -rf` 막힘 | | 0.17 | |
| 07:17 | hook 명령을 상대 경로로 수정 | | 약 0.25 (대시보드 차이로 계산) | |
| 07:18 | 상대 경로 확인: `rm -rf` 막힘, `pwd` 통과 | **10.95 / 50** | 0.11 | **39.05** |
| 08:17 | core-contract design 생성 (Generate Tech Design, 2분 48초) | | 3.24 | |
| 08:22 | design 검토 뒤 8가지 수정 (파일 전체 재작성 + 검사기 형식 맞춤, 3분 29초) | | 4.07 | |
| 08:31 | design·requirements 남은 4가지 수정 + tasks.md 생성 (7분 55초) | **22.43 / 50** | 4.12 | **27.57** |
| 08:34 | 작은 수정 2가지(작업 14 추가, deny 조건 `⊃`), 1분 8초 | **25.23 / 50** | 2.79 | **24.77** |
| 09:11 | Kiro CLI 3.4.0 비대화형(V3)으로 실험 B: `rm -rf` 막힘, `pwd` 통과 | | 0.106 (CLI 출력의 턴별 사용량) | |
| 09:13 | CLI에서 `/usage` 시험. 비대화형에서는 명령이 아니라 질문으로 처리되고, 계정 합계는 나오지 않음 | | 0.114 | 약 24.55 (합산) |
| 09:18 | CLI로 작업 1~3을 값싼 모델(qwen3-coder-next)에 맡겼다가 중단. 파일 쓰기 도구 이름을 틀려(`write_file`) 쓰기가 계속 실패했다 | | 턴이 끝나기 전에 멈춰 표시 없음 | |
| 09:20 | 해커톤 크레딧 4,000 받음. 이후 Auto 모델 기본 | | | |
| 09:24 | CLI spec 모드로 core 작업 1~3 (Auto, 3분 반, 패키지 설치 포함) | | 6.31 | |
| 09:26 | CLI spec 모드로 ghost-runner requirements 생성 (병렬, 5분) | | 6.03 | |
| 09:28 | CLI spec 모드로 core 작업 4, 5, 14 (3분) | | 5.13 | 누계 약 43 / 4,050 |
| 09:34 | core 작업 6, 7, 12, 13 + 결계 판정 수정 (4분) | | 9.25 | |
| 09:41 | core 작업 8~11 + PBT 형식·집계 (6분). core-contract 14개 작업 완료 | | 11.85 | |
| 09:41 | ghost-runner requirements 수정 + design.md (13분, 병렬) | | 17.70 | 누계 약 82 / 4,050 |
| 09:46 | ghost-runner tasks.md (작업 16개, 세부 78개, 실행 묶음 14개) | | 6.07 | |
| 09:50 | wards requirements (요구사항 19개, 병렬) | | 9.26 | |
| 09:51 | ghost-runner 구현 1차: 작업 1~2 (패키지 뼈대, structure.md, core 빌드와 exports 맵) | | 11.87 | 누계 약 109 / 4,050 |
| 09:59 | ghost-runner spec 정합 수정 (core 기준 Change 이름, canary 메모리 전달, eventId, core 변경을 새 작업 3으로) | | 15.80 | 누계 약 125 / 4,050 |
| 10:04 | possession requirements (요구사항 14개) | | 5.48 | |
| 10:11 | wards requirements 정합 + design.md (20분, 서버 속도 제한 429를 8번 받음, 지시 범위를 넘어 ghost-runner spec도 고침) | | 34.08 | 누계 약 165 / 4,050 |
| 10:14 | possession design.md (성질 19개) | | 12.98 | 누계 약 178 / 4,050 |
| 10:23 | ghost-runner 구현 2차: 작업 3~6 (core 타입 변경, 설정·결과·판정, B안 정적 분석기, Docker 인자와 마운트 감사), 11분 | | 38.33 | 누계 약 216 / 4,050 |
| 10:28 | possession design 수정(태그 깃발, 테스트용 tsconfig) + tasks.md (작업 13개, 세부 65개, 실행 묶음 10개) | | 29.72 | 누계 약 246 / 4,050 |
| 10:34 | wards tasks.md (작업 11개, 세부 64개 중 PBT 등 선택 25개, 실행 묶음 18개) | | 11.23 | 누계 약 257 / 4,050 |
| 10:38 | ghost-runner 구현 3차: 작업 7~9 (파일 지문·복사·diff, 기록기 호스트 쪽), 15분 | | 43.33 | 누계 약 300 / 4,050 |
| 10:41 | ghost-runner 구현 4차를 긴 spec 세션에 이어 붙여 시작했다가 1분 만에 멈추고 새 세션으로 다시 시작 (읽기 3번, 변경 없음) | | 턴이 끝나기 전에 멈춰 표시 없음 | |
| 10:43 | ui-kit requirements (요구사항 16개, 화면 성질 UI-P1~UI-P11) | | 10.90 | 누계 약 311 / 4,050 |
| 10:54 | possession 구현 1차: 작업 1~3 (도구 설정, 유니코드 표 생성기와 표, 순수 검출 모듈), 10분 | | 28.80 | 누계 약 340 / 4,050 |
| 10:56 | ghost-runner 구현 4차: 작업 10~11 (상자 이미지와 상자 안 기록기, Docker 계층과 풀), 15분 | | 35.71 | 누계 약 376 / 4,050 |

### 한 일

- 00:36 저장소를 만들었다. `git init`, MIT `LICENSE`, `.gitignore`(`.kiro/`는 무시하지 않음). 아직 커밋 없음.
- 01:05 `kiro ~/orca/projects/ghost-run`으로 열었다. 폴더가 Restricted Mode라서 Workspace Trust에서 Trust를 눌렀다.
- 06:24 Steering 영역에 전역 항목(architecture-selection, quick-spec, bug-fix)이 있어서 빈 화면용 "Generate Steering Docs" 버튼이 보이지 않았다. 대신 `+` 목록의 "Project steering files"가 같은 기능이었다. Kiro는 `docs/plan.md`를 직접 읽고 영어로 세 문서를 썼다.
- 06:28 새 세션에서 steering 다듬기를 시작했다. 채팅의 `#` 파일 선택기에는 `.gitignore`에 든 `docs/plan.md`가 나오지 않는다. 그래서 `#[[file:docs/plan.md]]`를 직접 쓰고 "첨부가 안 보이면 직접 읽어 달라"고 덧붙였다. Kiro는 Read File로 읽었다.
- 06:37 steering 6개 완성(모두 영어): product, tech, structure, world-contract, security(이상 `inclusion: always`), halloween-ui(`fileMatch`: `ui/**`, `apps/**`). 합계 378줄. 검토에서 고친 것 두 가지: Kiro가 처음 쓴 halloween-ui 앞머리(`inclusion:` 아래 목록)는 문서의 형식이 아니라서 `inclusion: fileMatch` + `fileMatchPattern` 배열로 바꾸게 했다. P6의 주장 범위가 기획서보다 넓어서 "네트워크 시도를 기록할 수 있는 상자 안"으로 좁히고, 압축·암호화·DNS 한 글자씩 보내기는 내용 검사 범위 밖이라고 적게 했다. 숨은 유니코드 검사: 6개 모두 0개.
- Supervised 모드에서는 파일 쓰기마다 Allow(도구 승인)와 Accept/Reject(변경 검토)를 한 번씩 거친다.
- 06:38 Specs → Create New Spec. 아이디어 입력란에 미리 정해 둔 spec 프롬프트(저장소 밖 인수인계 문서 7장)를 그대로 넣고, 앞에 `#[[file:docs/plan.md]]`만 붙였다(보낸 메시지에서 plan.md 첨부로 바뀌었다). Kiro가 "Build a Feature"와 시작 방식("Requirements"를 먼저)을 물어 그대로 골랐다. 하위 에이전트 `feature-requirements-first-workflow`가 `.kiro/specs/core-contract/requirements.md`(147줄, 요구사항 12개, 영어)와 `.config.kiro`(`workflowType: requirements-first`)를 만들었다. 사용자 검토를 기다리며 design 단계로 넘어가지 않았다.
- 07:01 Accept하자 Kiro는 design으로 가지 않고 requirements를 더 다듬는 detailing 단계(요구사항마다 하위 에이전트)를 돌렸다. spec 턴 전체가 5.81크레딧으로, 오늘 가장 비쌌다. 끝나면 "Generate Tech Design / Generate Task List / Analyze Requirements"를 내놓고 멈춘다.
- 07:04 검토에서 나온 8가지를 한 번에 고치게 했다(파일만 직접, 1.31크레딧).
  - 범위를 넘는 주장 바로잡기: "놀이터는 항상 결정적"을 지우고 결정적 세계를 메모리 FS + sql.js로 한정, step의 "복사본 밖을 안 바꾼다"를 놀이터와 box로 한정, effectsOutside를 정적으로 알 수 있는 목적지만 돌려주는 best effort로 낮추고 실행 중 관찰한 네트워크 시도는 별도 사건으로 보고, fingerprint는 암호학적 해시와 바뀐 경로 목록.
  - detailing이 만든 오류 고치기: 3.2가 "step이 돌려주는 상태가 입력과 같다"로 잘못 쓰여 있었다. 3.4의 success·error가 Snapshot 정의에 없었다.
  - P4: 판정 순서 pass < warn < block에 대한 단조성(warn→pass도 금지), 결계 종류별 '더 엄격함' 정의(max_* 낮춤, min_* 높임, 목록 추가, allow_hosts 축소).
  - P3: 계약에 restore가 없으므로 "불변 스냅샷 재사용 = 복원"으로 정의하고, 물리 세계는 warmstart 같은 적분 상태까지 비트 단위로 같아야 한다고 적었다(실험 C 결과).
  - 시간 기준 통일: 저장 시 성질마다 100회, 세계 하나 전체 60초 안. 밤에는 성질마다 10,000회.
  - 요구사항 12: 등록 게이트만 남기고, hook 연결과 놀이터 탭 자동 등록은 kiro-integration·ui-kit spec으로 넘겼다.
  - diff 완전성(상태가 다르면 diff가 비어 있지 않다) 추가, 용어 Sandbox → box.
  - 남은 메모: 6.2는 "지문과 함께 바뀐 경로 목록을 돌려준다"인데 계약의 `fingerprint(): Promise<string>`과 형태가 맞지 않는다. design 단계에서 정한다.
- 07:06 실험 B를 시작했다(아래 실험 B). Agent Hooks → Create New Hook → "Ask Kiro to create a hook". 이 메뉴는 "hook 기능 개요를 알려 달라"는 문장을 미리 채운 새 세션을 연다. 개요 설명에 크레딧을 쓰지 않도록, 이 문장을 바로 만들어 달라는 요청으로 바꿔서 보냈다.
- 07:15 Developer: Reload Window. 창을 연 뒤에 폴더를 신뢰한 탓에 Kiro 에이전트가 계속 "신뢰 안 됨" 상태로 hook을 건너뛰고 있었다. Reload 뒤에야 hook이 돌고, Steering 패널에 Workspace의 steering 6개가 나타났다. 앞으로는 폴더를 신뢰한 다음 창을 다시 열거나 Reload한다.
- 08:14 core-contract의 design을 만들었다(Reload 뒤라 이번부터 steering이 들어간다). 검토에서 고친 것:
  - P2가 공허했다. 진짜 실행도 ghostRun과 같은 step으로 해서 늘 같았다. 결정적 세계의 테스트 어댑터 `apply`(현실을 바꾸는 경로, World 계약 밖)와 비교하도록 바꿨다.
  - 결계 형식이 기획서의 `wards.yaml`과 달랐다(id 없는 평평한 구조, `deny`를 네트워크 목적지로 씀, 기획서에 없는 필드). `WardSet = { wards: Ward[] }`, id와 kind로 구분하는 합집합으로 바꾸고, `isMoreRestrictive`는 id로 짝지어 집합 포함으로 비교한다.
  - WardEngine이 diff만 받고 판정만 돌려줬다. 입력을 유령 보고서(changes, 관찰 사건, effectsOutside, 변형 결과)로, 출력을 판정 + 어긴 결계 id·종류·이유로 넓혔다.
  - core가 Node 표준 라이브러리와 vitest를 import하고, 등록할 때 브라우저에서 PBT를 돌리는 설계였다. core/src는 런타임 의존성 없이 Web Crypto만 쓰고, 계약 검사 `verifyWorld`(fast-check만 사용)는 테스트·hook에서 돌며, 놀이터는 통과한 세계 목록(manifest)만 읽게 바꿨다.
  - `fingerprint`가 "이전 호출 이후 바뀐 경로"라는 상태를 가졌다. 전체 해시 + 자원별 manifest를 돌려주고, 바뀐 경로는 순수 함수 `compareFingerprints`로 구하게 바꿨다.
  - Property 1에 주장 범위(놀이터와 box, B안 제외)를, P3에 물리 세계의 적분 상태(warmstart)를 넣었다.
- 08:31 tasks.md(작업 13개, 의존 그래프와 실행 묶음)를 만들었다. 각 작업에 요구사항 번호와 PBT 성질이 붙어 있다. 구현은 시작하지 않았다(11/19 결정 뒤 일정).
  - 08:34 빠져 있던 테스트용 기준 세계 작업을 작업 14로 추가했다(`tests/fixtures`의 `KeyValueWorld`와 P2용 `kvTestAdapter`, 작업 6·8·9·10·11이 의존). design 표의 path `deny` 조건도 `⊇`(같아도 참)에서 `⊃`로 고쳐, 같은 결계끼리 비교하면 false가 나오게 했다. 작은 수정인데도 2.79크레딧이 들었다.
  - Kiro는 이 spec에서 파일을 셸 heredoc(`cat > ... << 'ENDOFFILE'`)이나 python으로 자주 고쳤다. 그래서 `write` hook이 아니라 `shell` hook을 거친다. ghost-gate를 설계할 때 염두에 둔다.
- **spec 하나의 크레딧:** core-contract를 requirements부터 tasks까지 검토·수정 포함으로 만드는 데 약 21.4크레딧이 들었다. requirements 7.14(detailing 단계 포함), design 7.31, tasks 4.12, 마지막 작은 수정 2.79다. 검토 뒤 고치는 턴이 생성만큼 비쌌으므로, 처음 프롬프트에 제약을 더 많이 넣는 편이 싸다. 기획의 spec이 8개이고 구현은 별도이므로, 무료 50크레딧으로는 spec 문서도 다 만들 수 없다. 해커톤 크레딧 신청이 필요하고, 단순한 작업은 값싼 모델(Qwen3 Coder Next 0.05배, DeepSeek 3.2 0.25배)로 돌리는 것도 검토한다.

### 구현 시작 (Kiro CLI, 09:20~)

- 방식: Claude Code가 `kiro-cli chat --v3 --no-interactive --agent spec --trust-workspace --trust-all-tools --output-format stream-json "<지시>"`로 Kiro의 spec 에이전트를 부르고, 끝나면 코드를 읽고 `tsc`·`eslint`·`vitest`를 직접 돌려 검토한다. 고칠 점은 다음 실행의 지시에 넣어 Kiro가 고친다. Kiro는 작업마다 내장 하위 에이전트(`spec-task-execution`)를 띄우고, tasks.md와 `tasks.meta.json`에 상태를 적는다. 구현은 tasks.md의 실행 묶음(wave)대로 나눠 돌린다.
- pnpm은 전역 설치 없이 `corepack pnpm`으로 쓴다(Kiro가 루트에 `packageManager: pnpm@12.21.0`을 적었다). pnpm 12가 빌드 스크립트를 막아 `pnpm-workspace.yaml`에 `allowBuilds: { esbuild: true }`가 들어갔다. Node 20.20.2라 vitest는 3.x, typescript는 5.9로 고정했다.
- 작업 1~3(패키지 뼈대, `types.ts`, `compareFingerprints`): `types.ts`는 design.md와 똑같다. `tsc --noEmit`, `eslint src` 통과(Claude Code가 다시 돌려 확인). 남은 메모: lint 규칙은 `node:*`만 막고 `fs` 같은 접두어 없는 내장 모듈은 못 막는다(tsconfig `types: []`가 타입 검사에서 대신 막는다). core의 `main`이 TypeScript 원본이라 Node(hook, ghost-runner)에서 쓰려면 빌드가 필요하다.
- 작업 4, 5, 14(`isMoreRestrictive`, `WardEngine`, `ghostRun`, 테스트용 `KeyValueWorld`): 판정 규칙은 P4 단조성을 지킨다. 검토에서 고칠 점 3가지를 찾았다. 결계가 없으면 바깥 부작용이 있어도 pass를 주는 점(기획서의 warn은 결계와 무관하다), warn에 이유가 없는 점, 보호 경로에 glob(`data/**`)이 안 되는 점이다. 앞의 두 가지는 다음 묶음에서 고치게 했고, glob은 wards spec에서 다룬다(P5 주장이 여기에 달려 있다).
- WardEngine이 판정하려면 Change의 모양이 정해져 있어야 하는데 design에 없었다. 파일 변화(`file-created`, `file-overwritten`, `file-deleted`)와 SQLite 표별 행 수(`sql-row-count`) 타입을 `types.ts`에 명시하게 했다.
- ghost-runner spec: 실험 A의 측정값과 권장안을 처음 프롬프트에 모두 넣어 requirements를 한 번에 썼다(요구사항 19개). Kiro가 정한 "B안은 늘 최소 warn"(리허설 없이 pass를 주지 않음)은 받아들였다. 고친 것: 시간 기준을 5회 중앙값으로, Docker 세계의 저장 시 PBT를 성질마다 20회로 줄여 hook 60초를 지키기, `--cap-drop ALL`에서 53번 포트가 열리는 것은 실험 A에서 확인됨, 제외 폴더 안의 보호 경로 감지, 런타임 요구로 잘못 쓴 devlog 기록 요구.

- 작업 6, 7, 12, 13: `verifyWorld`(fast-check만 사용, 옵션에 행동 생성기 `actionArb` 추가), P4 PBT, 결계 단위 테스트 20개, 타입 테스트 5개. 함께 고친 것: 결계가 없어도 바깥 부작용이 있으면 warn, warn에도 이유 목록(`notices`). 
- 작업 8~11: P1·P2·P3 PBT와 `verifyWorld` 예제 테스트. **core-contract 14개 작업 완료, 테스트 35개 통과, 타입 오류 없음**(Claude Code가 다시 돌려 확인). core 구현 크레딧 합계 약 32.5.
- **PBT가 드러낸 약점(테스트 쪽):** PBT가 공허하지 않은지 집계를 넣자, 처음 만든 P4 생성기에서 "더 엄격한 결계에서 판정이 실제로 올라간 경우"가 100번 중 4번뿐이었다. 보고서 생성기를 보강해 37/100(밤 실행 3,956/10,000)으로 올리고, 15% 이상이어야 한다는 단언을 넣었다. P1은 26~50단계 계획이 한 번도 생성되지 않아 생성기를 바꿨다. 지금 집계는 P1·P2·P3에서 상태가 실제로 바뀐 경우가 94~99%다. `pass→warn` 쌍이 안 나오는 것은 warn이 결계와 무관하게 부작용에서만 생기기 때문이며 의도대로다.
- **Kiro PBT 기록:** 우리 tasks.md의 PBT 작업이 Kiro 형식이 아니어서 `update_pbt_status`가 인식하지 못했다. 작업 7·8·9·11을 Kiro 형식(`**Property N: …**`, `**Validates: Requirements …**`)으로 바꾸자 `tasks.meta.json`의 `pbtResults`에 4개 모두 passed로 기록됐다.
- 밤 실행(`GHOST_PBT_MODE=nightly`, 성질마다 10,000회): 전체 3.4초(벽시계).
- ghost-runner design(약 780줄, 성질 22개): secret-read는 동작마다 `strace -f --seccomp-bpf`로 `openat`·`connect` 추적, 기록기 출력은 복사본 밖 Docker 볼륨(변조 방지 아님으로 표시), ctime 후보만 다시 해시, 상자 이미지는 로컬 빌드(기반 이미지 digest 고정), core는 `tsc`로 `dist/`를 만들어 Node에서 쓴다. HTTPS 본문은 상자 전용 CA(이미지 빌드 때 생성, 저장소에 넣지 않음)로 잡는다. 숨은 문자·로컬 경로 없음 확인.

- ghost-runner tasks.md를 스크립트로 대조했다. 참조하는 요구사항 150개가 모두 requirements.md에 있고, 요구사항 19개가 모두 어떤 작업에서 다뤄진다.
- **spec끼리 어긋난 곳(09:50):** wards requirements를 쓰던 Kiro가 찾았다. ghost-runner design은 파일 덮어쓰기를 `file-modified`, SQLite 변화를 `sqlite-table-rows-changed`로 내는데, 이미 구현된 core의 WardEngine은 `file-overwritten`과 `sql-row-count`만 안다. 그대로 구현했다면 보호 파일을 덮어써도 막지 못했다. 또 내용 검사에 쓸 canary 값을 어디서 받는지 정해져 있지 않았다. "둘 다 받기"로 덮지 않고, core의 이름 하나로 맞추기로 했다(`symlink-changed`, `dropped`, `ObservedEvent.eventId`는 core에 추가). canary 값은 실행기가 복사본의 비밀 파일을 메모리로만 읽어 판정기에 넘기고 저장하지 않는다. ghost-runner 구현 1차를 하던 Kiro도 같은 불일치를 따로 발견해 기록했다.
- **패턴 hook의 오탐(09:49):** 실험 B의 `rm -rf` 차단 hook이 Kiro의 정상 작업을 막았다. Kiro가 시나리오 5의 테스트 fixture(`"clean": "rm -rf data"`라는 글자가 든 파일)를 셸 heredoc으로 쓰려 했는데, 명령 글자 안에 `rm -rf data`가 있어 차단됐다. 실제로 지우려던 것이 아니다. Kiro는 파일 쓰기 도구로 바꿔 계속했다. 명령 모양으로 판정하면 이렇게 틀리므로, ghost-gate는 기획서대로 상자 안 diff로 판정해야 한다는 근거다.
- ghost-runner 구현 1차(작업 1~2): `ghost-runner/` 패키지, core가 ghost-runner를 import하지 못하게 막는 lint 규칙과 시험, structure.md 갱신, `.gitignore`에 빌드 결과와 개인 키 파일 패턴 추가(`.kiro/`는 여전히 무시되지 않음을 확인), core를 `tsc`로 빌드하고 `exports` 맵(`.`과 `./verify`)을 둠. core 테스트 35개 그대로 통과, ghost-runner 테스트 8개 통과(Docker 시험 1개는 상자 이미지가 작업 9에서 생기므로 건너뜀).

- **동시 실행과 속도 제한(10:00 전후):** Kiro CLI 세션 3개(wards design, ghost-runner 정합 수정, possession requirements)를 동시에 돌리자 서버가 HTTP 429 `ThrottlingException`(`USER_REQUEST_RATE_EXCEEDED`)을 돌려줬다. CLI가 재시도해 작업은 끝났지만 wards design은 20분, 34크레딧이 들었다. 이후 동시 실행은 2개까지로 줄인다.
- **같은 파일을 두 세션이 고친 일:** wards design 세션이 지시 범위를 넘어 ghost-runner의 requirements와 design도 고쳤다. 같은 시간에 ghost-runner 정합 수정 세션도 같은 파일을 고치고 있었다. 정합 수정의 표시(W0, `secretValues`, `eventId`, `symlink-changed`, `dropped`)가 모두 남아 있고, 옛 이름은 금지 문장 안에만 있음을 grep으로 확인했다. 앞으로는 한 spec을 두 세션이 동시에 고치지 않게 지시에 "이 spec만 고친다"를 넣는다.
- wards design: 판정 모듈은 `core/src/judge/`, `wards.yaml` 해석은 별도 패키지 `@ghost-run/wards-config`(`yaml` 2.9.1, ISC, Claude Code가 npm으로 확인), 기본 `wards.yaml`은 `apps/ghost-shell/`에 둔다. `evaluate(report, wardSet, { secretValues, payloads })`는 ghost-runner와 같은 모양이다. 짧은 canary(`PORT=3000` 등)로 시나리오 4가 warn이 되지 않게, canary를 버렸다는 알림은 페이로드가 있을 때만 낸다. 모드만 바뀐 파일(`chmod`)은 Change가 없어서 결계가 보지 못한다는 한계를 적었다.

- possession design: 순수 검출기는 `core/src/possession/`, 파일 읽기 어댑터만 `core/possession-node.ts`(하위 경로로 내보냄). 놀이터용 모듈이 Node·DOM 전역 객체에 기대지 않는지, ECMAScript 내장 객체만 있는 `node:vm` 영역에서 돌려 Node 결과와 비교한다(jsdom은 전역을 채워 넣어 실수를 숨기므로 쓰지 않음). 이모지 판정 표는 유니코드 16.0.0 `Extended_Pictographic`에서 스크립트로 16진수 범위만 생성한다.
- **P7의 함정 하나 더(설계 검토에서 발견):** 잉글랜드·스코틀랜드·웨일스 깃발 이모지는 태그 문자(U+E0000대)로 만들어진다. 설계대로면 이 깃발이 숨은 글자로 잡혀 "이모지만 있는 글은 걸리지 않는다"는 P7 주장이 거짓이 된다. 반대로 태그 문자를 통째로 허용하면 깃발 뒤에 지시문을 숨길 수 있다. 유니코드 공식 목록(RGI_Emoji_Tag_Sequence)에 있는 시퀀스만 허용하고 나머지 태그 문자는 잡도록 고치게 했다. 기획서의 ZWJ 함정과 같은 종류다.
- 같은 검토에서, 테스트 때문에 core의 `tsconfig` `types`를 `["node"]`로 바꾸려던 설계를 막았다. 그러면 core/src가 Node 내장 모듈을 쓰지 못하게 하던 타입 검사 안전망이 사라진다. 테스트용 tsconfig를 따로 두고, lint가 `fs` 같은 접두어 없는 내장 모듈도 막게 한다.
- possession tasks.md(10:28): 위 두 가지를 design에 반영한 뒤 작업 13개(세부 65개, 성질 1~22)로 나눴다. 유니코드 표를 만드는 작업 2.2는 네트워크로 공식 데이터를 받거나 `--source`로 파일을 넘겨야 한다. 선택 작업 표시는 없어서 전부 구현한다.
- possession 구현 1차(10:54): `core/src/possession/`(분류, 이모지·태그 시퀀스 규칙, 검사, 정화, 출처 기록, 붉은 실, 진입점)과 유니코드 표 생성기. 표는 unicode.org 16.0 고정 주소에서 받아 SHA-256을 고정했고, 태그 시퀀스는 잉글랜드·스코틀랜드·웨일스 세 개다. 다른 세션이 ghost-runner를 빌드하며 core build를 부르므로, 없는 파일을 가리키는 build 스크립트 변경은 Node 어댑터를 만드는 작업 4.1로 미루게 했다. Claude Code 확인: core typecheck·lint·build·테스트 43개 통과, ghost-runner typecheck 통과, 새 파일에 ASCII 밖 바이트 없음. 빌드 결과로 몇 문장을 직접 검사해 봤다. 한글, 가족 이모지, 잉글랜드 깃발, 결합 문자는 0건이고, 목록에 없는 태그 깃발, 글자 사이 U+200D, 태그 문자로 숨긴 `curl setup-check.example`, 방향 제어 문자, HTML 주석, 파일 맨 앞 U+FEFF는 모두 잡혔다(숨긴 문장도 풀어서 보여 줌).
- 이 세션에서도 실험 hook이 Kiro의 파일 삭제를 막아서 Kiro가 `/tmp`에 임시 파일 두 개를 남겼다. Claude Code가 내용을 확인하고 지웠다.
- wards tasks.md(10:34): `wards.yaml` 해석 패키지는 `integrations/`가 아니라 저장소 바로 아래 `wards-config/`에 둔다. core에는 `case_sensitive` 선택 필드와 알림 종류 두 개만 더한다. possession과 wards 구현은 둘 다 `core/eslint.config.mjs`와 `core/src`를 고치므로 동시에 돌리지 않는다. wards의 PBT 작업은 선택(`*`)으로 표시됐으니 구현할 때 선택 작업까지 모두 하라고 지시한다.
- ui-kit requirements(10:43): `ui/`(@ghost-run/ui)는 core·possession·wards가 낸 값을 그리기만 한다. 화면 성질은 안전 계약 P1~P8과 섞이지 않게 UI-P1~UI-P11로 따로 붙였다(Change마다 거울 행 하나, 판정마다 촛불 상태 하나, 렌더 결과에 숨은 글자·canary 없음, 두 테마 대비, B안에서는 격리 문구를 띄우지 않음 등). 검토에서 하나를 고치게 했다: 격리 주장 표시에 docker-box와 static-analysis만 있어서 놀이터에서는 "Isolation status unknown"이 뜬다. 기획서대로 놀이터에서도 P1을 주장하므로 playground 모드를 더한다. 가족 이모지 안의 U+200D까지 모두 `<U+200D>`로 보이게 한 보수적 선택(A6)은 그대로 둔다.
- 화면 의존성은 Claude Code가 npm에서 버전·라이선스·Node 요구 사항을 확인해 design 지시에 넣었다. 이 저장소는 Node 20.20.2라서 vite 8은 되지만 vitest 5와 jsdom 27 이상은 Node 22가 필요해 쓸 수 없다. vitest 3.2.7이 vite 7까지만 받으므로 vite 7.3.8로 맞춘다. axe-core는 MPL-2.0이라 쓰면 개발 의존성으로만 쓴다.

- **Kiro Crew가 끼어든 일(10:13):** 이 Mac에는 Kiro Crew 0.12.2가 전역 설치돼 있어서, CLI 세션에서 `kirocrew-*` 에이전트와 `kirocrew-work` MCP 도구가 보인다. ghost-runner 구현 2차에서 spec 에이전트가 spec 문서 수정을 `kirocrew-worker` 하위 에이전트에 맡겼고, 그 에이전트가 Crew 작업 기록 도구(`work_brief`, `work_report`)를 불렀다. 세션 신원 확인 실패로 Crew 기록에는 아무것도 남지 않았고, 수정 자체(`secretValues` 상한: 파일 16개, 파일당 64 KiB, 요구사항 9.15, 작업 12.8a·b)는 정상이었다. 기획에서 Crew는 뺐으므로, 이후 실행은 `--trust-all-tools` 대신 `--trust-tools=@builtin`(내장 도구만 허용)을 쓰고 지시에 "kirocrew 에이전트와 도구는 쓰지 않는다"를 넣는다.

- ghost-runner 구현 2차(작업 3~6): core에 `symlink-changed`, `dropped`, `ObservedEvent.eventId`, `evaluate(report, wardSet, { secretValues, payloads })`를 더했다(core 테스트 43개 통과). ghost-runner는 설정·결과·판정 합성, B안 정적 분석기, Docker 실행 인자 생성기와 마운트 감사(테스트 31개 통과, Docker 시험 1개 건너뜀). Docker 인자는 실험 A 권장안 그대로다: `--network none`, `--dns 127.0.0.1`, `--cap-drop ALL`, `no-new-privileges`, 프로세스·메모리·CPU 제한, 읽기 전용 루트와 `/tmp` tmpfs, 비root 사용자, 복사본만 쓰기 가능으로 마운트, 기록기용 익명 볼륨. 마운트 경로에 쉼표를 넣어 옵션을 끼워 넣는 것도 막는다. PBT는 저장 시 성질마다 20회, 명시 실행 100회로 나눴다.
- ghost-runner 구현 3차(작업 7~9): 파일 지문(manifest), 복사 계획과 복사기, diff, SQLite 행 수, 기록기 호스트 쪽(strace·DNS·로그 해석, 사건 id). PBT 성질 P1~P4, P13~P15를 더해 ghost-runner 테스트 77개 통과(Docker 시험 1개 건너뜀), core 43개 그대로. Claude Code가 tsc, eslint, vitest를 다시 돌려 같은 결과를 확인했다. Kiro가 확인을 요청한 결정 중 뒤에서 챙길 것: 상자 안 `ghost-count`와 `ghost-step`의 출력 형식을 호스트 해석기에 맞출 것(작업 10.2), `EventBuilder`와 수집기 연결(작업 12), 지문 지름길과 "후보 파일만 해시" 부분은 테스트가 약하다는 점(해시 횟수를 셀 수 있게 하거나 시각을 주입하게 해서 보강).
- **실험 hook이 Kiro의 삭제를 막은 일(구현 3차):** 실험 B hook이 Kiro의 도구 호출 4번을 막았다. 셸의 `rm -rf` 2번은 `/tmp`의 임시 폴더 정리라 오탐이었다. 나머지 2번은 Kiro CLI의 파일 삭제 도구(`delete_file`)로, `write` 매처가 삭제 도구도 잡는다는 증거다(기획서 완료 기준의 "셸이 아닌 파일 쓰기·삭제 도구도 잡는지"). 그런데 Kiro는 두 번 막힌 뒤 같은 파일을 셸의 `rm tests/zz-smoke.test.ts`로 지웠고, 이 명령은 `-rf`가 없어서 패턴 hook을 그대로 통과했다. 지운 것은 Kiro가 직접 만든 임시 테스트 파일이라 피해는 없다. 명령 모양으로 막는 hook은 같은 일을 다른 명령으로 하면 뚫린다는 실제 사례이고, ghost-gate가 상자 안 diff로 판정해야 하는 이유다.
- ghost-runner 구현 4차(10:56): 상자 이미지 `ghost-run/box:<내용 해시>`(arm64, 341 MB). 기반은 `node:20-bookworm-slim`을 digest로 고정했고(`docker buildx imagetools inspect`로 확인한 값), 패키지(strace, sqlite3, curl, openssl, ca-certificates)는 2026-10-01 시각으로 고정한 Debian snapshot에서 받는다. 상자 전용 CA는 이미지를 빌드할 때 만들어 이미지 안에만 둔다(저장소에 개인 키가 없음을 시험으로 확인). 상자 안 기록기는 가짜 DNS, HTTP·TLS 수신기, strace, SQLite 행 수 세기다. 네트워크 없는 컨테이너에서 `.example` 주소로 보낸 TLS 요청의 SNI가 기록되는 것을 Kiro가 확인했다. 시험 도우미가 있지도 않은 이미지 이름(`ghost-run-box:local`)을 찾고 있어서 Docker 시험이 조용히 건너뛰어지던 것도 이번에 고쳐졌다. Claude Code 확인: ghost-runner typecheck·lint 통과, 테스트 121개 모두 통과(건너뜀 0, Docker 시험 포함 8초), 시험 뒤 남은 컨테이너·볼륨 0개.
- 같은 회차에서 실험 hook이 Kiro의 셸 명령 5번을 막았는데 모두 오탐이었다. Dockerfile을 heredoc으로 쓰는 명령(안에 `rm -f`와 `--no-install-recommends`가 있어 r과 f가 함께 보임), `docker rm -f ...`, `docker run --rm --read-only --tmpfs ...`(`--rm` 안의 rm). 지금까지(ghost-runner 구현 1~4차, possession 구현 1차) 실험 hook이 막은 Kiro의 도구 호출을 CLI 기록에서 세어 보니 19번이다. 13번은 Kiro가 스스로 만든 임시 파일·폴더를 지우려던 것(삭제 도구 8번, 셸 5번)이고, 6번은 지우는 명령조차 아니었다(파일 내용에 든 `rm -rf` 글자, `docker rm -f`, `docker run --rm`). 막힌 뒤 Kiro는 같은 일을 `rm` 한 단어나 `mv`(저장소 밖 `/tmp`로 옮기기)로 해냈다. 명령 모양을 보는 hook은 위험한 명령은 한 번도 만나지 못한 채 무해한 작업만 막았고, 막은 것도 다른 명령으로 우회됐다.

### 조사 (Claude Code, 공식 출처만)

자세한 내용과 출처는 `docs/research.md`(영어)에 있다. 08:13~08:40에 조사 에이전트 두 개로 진행했다.

- **비교 대상 8개:** Claude Code, Codex CLI, Cursor, terraform plan, Flyway·Liquibase, E2B, container-use, Invariant(Snyk).
  - 네트워크를 막은 격리는 흔하다. Kiro에도 자체 로컬 명령 샌드박스(IDE 1.3+, 기본은 꺼짐)가 있다.
  - 명령 하나를 복사본에서 돌려 파일 diff와 DB 행 diff를 실제 실행 전에 보여 주는 것, 그리고 그 diff를 정책 파일로 판정하는 것은 여덟 곳 모두 문서에 없다. 이것이 차별점이다.
  - 주입된 글과 행동을 잇는 것은 Invariant가 손으로 쓴 흐름 규칙으로 이미 한다. 자동으로 원인 줄을 찾는다는 주장은 만들어서 시험한 뒤에만 한다.
  - 네트워크 없는 유령은 원격 상태를 볼 수 없다는 한계를 발표에 밝힌다.
- **라이선스:**
  - `@mujoco/mujoco`의 WASM에는 Qhull(OSI 비승인, 라이선스 문구를 함께 배포해야 함)이 들어 있다. 패키지에 LICENSE 파일도 없다. 놀이터 빌드에 제3자 고지 파일을 넣는다.
  - Docker Desktop은 직원 250명 이상이거나 매출 1천만 달러 이상인 회사와 정부 기관에서는 유료다. README에 적고 Colima·Podman·Linux Docker Engine을 대안으로 쓴다.
  - MCP SDK v2는 Apache-2.0으로 바뀌는 중이다.
- **이름:** 게임 Ghostrunner(등록 상표)보다 AI 워크플로 소프트웨어용 "GHOSTRUN" 미국 출원(2026-09-04, class 42, 심사 중)이 더 가깝다. npm `ghostrun-cli`가 `ghostrun`·`ghostrun-mcp` 명령을 쓴다(직접 확인). 명령어와 MCP 서버 이름으로 `ghostrun`은 쓰지 않는다. npm 이름 `ghost-run`은 비어 있다.
- **대회 규정:**
  - Kiro 크레딧 신청은 12/1 12:00 PT(12/2 05:00 KST)까지다. 신분증과 셀피 인증이 필요하고, Devpost 이름이 신분증과 정확히 같아야 한다.
  - 다른 AI 도구에 관한 조항은 없다.
  - 한국은 참가 제외국이 아니다.

### 실험 C: `@mujoco/mujoco` 도형 팔과 서랍 (저장소 밖, 버리는 코드)

결론: **Ghost Hand 유지 쪽 근거가 섰다.** 설치부터 브라우저 확인까지 약 15분 걸렸다(기준은 반나절).

- 패키지: 최신 4.0.1(2026-11-11 게시. 기획서의 3.9.0보다 새 버전). package.json의 license는 Apache-2.0이고, tarball에 LICENSE 파일은 없다. wasm 11.2MB(brotli 2.08MB).
- 로드: 단일 스레드 빌드는 Node 20과 Chrome 157 헤드리스에서 모두 0.1초 안에 뜬다. 멀티스레드 빌드는 COOP·COEP 헤더가 없으면 오류 없이 멈추고, 이 장면에서는 빠르지도 않다. 단일 스레드 빌드 + Web Worker면 헤더가 필요 없어 GitHub Pages에서도 돈다.
- 장면: 캡슐·상자 팔(힌지 4개 + 손가락 2개), 미끄럼 관절 서랍, 장 위의 화병. 계획은 reach → grasp → pull → release, IK는 `mj_jacSite`.
- 결정성(P8): 2,500스텝 전체의 qpos·qvel 비트 해시가 같은 프로세스, 별도 프로세스, Node와 Chrome, Web Worker, 멀티스레드 빌드에서 모두 같았다. 제어기에서는 엔진마다 다를 수 있는 `Math.sin`·`acos`·`pow`를 쓰지 않았다.
- 복원(P3): `mj_getState`/`mj_setState`를 `mjSTATE_INTEGRATION`으로 쓰거나 `new MjData(model, data)`로 복사하면 비트 단위로 같다. `mjSTATE_FULLPHYSICS`는 warmstart가 빠져 2.5초 뒤 qpos가 최대 7.4e-6 다르다.
- 변형 8개(seed 42, 마찰·감쇠·질량·손잡이 위치·센서 잡음·명령 지연): 빠르게 당기기 5/8 통과(95% 결계에 막힘), 천천히 세게 쥐기 8/8 통과(손가락 접촉력 25.7N, 상한 30N 안). 흔들지 않은 기준 세계에서는 둘 다 통과해서, 변형을 돌려야 약점이 드러난다. 변형 20개는 9/20 대 20/20.
- 시간: 5초짜리 변형 8개를 한 스레드에서 Node 0.81초, Chrome 0.60초. Web Worker 8개로 나누면 0.17초(워커가 이미 떠 있을 때). `mj_step` 한 번 13~16µs.
- 함정: MjData 하나가 기본 약 16MB라 MJCF에 `<size memory="1M"/>`가 필요하다. WASM 메모리가 커지면 `data.qpos` 같은 view가 오류 없이 길이 0이 된다. README와 실제 API가 다르다(`new DoubleBuffer(n)`, `GetView()`). `.delete()`를 빠짐없이 부르면 40회 실행 뒤에도 힙이 그대로였다.
- 재지 않은 것: Three.js로 유령 팔 8개를 겹쳐 그리는 비용.

### 실험 A: Docker 상자 유령 (저장소 밖, 버리는 코드)

결론: **A안은 되고, hook 제한 60초 안에 넉넉히 끝난다.** 다만 DNS 대기와 오프라인 명령 제한 시간은 설계에 넣어야 한다.

- 환경: Apple M1, macOS 26.6.2, Docker Desktop(Engine 29.8.2), 이미지 `node:20-alpine` + sqlite·strace·curl.
- 가짜 저장소: 파일 3,945개(72MB, node_modules 없음), users 1,206행 SQLite, 가짜 canary `.env`, `"clean": "rm -rf data"`, 저장소 밖을 가리키는 링크 2개, 저장소 밖 감시 폴더.
- 격리(P1): 354회 실행 모두에서 원본과 감시 폴더의 지문이 그대로였다. 바깥을 가리키는 링크의 `rm -rf link/`, 호스트 절대 경로와 `$HOME` 삭제, 상자 안 `rm -rf /tmp/*`도 호스트에 닿지 않았다. 지문이 한 번 달랐는데, 원인은 유령이 아니라 호스트의 `git gc --auto`였다. 제품의 P1 검사도 이런 호스트 쪽 변화를 걸러야 한다.
- 복사: 폴더에 `clonefile(2)`를 한 번 부르면 36ms, `cp -cR`(파일마다 복제)은 778ms. Node에는 폴더 단위 API가 없어서 작은 헬퍼가 필요하다.
- diff: lstat 순회(링크를 따라가지 않음) + 크기·mtime + 복사 시각보다 늦은 ctime만 해시 = 중앙값 88ms. 크기와 mtime을 되돌린 덮어쓰기도 ctime으로 잡았다. `diff -rq`는 심볼릭 링크를 따라가서 위험하다.
- 합계(복사 + 실행 + diff, 5회 중앙값): 0.26~0.42초. 1회용 컨테이너를 미리 띄워 두는 pool 방식은 0.16~0.31초. 파일 19,345개(276MB)에서도 0.7~1.9초.
- 판정 재료: `DROP TABLE users`는 1,206행 손실, `rm -rf ./data ./build`는 515건 삭제, `npm run clean`은 명령 모양이 아니라 diff로 `data/` 64건 삭제가 잡혔다. `npm test`는 변화 없음.
- 함정 1: 네트워크가 없으면 DNS 조회마다 약 5초씩 멈춘다. npm의 업데이트 확인 때문에 `npm test`도 5.2초, `.env` 유출 시도는 10.2초. 상자 안 127.0.0.1에 기록용 가짜 DNS를 두면(`--dns 127.0.0.1`은 `--network none`과 함께 된다) 0.3~0.6초로 줄었다.
- 함정 2: `npm install`은 오프라인에서 끝나지 않아 58초에 강제 종료됐다. 상자에 20~30초 제한을 두고 넘으면 warn으로 돌려야 한다.
- 네트워크 기록: 가짜 DNS 기록기는 호스트 이름, HTTP 본문의 canary, HTTPS의 SNI, 5432 접속 시도를 남겼지만 직접 IP 연결은 놓친다. strace는 직접 IP까지 잡고 0.1~0.8초가 더 든다(`SYS_PTRACE` 불필요). 둘 다 켜도 2초 안쪽이다. `npm test` 같은 평범한 명령도 `registry.npmjs.org`에 접속을 시도하므로 허용 목록에 넣어야 warn이 안 난다.
- 권장안: 폴더 clonefile, pool 방식 1회용 컨테이너(`--cap-drop ALL`, `--read-only`, `--dns 127.0.0.1` 등 강화 옵션으로도 시나리오가 그대로 돌았다), 가짜 DNS 기록기 + 필요하면 strace, ctime 기반 diff, 상자 자체 제한 20~30초. 컨테이너 하나를 계속 공유하는 방식은 실행 사이에 상태가 남고 다른 복사본이 보여서 쓰지 않는다.

### 실험 B: Kiro Pre Tool Use hook (Kiro IDE 1.4.215)

결론: **IDE의 Pre Tool Use hook으로 `rm -rf`를 막을 수 있다.** 다만 처음에는 hook이 조용히 돌지 않았고, 원인은 작업 공간 신뢰 상태였다.

- 만든 것(Kiro가 생성): `.kiro/hooks/exp-b-block-rm-rf.json`(PreToolUse, matcher `shell`), `.kiro/hooks/exp-b-log-write.json`(PreToolUse, matcher `write`), 판정 스크립트 `integrations/kiro-hook/exp-b-gate.mjs`(Node 20, 의존성 없음, STDIN을 `/tmp/ghost-run-exp-b.log`에 기록, 위반이면 stderr + 종료 코드 2). 둘 다 Shell Command 동작이라 hook 실행 자체에는 크레딧이 들지 않는다. 형식은 `{"version": "v1", "hooks": [{name, trigger, matcher, action: {type: "command", command, timeout}, enabled}]}`.
- 결과(07:16, 07:18):

  | 호출 | 도구 | 결과 |
  | --- | --- | --- |
  | `rm -rf tmp-exp-b-nonexistent` | `execute_bash` | 막힘. Kiro가 `GHOST RUN EXP-B: blocked rm -rf (Pre Tool Use hook)`를 받고, 지시대로 재시도하지 않았다 |
  | 파일 덮어쓰기 | `fs_write` | write hook에 기록되고 통과 |
  | hook 파일 수정 | `str_replace` | write hook에 기록되고 통과 |
  | `rm tmp-exp-b.txt`, `pwd` | `execute_bash` | 통과 |
- STDIN 형식(IDE): `{"session_id", "hook_event_name": "PreToolUse", "cwd": <저장소 루트>, "tool_name": "execute_bash" | "fs_write" | ..., "tool_input": {...}}`. 필드 이름이 문서의 CLI 예시와 같다. 셸의 `tool_input`은 `{command, description, cwd, run_in_background, timeout}`, 쓰기는 `{path, text}`.
- 순서: hook이 사용자 승인 창보다 먼저 돈다. 막힌 명령은 승인 창까지 가지 않는다.
- hook 명령의 작업 폴더는 저장소 루트라서 `node integrations/kiro-hook/...` 상대 경로가 동작한다. Kiro가 처음 쓴 절대 경로에는 로컬 사용자 이름이 들어 있어서 상대 경로로 바꾸게 했다.
- 파일 삭제 도구: 이 IDE 에이전트의 도구는 `execute_bash`, `read_file`, `fs_write`, `str_replace`, `web_fetch`, `invoke_sub_agent`, `load_resource`, `tool_call`이다. 파일 삭제 전용 도구가 없어서, 삭제는 셸을 거친다. 셸이 아닌 쓰기(`fs_write`, `str_replace`)는 `write` matcher가 잡는다.
- **함정 1: 창을 연 뒤에 폴더를 신뢰하면 Reload 전까지 hook이 돌지 않는다.** Kiro 에이전트는 시작할 때 `workspace.isTrusted` 값을 한 번 저장하고(`workspaceTrusted`), 이 값이 거짓이면 PreToolUse hook 실행을 건너뛴다(debug 로그 `hooks.v2.executionSuppressedUntrusted`에만 남는다). 01:05에 Restricted Mode로 열고 곧 Trust를 눌렀지만, Reload Window(07:15) 전까지는 hook이 등록만 되고(`hooks.reload.loaded {"read":2,"registered":2}`) 실행되지 않았다.
- **함정 2: 같은 이유로 Reload 전에는 Steering 패널에 Workspace 항목이 없었다.** Reload 뒤에야 Workspace 아래 steering 6개가 보였다. 그래서 그 전의 steering 다듬기, core-contract spec, hook 생성은 작업 공간 steering 없이 진행된 것으로 보인다(Kiro가 requirements에 steering 용어 "box" 대신 "Sandbox"를 쓴 것도 이와 맞는다). 이후 작업부터는 steering이 들어간다.
- 함정 3: Kiro가 만든 hook 파일에는 처음에 `enabled` 필드가 없었고, 패널에는 꺼진 것처럼(기울임꼴, 눈 가림 아이콘) 보였다. 아이콘을 누르면 파일에 `"enabled": true`가 기록된다. 패널 표시는 Reload 전까지 갱신되지 않았다. 꺼진 표시가 기본값 때문인지 신뢰 문제 때문인지는 Reload와 함께 바뀌어서 구분하지 못했다.
- 같은 세션 안에서 만든 hook은 그 세션에 적용되지 않는다(로그: "hooks load at session start"). 새 세션을 열어야 한다.
- 스크립트의 한계: `rm` 뒤의 `-` 토큰 글자를 모두 모아 r과 f가 있으면 막는다. 그래서 `rm build-artifacts-from-ref.txt` 같은 정상 명령도 막을 수 있다. 실험용이라 그대로 두었다. ghost-gate는 기획서대로 명령 모양이 아니라 diff로 판정한다.
- hook 지연 시간은 따로 재지 않았다.
- **CLI 결과 (09:08~09:13).** 사용자가 화면 조작(computer use) 대신 CLI를 원해서 Kiro CLI를 설치했다.
  - 설치: 공식 배포처의 3.4.0 macOS zip(standalone)을 받아 SHA-256을 manifest와 대조하고, zip 안의 설치 스크립트를 읽은 뒤 `KIRO_CLI_NO_MODIFY_PATH=1`로 실행했다. `~/.local/bin/kiro-cli` 하나만 생기고 `/Applications`에는 아무것도 넣지 않았다. 셸 설정 파일은 체크섬으로 확인해 바뀌지 않았다.
  - 로그인: `kiro-cli login --social google`. 사용자가 브라우저에서 로그인했다(IDE와 같은 Google 로그인).
  - 실행: `kiro-cli chat --v3 --no-interactive --trust-workspace --trust-tools=execute_bash --output-format stream-json "<프롬프트>"`. `--trust-workspace`가 없으면 폴더의 hook과 에이전트를 불러오기 전에 신뢰 질문을 하므로, 비대화형에서는 꼭 넣는다.
  - steering: always 문서 5개가 맥락에 들어갔다(fileMatch인 halloween-ui는 빠짐, 의도대로).
  - hook: IDE 형식으로 만든 `.kiro/hooks/*.json`을 CLI도 그대로 읽었다. 종료 코드 2로 `rm -rf`가 막혔고, 에이전트는 "Tool "execute_bash" was intercepted by PreToolUse hooks before execution ... The tool was NOT executed"라는 안내와 우리 stderr를 받고 재시도하지 않았다. 기획서의 "CLI는 종료 코드 2가 차단" 확인.
  - 크레딧: `stream-json` 출력의 `promptTurnSummaries[].usage`에 턴별 사용량이 나온다. 계정 합계는 CLI로 볼 수 없어 웹 계정 대시보드나 IDE에서 확인한다.
  - 모드와 모델: 세션 설정에 모드 `vibe`(Default), `spec`, `quick-spec`, `bug-fix`, `plan`, `autonomous` 등과, 모델 `auto`, `claude-sonnet-4.5`, `claude-haiku-4.5`, `deepseek-3.2`, `qwen3-coder-next` 등이 있다. 비대화형에서는 `/usage` 같은 슬래시 명령이 질문으로 처리되므로, spec 작업은 `--agent spec`처럼 모드로 고른다.
- 실험 hook 두 개는 켜 둔 상태다. Agent Hooks 패널의 눈 아이콘으로 끌 수 있다.
