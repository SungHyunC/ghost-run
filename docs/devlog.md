# Ghost Run+ 개발 기록

하루에 한 줄 이상 쓴다. 크레딧은 Kiro 상태 표시줄의 사용량 표시(누르면 계정 대시보드가 열린다), IDE 채팅 메시지마다 붙는 "Est. Credits Used", Kiro CLI `stream-json` 출력의 턴별 사용량에서 읽는다. 처음에는 무료 플랜 월 50크레딧뿐이라 남은 크레딧이 10 아래로 내려가면 멈추기로 했다. 11/18 오전에 해커톤 크레딧 4,000을 받은 뒤부터는 기획서의 점검선(11/23까지 1,300 이하, 11/30까지 2,900 이하, 12/2까지 3,400 이하)을 따르고, 모델은 Auto를 기본으로 쓴다. 11/18 오후 사용자 결정으로 날짜별 점검선 대신 "언제나 1,000 이상 남긴다"(쓸 수 있는 양 약 3,050)를 따른다.

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
| 11:18 | possession 구현 2차: 작업 4~9 (Node 어댑터, 속성 테스트 22개), 20분 | | 61.16 | |
| 11:18 | ui-kit requirements 수정(놀이터 모드) + design.md, 23분 | | 27.30 | 누계 약 465 / 4,050 |
| 11:35 | possession 구현 3차: 작업 10~13 (예시·Node 전용·저장소 위생 시험, README) + 약한 속성 테스트 보강, 16분 | | 37.19 | 누계 약 502 / 4,050 |
| 11:46 | ghost-runner 구현 5차: 작업 12~13 (Repo_World, 실행 파이프라인 runPlan, 비밀값 상한, 유출 방지 시험), 28분 | | 65.11 | 누계 약 567 / 4,050 |
| 11:53 | ui-kit 결정 반영 + tasks.md (작업 15개, 세부 72개, 실행 묶음 17개), 17분 | | 36.80 | 누계 약 604 / 4,050 |
| 12:09 | wards 구현 1차: 작업 1~3 (wards-config 뼈대, core 판정 모듈 `core/src/judge/`: 경로 정규화, glob, 호스트, canary, 내용 검사, 메시지), 19분 | | 41.90 | 누계 약 646 / 4,050 |
| 12:15 | ghost-shell requirements (요구사항 20개, 성질 GS-P1~GS-P6), 6분 | | 8.20 | 누계 약 654 / 4,050 |
| 12:32 | ghost-shell 결정 반영 + design.md (성질 26개), 16분 | | 24.08 | 누계 약 678 / 4,050 |
| 12:40 | ghost-shell 결정 반영 + tasks.md (작업 18개, 실행 묶음 19개), 8분 | | 15.32 | 누계 약 693 / 4,050 |
| 12:48 | kiro-integration requirements (요구사항 23개: ghost-gate, ghost-log, contract-pbt, world-scaffold, blacklight-steering, MCP 서버, power), 7분 | | 11.00 | 누계 약 704 / 4,050 |
| 12:53 | ghost-runner 구현 6차(PBT가 찾은 `${` 버그 수정, 시험 간섭 수정, 작업 14의 Docker 시험)가 Claude Code 쪽 실행 한도 60분에 걸려 끊김. 같은 세션을 이어서 다시 시작 | | 턴이 끝나기 전에 끊겨 표시 없음 | |
| 13:05 | kiro-integration 결정 반영 + design.md (성질 21개), 16분 | | 31.76 | 누계 약 736 / 4,050 (6차 첫 턴 제외) |
| 13:19 | kiro-integration 정정 + tasks.md (작업 20개, 실행 묶음 20개), 13분 | | 26.14 | |
| 13:20 | 실험 B hook 두 개 끄기(`enabled: false`), Kiro CLI vibe 모드, 28초 | | 0.58 | 누계 약 763 / 4,050 (6차 첫 턴 제외) |
| 13:40 | ghost-hand requirements (요구사항 20개, 성질 GH-P1~GH-P8), 9분 | | 14.33 | 누계 약 778 / 4,050 (6차 첫 턴 제외) |
| 13:55 | ui-kit 구현 1차: 작업 1~5 (패키지 뼈대, 색 토큰과 대비 검사, view-model 전부), 35분 | | 81.67 | 누계 약 860 / 4,050 (6차 첫 턴 제외) |
| 13:59 | ghost-hand 결정 반영 + design.md (성질 23개), 16분 | | 24.63 | 누계 약 885 / 4,050 (6차 첫 턴 제외) |
| 14:14 | ghost-hand 결정 반영 + tasks.md (작업 21개, 실행 묶음 25개), 14분 | | 26.46 | 누계 약 911 / 4,050 (6차 첫 턴 제외) |
| 14:18 | ui-kit 구현 2차: 작업 6~7 (React 컴포넌트, SVG, 스타일, 해당 없음 표시), 21분 | | 51.34 | |
| 14:21 | ghost-runner 구현 6차 이어서: 누수 원인 수정, 좀비, P20 실행 시간, 전체 시험 3회 | | 23.31 | 누계 약 986 / 4,050 (6차 첫 턴 제외) |
| 14:27 | ghost-hand 구현 1차: 작업 1~4 (MuJoCo API 탐침, steering S1~S4, 패키지 뼈대), 12분 | | 24.41 | 누계 약 1,010 / 4,050 (6차 첫 턴 제외) |
| 14:40 | ghost-hand 구현 2차: 작업 3.3~3.4, 5~6 (순수 세계 로직, 계획·변형 형식, 선행 조건 탐침), 12분 | | 38.47 | 누계 약 1,049 / 4,050 (6차 첫 턴 제외) |
| 15:25 | ui-kit 구현 3차: 작업 8 (정적·DOM 컴포넌트 시험), 44분 | | 79.85 | 누계 약 1,129 / 4,050 (6차 첫 턴 제외) |
| 15:32 | wards 구현 2차: 작업 4~5 (판정 엔진 통합, physics 하드 실패, 이유별 메시지 문구), 70분 | | 66.47 | 누계 약 1,195 / 4,050 (6차 첫 턴 제외) |
| 15:37 | core 작은 수정: `verifyWorld`의 `stateEquals` 선택 인자(core-contract 작업 15), `unsupported-step` 알림 종류(ghost-shell 1.1), 4분 | | 6.68 | 누계 약 1,202 / 4,050 (6차 첫 턴 제외) |
| 15:54 | wards 구현 3차: 작업 6~7 (wards-config 해석기·출력기, `safe_commands`, 브라우저용 진입점), 16분 | | 38.61 | 누계 약 1,241 / 4,050 (6차 첫 턴 제외) |
| 16:02 | ghost-hand 구현 3차: 작업 7~8 (MuJoCo 엔진 계층, 제어기, 세계 계약, 파이프라인, 겹치기 모델), 35분 | | 95.18 | 누계 약 1,336 / 4,050 (6차 첫 턴 제외) |
| 16:05 | wards 구현 4차: 작업 8~11 (기본 wards.yaml, 시나리오 확인, 유출·결정성·오류 줄 성질, README), 10분. wards spec 완료 | | 26.94 | 누계 약 1,363 / 4,050 (6차 첫 턴 제외) |
| 16:15 | ghost-shell 구현 1차: 작업 2~5 (사전 확인, 세계 상태, 가상 파일 시스템, diff, SQL 실행기와 감시), 12분 | | 34.60 | |
| 16:16 | kiro-integration 구현 1차: 탐침 hook, hook 패키지 뼈대, 실험 hook 정리 확인, 9분 | | 24.28 | |
| 16:20 | CLI 탐침(작업 1.5): Claude Code가 Kiro CLI로 메시지 (a)~(g)와 삭제 도구 확인을 보냄 | | 1.33 | 누계 약 1,424 / 4,050 (6차 첫 턴 제외) |
| 16:36 | kiro-integration 구현 2차: 탐침 결과 기록, 작업 4~5 (gate 설정, hook 입출력, 기록 저장소, 입력 분류, 안전 목록, 자기 보호), 14분 | | 46.15 | 누계 약 1,470 / 4,050 (6차 첫 턴 제외) |
| 16:57 | ghost-shell 구현 2차: 작업 6~8 (셸 해석기와 명령 15종, 놀이터 세계, 계약 시험), 37분 | | 70.26 | 누계 약 1,540 / 4,050 (6차 첫 턴 제외) |
| 17:12 | ghost-shell 구현 3차: 작업 9~11 (화면 키트 연결, runPlayground 파이프라인, 다섯 시나리오), 15분 | | 40.27 | 누계 약 1,580 / 4,050 (6차 첫 턴 제외) |
| 17:19 | ghost-runner 구현 7차 앞부분: 호출자 runId, 죽은 소유자의 상자 치우기, 내용 기반 verifyWorld, 문서(작업 16, 18.1~18.5), 28분 | | 27.21 | 누계 약 1,607 / 4,050 (6차 첫 턴 제외) |
| 17:36 | ghost-shell 구현 4차: 작업 12~15 (계획 파일, 결계 편집기, 묘지, 화면, 정적 빌드), 24분 | | 57.14 | |
| 17:37 | kiro-integration 구현 3차: 작업 6~7 (gate 판정과 출력: 동시 실행 제한, 50초 감시, 셸·쓰기 판정, B안, 묘지 기록), 18분 | | 47.94 | 누계 약 1,712 / 4,050 (6차 첫 턴 제외) |
| 18:49 | ghost-runner 구현 7차 마무리: `pipelineDeadlineSec`, 라벨 상수, 측정(작업 15), 마지막 체크포인트. 다른 세션 없이 혼자 돌림, 68분. ghost-runner spec 완료 | | 19.28 | 누계 약 1,731 / 4,050 (6차 첫 턴 제외) |
| 19:12 | kiro-integration 구현 4차: 작업 8~9 (gate 조립, 부트스트랩, `ghost-gate.json`(꺼짐), 프로세스 시험), 23분 | | 56.75 | 누계 약 1,788 / 4,050 (6차 첫 턴 제외) |
| 19:30 | ghost-hand 구현 4차: 작업 9~11 (변형 실행기, 3D 겹치기 렌더러, 실행 파이프라인, 데모 계획과 장면 조정), 19분 | | 42.15 | 누계 약 1,830 / 4,050 (6차 첫 턴 제외) |
| 19:35 | ui-kit 구현 4차: 작업 9~12, 14~15 (갤러리와 정적 호스팅 검사, 위생, 문서, 블랙라이트 공개 방식, 연기·버튼 스타일), 47분. 작업 13.1(core lint 금지)만 남음 | | 60.62 | 누계 약 1,891 / 4,050 (6차 첫 턴 제외) |
| 19:55 | kiro-integration 구현 5차: 작업 10~13 (ghost-log, contract-pbt, world-scaffold, blacklight-steering hook), 25분 | | 64.39 | |
| 19:56 | ghost-shell 구현 5차: 작업 16~18 + 화면 다듬기(두 열 배치 등), 21분. ghost-shell spec 완료 | | 25.85 | 누계 약 1,981 / 4,050 (6차 첫 턴 제외) |
| 20:15 | ghost-hand 구현 5차: 작업 12~13 (엔진 속성 시험, 결정성 해시, verifyWorld 등록 관문), 19분 | | 42.92 | 누계 약 2,024 / 4,050 (6차 첫 턴 제외) |
| 20:20 | kiro-integration 구현 6차: 작업 14~15 (MCP 서버 ghost-run, Kiro power), 날짜 바로잡기, 43분 | | 50.40 | 누계 약 2,074 / 4,050 (6차 첫 턴 제외) |
| 20:44 | 여러 spec에 걸친 작은 수정: ghost-runner 상자 폴더 지정(`boxDir`), power 번들이 상자에서 돌게, 패키지 간 import 금지(ui-kit 13.1, kiro-integration 2.2 일부), 24분. ui-kit spec 완료 | | 25.76 | 누계 약 2,100 / 4,050 (6차 첫 턴 제외) |
| 20:56 | ghost-hand 구현 6차: 작업 14~16 (화면과 3D 겹치기, `ghost-hand-run` 명령줄, 빌드와 제3자 고지), 41분 | | 74.00 | 누계 약 2,174 / 4,050 (6차 첫 턴 제외) |
| 21:05 | kiro-integration 구현 7차: 작업 16, 18 (위생 시험, hook 시간 측정, 문서) + `_new-world` spec 양식, 45분 | | 37.58 | 누계 약 2,212 / 4,050 (6차 첫 턴 제외) |
| 21:12 | world-smith: 새 세계를 만드는 커스텀 에이전트(spec, `.kiro/agents/world-smith.json`, 형식 시험), 7분 | | 7.55 | 누계 약 2,220 / 4,050 (6차 첫 턴 제외) |
| 21:23 | ghost-hand 구현 7차: 작업 17~20 (Chrome 측정 하네스, 주장 범위와 고지, 패키지 간 import 금지, 마지막 점검), 25분. ghost-hand spec 완료(선택 작업 21.1 제외) | | 40.91 | 누계 약 2,261 / 4,050 (6차 첫 턴 제외) |
| 21:33 | ghost-hand 계획 고치기 녹화(design D18): Kiro가 차단 메시지를 읽고 고칠 값을 직접 정함, 다섯 번째 시도에 통과, 6분 | | 3.85 | 누계 약 2,265 / 4,050 (6차 첫 턴 제외) |
| 21:37 | 같은 세션 이어서: 고친 계획 이름을 `slow pull, gentle grip`으로 바꾸고(그립을 낮춘 값과 맞춤) README 수치를 녹화본 값으로, 3분 | | 1.37 | 누계 약 2,266 / 4,050 (6차 첫 턴 제외) |
| 22:03 | 남은 수정 회차(F1): playground nightly 메모리 부족, 패키지 사이 Docker 시험 충돌, 위생 검사 범위에 `.kiro/agents` 추가, 50분(nightly 19분 포함) | | 9.82 | 누계 약 2,276 / 4,050 (6차 첫 턴 제외) |

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
- possession 구현 2차(11:18): 파일 읽기 어댑터 `core/possession-node.ts`와 속성 테스트 22개(`core/tests/possession/prop-01`~`prop-22`). 모두 100회씩 통과했고 반례는 없었다. Claude Code 확인: core typecheck 네 가지, lint, build 통과, 테스트 30개 파일 106개 통과, ghost-runner typecheck 통과. Kiro가 스스로 밝힌 약한 곳 세 가지(속성 19에서 `findings` 결과가 100번 중 2~7번뿐, 속성 9의 한 갈래에 카운터 없음, 속성 18이 `/` 경로만 생성)는 3차 지시에 넣어 보강하게 했다. 이번에는 하위 에이전트를 한 번에 3개 이하로 돌리게 해서 429가 한 번도 없었다.
- possession 구현 3차(11:35): possession spec 13개 작업이 모두 끝났다. 예시 시험, Node 전용 시험(이모지 표 검증, 순수성, ESLint 규칙, 내장 객체만 있는 `node:vm` 영역, 파일 어댑터, 생성기, 저장소 위생), 루트 `README.md`의 possession 절. 지시한 보강: 속성 19는 결과 세 가지가 각각 1/3씩(기본 102번 중 34번씩), 속성 9의 "정리하면 새 발견이 생기는" 갈래는 100번 중 47번, 속성 18은 백슬래시와 섞인 경로까지 생성한다. 세 속성은 nightly 10,000번도 통과했다. 보강 중에 속성 21의 생성기가 취소 태그(U+E007F)를 드물게 만들어 약 25번에 1번꼴로 비공허성 검사에 실패하던 것도 찾아 고쳤다(구현 버그 아님). 저장소 위생 시험은 Kiro가 쓴 시험 두 개에 HTML 주석 여는 글자가 그대로 들어간 것을 바로 잡아냈다.
- Claude Code 확인: core typecheck 네 단계, lint, build 통과, 테스트 51개 파일 305개 통과(6초), 새 파일에 ASCII 밖 바이트 없음, core/src에 빌드 찌꺼기 없음. Kiro가 알린 문제 하나: `pnpm -r build`가 ghost-runner에서 TS6059(core/src가 rootDir 밖)로 실패하고, 그때 core/src 옆에 `.js`·`.d.ts`가 생긴다. ghost-runner의 빌드 설정이 core를 소스 경로로 끌어오기 때문으로 보이며, ghost-runner 작업 12.6(패키지 빌드)과 함께 확인한다.
- 이 세션에서도 실험 hook이 Kiro의 파일 삭제를 막아서 Kiro가 `/tmp`에 임시 파일 두 개를 남겼다. Claude Code가 내용을 확인하고 지웠다.
- wards tasks.md(10:34): `wards.yaml` 해석 패키지는 `integrations/`가 아니라 저장소 바로 아래 `wards-config/`에 둔다. core에는 `case_sensitive` 선택 필드와 알림 종류 두 개만 더한다. possession과 wards 구현은 둘 다 `core/eslint.config.mjs`와 `core/src`를 고치므로 동시에 돌리지 않는다. wards의 PBT 작업은 선택(`*`)으로 표시됐으니 구현할 때 선택 작업까지 모두 하라고 지시한다.
- wards 구현 1차(12:09): `wards-config/` 패키지 뼈대(아직 `yaml` 없음), core의 순수 판정 모듈 `core/src/judge/`(경로 정규화, 정해진 문법의 glob, 호스트·포트 일치, canary 추출과 인코딩별 내용 검사, 고정 문구 메시지). 성질 P2·P3·P4(호스트)·P10·P11·P14를 100회씩, nightly 10,000회도 반례 없이 통과했다. 테스트 쪽 실수 두 가지(포트 없는 허용 항목의 의미, 64 KiB 경계값)는 spec을 읽고 테스트를 고쳤다. Claude Code가 spec을 확인했는데 "포트 없는 항목은 어느 포트든 허용"이 요구사항 그대로다. Claude Code 확인: core 테스트 60개 파일 403개 통과(기존 305개 그대로), wards-config typecheck·lint·테스트 통과, ghost-runner typecheck 통과, 숨은 글자 0. Kiro가 hook에 막혀 남긴 임시 파일(`wards-config/src/tmp-judge-import-check.ts`와 그 빌드 결과)은 Claude Code가 내용을 보고 지웠다. possession의 `sanitizeText`와 이름이 겹친 판정용 함수는 `sanitizeJudgeText`로 내보냈다.
- wards 구현 2차(15:32): core의 판정 엔진에 경로·SQL 판정(glob과 정규화 키), egress 판정(호스트 일치, 행동 기준, 인코딩별 내용 검사), 유출 방지, 세밀해진 `isMoreRestrictive`를 넣었다(성질 P4·P5·P6). 다른 spec의 선행 조건 두 가지도 들어갔다: physics 결계는 관절 한계·자기 충돌이 한 변형에서라도 나오면 성공률과 무관하게 block, 메시지 생성기는 낮춘 주장 문구를 이유별로 나누고 claims가 없으면 붙이지 않는다. **성능 시험이 찾은 결함:** canary 256개일 때 유출 방지 판정이 16~26초 걸렸다(한도 3초). 바늘을 한 번만 만들도록 고쳐 약 0.23초가 됐다. 시험 데이터의 사설 IP는 문서용 범위(192.0.2.10)로 바꿨다. Claude Code 확인: core 70개 파일 536개 통과(1개는 nightly 전용 성능 시험이라 건너뜀), wards-config·ghost-runner·ui 이상 없음. Kiro는 ghost-runner 전체 시험(53개 파일 258개)도 다시 돌려 엔진 변경이 그쪽을 깨지 않음을 확인했다.
- core 작은 수정(15:37): 계약 PBT의 복원 검사(P3)가 상태를 비교하는 함수를 세계가 넘길 수 있게 했다(기본은 지금처럼 필드별 비교). ghost-runner의 Repo_World처럼 단계마다 복사본 경로와 시각이 달라지는 세계는 내용 지문으로 비교하면 된다. "diff가 비면 같다"를 기본으로 삼는 안은 diff에 버그가 있으면 P3까지 약해져서 버렸다(diff의 정확성은 P2가 따로 본다). ghost-shell이 기다리던 `unsupported-step` 알림 종류도 core에 더했다. core 71개 파일 542개 통과.
- wards 구현 3차(15:54): `wards.yaml`을 줄 번호가 붙은 오류와 함께 해석하고 다시 출력하는 `wards-config`(yaml 2.9.1, ISC, 9월 게시라 설치 대기 없음). 출력→해석 왕복 성질(Property 17)이 nightly 10,000회까지 통과했다. ghost-gate의 안전 목록을 늘리는 최상위 키 `safe_commands`를 더했다(core의 WardSet은 그대로). 기본 진입점은 Node 내장 모듈을 쓰지 않아 놀이터 브라우저에서 돈다(Claude Code가 기본 진입점의 내보내기가 `parseWards`·`printWards`·`formatConfigError` 셋뿐임을 확인). 파일 읽기는 `@ghost-run/wards-config/node`로 나눴다. ui의 개발 의존성 axe-core(MPL-2.0)는 허용 라이선스 목록 밖이라 README에 개발 전용 예외로 적었다.
- wards 구현 4차(16:05): wards spec 11개 작업이 모두 끝났다. 기본 `apps/ghost-shell/wards.yaml`(결계 `protect-data`, `no-data-loss`, `no-secret-egress`와 안전 목록 `ls`, `pwd`, `cat`, `git status`, `git diff`). **PBT가 찾은 네 번째 제품 버그:** 성질 13(판정 결정성)이 같은 보호 경로를 두 철자(`data/a.txt`, `DATA/A.TXT`)로 지울 때 차단 사유에 먼저 나온 철자가 찍혀, 변경 목록 순서에 따라 메시지가 달라지는 것을 찾았다. 코드 포인트 순으로 가장 작은 철자를 쓰게 고쳤다. core 73개 파일 549개, wards-config 122개 통과(Claude Code 확인).
- ui-kit requirements(10:43): `ui/`(@ghost-run/ui)는 core·possession·wards가 낸 값을 그리기만 한다. 화면 성질은 안전 계약 P1~P8과 섞이지 않게 UI-P1~UI-P11로 따로 붙였다(Change마다 거울 행 하나, 판정마다 촛불 상태 하나, 렌더 결과에 숨은 글자·canary 없음, 두 테마 대비, B안에서는 격리 문구를 띄우지 않음 등). 검토에서 하나를 고치게 했다: 격리 주장 표시에 docker-box와 static-analysis만 있어서 놀이터에서는 "Isolation status unknown"이 뜬다. 기획서대로 놀이터에서도 P1을 주장하므로 playground 모드를 더한다. 가족 이모지 안의 U+200D까지 모두 `<U+200D>`로 보이게 한 보수적 선택(A6)은 그대로 둔다.
- 화면 의존성은 Claude Code가 npm에서 버전·라이선스·Node 요구 사항을 확인해 design 지시에 넣었다. 이 저장소는 Node 20.20.2라서 vite 8은 되지만 vitest 5와 jsdom 27 이상은 Node 22가 필요해 쓸 수 없다. vitest 3.2.7이 vite 7까지만 받으므로 vite 7.3.8로 맞춘다. axe-core는 MPL-2.0이라 쓰면 개발 의존성으로만 쓴다.
- ui-kit design(11:18): jsdom 26으로 DOM 시험, 색 토큰 두 벌과 대비표, 시스템 글꼴만, 아이콘·불꽃·연기·비석은 코드로 그린 SVG(십자 모양 없음). Kiro가 결정을 물은 세 가지는 이렇게 정했다. (1) "Not claimed" 배너는 P1·P5·P6 중 하나라도 주장되지 않으면 확인 문구와 함께라도 뜬다. (2) 숨은 글자 발견 목록도 처음에 그리는 개수에 상한을 두고 "더 보기"로 편다. (3) 알 수 없는 Change와 Scene의 필드 중 키 이름이 비밀처럼 보이는 값(token, password 등)은 가려서 보이고, 휴리스틱이라고 문서에 밝힌다.
- design 검토 중 Claude Code가 npm에서 확인한 것: core가 쓰는 ESLint 10을 eslint-plugin-react 7.37.5와 eslint-plugin-jsx-a11y 6.10.2는 peer 범위에 넣지 않았다(각각 ^9.7, ^9까지). 그래서 `dangerouslySetInnerHTML` 금지는 ESLint 10을 받는 @eslint-react/eslint-plugin 5.30.4(MIT)로 바꾸고, 접근성은 jsx-a11y 대신 axe-core DOM 시험으로 확인하게 했다.
- ui-kit tasks.md(11:53): 색 토큰을 만든 직후 대비 성질 UI-P6부터 돌리고(손으로 계산한 대비값이라서), core ESLint에 ui 금지를 더하는 작업은 possession·wards의 core 변경이 끝난 뒤에만 하도록 따로 떼었다. Kiro가 확인하지 못한 @eslint-react 규칙 이름은 Claude Code가 패키지를 받아 확인했다(`@eslint-react/dom-no-dangerously-set-innerhtml`, 슬래시가 아니라 하이픈).
- ghost-shell requirements(12:15): 놀이터는 메모리 파일 시스템과 sql.js로 만든 가상 프로젝트에서 셸 부분집합을 결정적으로 흉내 낸다. 흉내 내지 못하는 명령(파이프, `$(...)`, glob 문자, 모르는 옵션 등)은 조용히 통과시키지 않고 `unsupported`로 표시해 판정을 최소 warn으로 올리고 그 실행에서는 P5·P6을 주장하지 않는다. 실제 모드와 같은 판정 엔진과 결계 파일 하나(`apps/ghost-shell/wards.yaml`)를 쓴다. Kiro가 남긴 미결 사항은 이렇게 정했다: 세계는 `worlds/playground-shell/`, 관찰 사건 기록은 스냅숏 상태 밖(세계가 snapshot id별로 보관)에 둬서 "상태가 다르면 diff가 비지 않는다"는 계약과 맞춘다, wards-config의 기본 진입점은 브라우저에서 돌게 하고 파일 읽기만 하위 경로로 나눈다(`yaml` 2.9.1이 브라우저 빌드를 갖춘 것을 npm에서 확인), 지원하지 않는 단계 알림은 core의 `WardNotice.kind`에 `unsupported-step`을 더한다.
- ghost-shell design(12:32): 셸 해석기는 직접 만든 토크나이저·파서, SQL은 sql.js 1.16.0(wasm은 같은 출처로 내보내고 CDN 없음), SQL 감시 5초는 시험에서 가짜 타이머로 결정적으로 확인, 시나리오 데이터(users 1,206행, README의 숨은 지시)는 코드에서 코드 포인트로 만든다. 놀이터 정적 호스팅에는 COOP/COEP가 필요 없고 엄격한 CSP와 dist 외부 URL 검사를 둔다. 계약 P2 시험은 "기록으로 계산한 변화와 diff가 같다"는 뜻이지 실제 셸과 같다는 뜻이 아니라는 점을 README에 적게 했다. 다른 spec에 넘길 것 두 가지: ui-kit은 알림 종류를 core 타입 그대로 받고 표시 함수 두 개를 공개한다, wards의 시나리오 시험은 위반 개수를 하드코딩하지 않는다(놀이터는 폴더 항목 삭제도 Change로 낸다).
- ghost-shell tasks.md(12:40): 첫 작업은 core에 `unsupported-step` 알림 종류를 더하는 것으로, core를 고치는 다른 작업과 겹치지 않게 혼자 둔다. 셸·웹 도구 없이 쓴 설계라 sql.js·Vite wasm 빌드·`verifyWorld` 실행 시간 같은 가정은 앞쪽 작업에서 실제로 돌려 확인하게 했다. 9번 묶음부터는 ui-kit 구현(알림 종류를 넓히고 표시 함수 두 개를 공개)이 끝나 있어야 하며, 없으면 멈추고 보고한다.
- kiro-integration requirements(12:48): ghost-gate는 예외·시간 초과·설정 누락 때 막는 쪽(종료 코드 2)으로 가고, 60초 한도 앞에 50초 내부 감시를 둔다. 통과시키는 쪽이면 에이전트가 gate를 일부러 죽여 우회할 수 있어서다. warn은 사람 승인 경로가 생기기 전까지 막는다. 에이전트가 자기 gate를 고치지 못하게 `.kiro/hooks/**`, gate 코드, 결계 파일, 기록 폴더를 고치는 명령은 최소 warn이다. world-smith 에이전트는 별도 작은 spec으로 뺐다.
- design 지시를 쓰려고 실험 B hook 로그(1,200여 줄)에서 실제 hook 입력을 뽑았다. IDE 1.4.215와 CLI 3.4.0의 Pre Tool Use 입력은 같은 모양이고, `shell` 매처에는 `execute_bash`(`command`, `cwd`, `timeout` 등), `write` 매처에는 `fs_write`·`str_replace`·`fs_append`·`delete_file`(`targetFile`)·`code`(심볼 이름 바꾸기 등) 다섯 도구가 걸렸다. 쓰기 도구는 이름이 아니라 대상 경로 필드 세 가지(`path`, `targetFile`, `file_path`)를 모두 읽어 판정하게 했다. 파일 생성 이벤트의 정확한 이름 등 문서로 확인되지 않는 것은 구현 첫 작업에서 탐침 hook으로 확인한다.
- kiro-integration design(13:05): ghost-gate는 종료 코드 0과 2만 쓴다. Kiro CLI는 2가 아닌 실패 코드(예: 빌드가 없어 1로 죽음)를 통과로 다루므로, 동적 import 실패까지 잡아 2로 끝낸다. warn의 사람 승인은 Pre Tool Use 출력의 `ask`를 목표로 하되, IDE와 CLI 모두에서 승인 창이 뜨는지 탐침으로 확인하기 전까지는 막는다(`exit2`). 사람이 돌리는 승인 명령은 에이전트가 같은 OS 권한으로 위조할 수 있어서 뺐다. 세계 등록은 core를 바꾸지 않고 `worlds/<name>/world.config.ts`로 한다. 다른 spec에 넘길 것: wards-config의 `safeCommands`(wards 3차), ghost-runner의 `runId` 선택 인자(ghost-runner 7차), 위반 없는 warn 메시지 시험(wards 2차). 모두 해당 지시에 넣었다.
- kiro-integration tasks.md(13:19): 첫 작업은 탐침 hook이다(파일 생성 이벤트 이름, Post Tool Use 응답 필드, 막힌 호출에서 Post Tool Use가 나는지, `ask` 출력이 승인 창을 띄우는지). IDE와 CLI 확인은 사람이 하는 작업으로 단계를 적었다. ghost-gate 파일은 처음에 꺼진 채로 만들고, 우리 개발에 켜는 일(11/22 목표)은 전체 시험·안전 목록·승인 경로·실패 시 막기를 확인하는 체크포인트 작업으로 따로 뒀다.
- ghost-shell 구현 1차(16:15): 설계에서 확인하지 못했던 가정을 먼저 돌려 봤다. 빈 sql.js DB를 내보내면 0바이트가 아니라 4,096바이트여서, 파일은 실행기가 "썼다"고 알릴 때만 만들도록 design을 고친 뒤 구현했다. `worlds/playground-shell`(관찰 기록은 스냅숏 상태 밖, 가상 경로, 파일 시스템, diff, 장면, 지문, sql.js 실행기와 5초 워커 감시)과 `apps/ghost-shell` 뼈대. 89개와 17개 시험 통과(Claude Code 확인).
- ghost-shell 구현 2차(16:57): 토크나이저·파서와 해석기, 명령 15종(`rm`, `mv`, `cp`, `find`, `sqlite3`, `curl`, `npm` 등. `npm run`은 package.json 스크립트를 같은 해석기로 펼친다), 놀이터 세계. 계약 PBT(verifyWorld의 P1·P2·P3, 각 100회)가 기본 비교로 통과하고 저장 시 약 14초(예산 60초). Node 워커용으로 따로 쓴 SQL 처리기가 TypeScript 판과 같은 응답을 내는지 보는 동등성 시험(10,000회)도 들어갔다. 397개와 17개 시험 통과(Claude Code 확인).
- ghost-shell 구현 3차(17:12): **다섯 시나리오가 기획서 기대대로 판정된다.** 기본 wards.yaml로 시나리오 1(DROP TABLE users)은 `no-data-loss`로 block(1,206행), 2(`rm -rf ./data ./build`)와 5(`npm run clean`)는 `protect-data`로 block, 3(`.env`를 읽고 `setup-check.example`로 보내기)은 `no-secret-egress`로 block(행동 기준과 내용 기준 둘 다), 4(`npm test`)는 pass. 고친 계획(1: 백업 뒤 soft delete, 2: `rm -rf ./build`)은 pass. 시나리오 하나는 약 2ms, 명령 50개 계획은 31~47ms. 단계 출력에 canary가 실리면(`cat .env`) 실행 결과에서 `[redacted]`로 가리는 처리를 더했다.
- ghost-shell 구현 4차(17:36): 계획 파일 해석기·출력기, 직접 입력 검증, 결계 편집기(줄 번호 오류, 고치면 같은 시나리오를 다시 돌림), 묘지, 화면 구성, 정적 빌드(sql.js wasm을 같은 출처로 내보냄, 외부 URL 없음 검사 통과, dist 1.2MB). 170개 시험 통과.
- **놀이터를 실제 브라우저로 확인(17:40):** Claude Code가 빌드한 놀이터를 `vite preview`로 띄우고 headless Chrome과 DevTools 프로토콜로 시나리오 1을 눌러 화면을 찍었다. 촛불 BLOCK, "no-data-loss: would delete 1,206 rows from users", 거울 세계의 users 1,206행→0행과 "would be removed", 에이전트가 받는 메시지("Try a soft delete or a migration with a backup."), 묘지 비석 하나, "Ghost ran on an in-memory copy in this browser (P1 claimed)."까지 브라우저에서 동작한다. 처음 찍은 화면에는 "The SQL engine failed to start"가 떴는데, 내가 쓴 `--virtual-time-budget`이 타이머를 빨리 감아 워커가 뜨기 전에 시작 대기 시간이 끝난 탓이었다(실제 시간으로 열면 워커가 붙고 오류 없음). 다듬을 곳: 기본 브라우저 버튼 모양, 거울 행 위의 큰 연기 원, 같은 문장이 두 번 나옴, 실행 전에도 "NOT claimed" 배너가 보임, 블랙라이트를 켜기 전에 숨은 지시가 풀려 보임(ui-kit 4차 지시에 이미 넣음).
- kiro-integration 구현 3차(17:37): gate의 판정 부분. 작업 공간당 동시 실행 제한, 50초 감시 타이머(멈춘 상자를 호출자 run id로 정리), 셸 명령은 ghost-runner의 `runPlan`으로, 쓰기 도구는 결계로 판정(가장 엄격한 대상 우선), 종료 코드 0과 2만 쓰는 판정 대응, diff 요약, B안 공개, 묘지 기록. 390개 시험 통과. 안전 목록의 숨은 글자 판정은 사본 표 대신 core의 `scanText`를 쓰게 했다. 남은 틈: `runPlan`의 마감이 55초로 고정이라 gate의 44초 예산이 적용되지 않는다(시험은 `it.fails`로 표시). ghost-runner 마지막 회차에 마감 인자를 넣게 했다.
- kiro-integration 구현 4차(19:12): gate가 조립됐다. 부트스트랩(`ghost-gate.mjs`)은 동적 import 실패까지 잡아 종료 코드 0과 2만 쓰고, `.kiro/hooks/ghost-gate.json`은 shell·write 항목 두 개에 항목 수준 timeout 60초로 만들되 꺼 두었다(우리 개발에 켜는 일은 작업 19.1). 실제 gate 프로세스에 표본 입력을 넣은 결과: 셸 `rm -rf data`는 0.6초 만에 종료 코드 2와 "GHOST RUN BLOCKED by ward protect-data", `ls`는 안전 목록이라 0.09초에 통과, 쓰기 도구로 `.env` 덮어쓰기와 알 수 없는 도구는 막힘. 진짜 `data/`와 `.env`는 그대로. 다음에 고칠 것: 쓰기 판정 메시지에 "P5·P6을 보장하지 않는다(정적 분석)" 줄이 붙는 문제, Docker가 없을 때 경고 문구("0 notice(s)... First: (none)")가 어색한 문제.
- kiro-integration 구현 5차(19:55): hook 넷을 만들고 모두 꺼 두었다. ghost-log(에이전트가 읽은 글을 출처 기록으로, canary는 가림), contract-pbt(저장한 파일에 맞는 세계의 계약 PBT를 돌리고 결과를 `.ghost-run/pbt/last.json`에 남김. CLI에서 파일 이벤트 hook의 출력이 에이전트에게 가지 않기 때문), world-scaffold(새 `worlds/<이름>/` 폴더에 등록·시험·문서 뼈대, 다시 돌려도 중복 없음), blacklight-steering(`.kiro/**` 저장 시 숨은 글자 검사). 표본 실행: contract-pbt는 drawer-arm 파일 저장에 7.8초, core 파일 저장에 28.5초(첫 실행 39.4초)로 60초 안. 4차에서 넘어온 쓰기 판정 문구와 Docker 없음 경고도 고쳤다. 561개 시험 통과(Claude Code 확인).
- kiro-integration 구현 6차(20:20): MCP 서버 `@ghost-run/mcp`(도구 `ghost_run`, `ghost_diff`, `ghost_trace`, `wards_check`, `blacklight`)와 Kiro power(`integrations/power`: Agent Plugins 형식 plugin.json, `skills/ghost-run/SKILL.md`, mcp.json, 단일 파일 서버 번들). 실제 서버를 띄워 확인한 응답: 도구 목록 다섯 개, `wards_check`는 "정적 검사이고 상자를 띄우지 않았다"를 먼저 밝히고 `rm -rf data`를 safe=false로 표시, `blacklight`는 영폭 공백을 `U+200B`로 보고. power를 설치하면 조언용 도구와 스킬만 들어가고 막는 gate는 들어가지 않는다는 점도 README에 적었다. 남은 틈: 번들 위치에서는 ghost-runner가 상자 폴더를 못 찾아 `ghost_run`이 B안으로 떨어진다. 다음 회차에서 상자 폴더 지정 옵션으로 고친다. 앞 회차들이 문서에 적은 잘못된 날짜(11/19, 11/20)도 이번에 11/18로 바로잡았다.
- 작은 수정 회차(20:44): ghost-runner가 상자 폴더를 `boxDir` 인자, `GHOST_RUN_BOX_DIR`, 모듈 위치, 작업 공간 순서로 찾게 했다. 다시 만든 power 번들을 저장소 루트에서 띄워 `ls` 계획을 보내자 `docker-box`로 돌아 pass, P1·P5·P6 모두 주장(이전에는 늘 B안). 번들에 로컬 경로와 사용자 이름이 없는지 보는 시험도 생겼다. core는 `@ghost-run/ui`를, 여섯 패키지는 `integrations/`를 import하지 못하게 했다(ui-kit spec 완료). drawer-arm과 ghost-hand의 금지는 ghost-hand 작업 19와 함께 한다.
- kiro-integration 구현 7차(21:05): hook 시간(M1, 5회 중앙값): gate가 안전 명령을 통과시키는 데 0.10초, 쓰기 판정 0.09초, ghost-log가 100만 자 기록을 남기는 데 0.13초, 다섯 시나리오에서 gate가 runner 위에 더하는 시간 최대 0.83초. README에 Kiro 연동 절과 "양식으로 새 세계 시작하기"를 쓰고, 새 세계가 복사해 시작하는 `.kiro/specs/_new-world/` 양식(요구사항 11개, 작업 12개)을 만들었다. 하위 에이전트가 "작업을 먼저 진행 중으로 표시하라"며 모든 지시를 거절해서 Kiro 본 세션이 직접 했다. 남은 문제: kiro-hook과 mcp의 Docker 시험을 동시에 돌리면 서로 부딪혀 실패한다(하나씩이면 통과). 최종 점검 때 고친다.
- world-smith(21:12): Kiro 커스텀 에이전트 `.kiro/agents/world-smith.json`. 도구는 읽기·쓰기·셸, Powers와 작업 공간 MCP는 끄고 Kiro Crew 도구는 뺐다. `resources`로 `_new-world` 양식 README와 world-contract·structure·security steering을 맥락에 넣고, 셸은 `corepack pnpm --filter <패키지> test/typecheck/lint`만 미리 허용한다(지우기·git·설치는 허용 목록에 없음). 프롬프트는 이름 정하기 → 양식 복사 → requirements·design·tasks → `worlds/<name>/` 구현 → `world.config.ts` 등록 → verifyWorld와 결계 통과 → 보고의 8단계. `kiro-cli agent validate` 통과. 비대화형 CLI에서는 `--agent-engine v3`를 붙여야 이 V3 형식 에이전트를 불러온다(없으면 "Mode not found"). 실제로 불러 읽기 전용 질문을 하니 8단계와 resources 네 개를 정확히 댔다. 7.55크레딧으로 오늘 가장 싼 구현 회차.
- ghost-shell 구현 5차(19:56): ghost-shell spec 18개 작업이 모두 끝났다. 다시 찍어 본 화면: 넓은 화면에서 두 열(왼쪽 시나리오·계획, 오른쪽 촛불·배너·거울 세계·에이전트 메시지), 제목과 "Let your agent's ghost try it first.", 테마 버튼, 실행 전 "No ghost run yet.", 블랙라이트는 꺼진 상태에서 "Turn on the blacklight to read it."만 보임, 연기는 글자를 가리지 않음. 문서·위생 시험·core/ui/wards-config의 놀이터 import 금지·`preview` 스크립트도 들어갔다. 남은 문제: nightly(10,000회) verifyWorld가 힙 약 3.7GB에서 메모리 부족으로 끝나지 못한다. Kiro가 문서에 오늘이 아닌 날짜(11/19, 11/20)를 적은 것을 발견해 다음 회차에 고치게 했다.
- kiro-integration 구현 1차(16:16): 탐침 hook을 Kiro가 만들었다. Pre/Post Tool Use와 파일 저장·생성·삭제마다 필드 이름과 경로만 `.ghost-run/probe/events.jsonl`(git 제외)에 남기고, 비밀이 담길 수 있는 필드는 길이와 해시만 남긴다. 막는 것은 정해진 시험 명령 하나뿐이다. **검토에서 막은 것:** Kiro가 쓴 시험 파일 하나에 이 Mac의 사용자 계정 이름이 문자열로 들어가 있었다(목적은 "hook 파일에 사용자 이름이 없음"을 확인하는 시험). 공개될 저장소에 개인 정보가 들어가므로 그 파일은 커밋에서 빼고 다음 회차에 고치게 했다. 이미 올린 커밋에는 없음을 `git grep`으로 확인했다.
- **CLI 탐침 결과(작업 1.5, Kiro CLI 3.4.0, 16:20):** Claude Code가 비대화형으로 도구를 미리 허용하고 메시지 (a)~(g)를 차례로 보냈다(승인 창 시험은 이번 범위가 아님). (a) 파일 쓰기 도구로 새 파일을 만들면 `PostFileCreate` 다음에 `PostFileSave`가 온다. 셸(`rm`)로 지우면 파일 이벤트가 없다. CLI의 기본 에이전트와 spec 에이전트 본체에는 삭제 도구가 없어(하위 에이전트만 `delete_file`을 가짐) `PostFileDelete`는 확인하지 못했다. (b) 파일 이벤트의 경로 필드는 `file_path`. (c) Post Tool Use에는 `tool_response`가 있고 객체가 아니다. (d) 종료 코드 2로 막힌 호출에는 Post Tool Use가 오지 않는다. 에이전트는 "hook이 막았고 이유는 없었다"고 받는다. (e) 파일 이벤트 hook의 표준 출력은 에이전트 맥락에 들어가지 않는다. (f) `code` 도구의 operation은 14개이고 파일을 고치는 것은 `pattern_rewrite`, `rename_symbol`, `format_code`. (h) `timeout`은 hook 항목 수준에 둔 것만 지켜지고(1초에 끊김) action 안에 둔 것은 무시된다(실험 B hook은 action 안에 두었었다). 앞선 두 세션이 도는 동안 쌓인 591줄도 따로 보관했다. IDE 쪽 확인(작업 1.4)은 사람이 화면에서 해야 해서 사용자에게 부탁한다.
- kiro-integration 구현 2차(16:36): gate 설정, hook 입출력, `.ghost-run/` 기록 저장소(비밀값 가리기, 세션 키, 통계, 출처 기록, 실행 기록), 파일 이벤트 해석, wards 파일 읽기, 안전 목록, 자기 보호, 승인 위조 방지. 시험 18개 파일 267개 통과(Claude Code 확인). **PBT가 찾은 다섯·여섯 번째 제품 버그(둘 다 보안):** (P4) 실행 기록에 `secretValues`와 `payloads` 항목이 값만 가려진 채 남았다. 이제 깊이와 상관없이 그 키를 지운다. (P2) 안전 목록을 넓히는 항목에 자유 단어를 허용하면 `mytool ./.env`가 안전으로 판정됐다. 자유 단어도 비밀 경로와 대조하게 고쳤다. 사용자 이름이 들어 있던 시험 파일도 이번에 고쳐 커밋했다.
- 실험 B hook 끄기(13:20): 패턴 hook이 Kiro의 정상 작업을 계속 막아(ghost-runner 6차에서도 임시 시험 파일 삭제가 막힘) Kiro에게 두 hook을 `enabled: false`로 바꾸게 했다. 이미 돌고 있던 세션은 시작할 때 읽은 hook을 계속 쓰므로, 새로 시작하는 세션부터 적용된다. kiro-integration 작업 3.1은 이것을 확인만 한다.

- **Kiro Crew가 끼어든 일(10:13):** 이 Mac에는 Kiro Crew 0.12.2가 전역 설치돼 있어서, CLI 세션에서 `kirocrew-*` 에이전트와 `kirocrew-work` MCP 도구가 보인다. ghost-runner 구현 2차에서 spec 에이전트가 spec 문서 수정을 `kirocrew-worker` 하위 에이전트에 맡겼고, 그 에이전트가 Crew 작업 기록 도구(`work_brief`, `work_report`)를 불렀다. 세션 신원 확인 실패로 Crew 기록에는 아무것도 남지 않았고, 수정 자체(`secretValues` 상한: 파일 16개, 파일당 64 KiB, 요구사항 9.15, 작업 12.8a·b)는 정상이었다. 기획에서 Crew는 뺐으므로, 이후 실행은 `--trust-all-tools` 대신 `--trust-tools=@builtin`(내장 도구만 허용)을 쓰고 지시에 "kirocrew 에이전트와 도구는 쓰지 않는다"를 넣는다.

- ghost-runner 구현 2차(작업 3~6): core에 `symlink-changed`, `dropped`, `ObservedEvent.eventId`, `evaluate(report, wardSet, { secretValues, payloads })`를 더했다(core 테스트 43개 통과). ghost-runner는 설정·결과·판정 합성, B안 정적 분석기, Docker 실행 인자 생성기와 마운트 감사(테스트 31개 통과, Docker 시험 1개 건너뜀). Docker 인자는 실험 A 권장안 그대로다: `--network none`, `--dns 127.0.0.1`, `--cap-drop ALL`, `no-new-privileges`, 프로세스·메모리·CPU 제한, 읽기 전용 루트와 `/tmp` tmpfs, 비root 사용자, 복사본만 쓰기 가능으로 마운트, 기록기용 익명 볼륨. 마운트 경로에 쉼표를 넣어 옵션을 끼워 넣는 것도 막는다. PBT는 저장 시 성질마다 20회, 명시 실행 100회로 나눴다.
- ghost-runner 구현 3차(작업 7~9): 파일 지문(manifest), 복사 계획과 복사기, diff, SQLite 행 수, 기록기 호스트 쪽(strace·DNS·로그 해석, 사건 id). PBT 성질 P1~P4, P13~P15를 더해 ghost-runner 테스트 77개 통과(Docker 시험 1개 건너뜀), core 43개 그대로. Claude Code가 tsc, eslint, vitest를 다시 돌려 같은 결과를 확인했다. Kiro가 확인을 요청한 결정 중 뒤에서 챙길 것: 상자 안 `ghost-count`와 `ghost-step`의 출력 형식을 호스트 해석기에 맞출 것(작업 10.2), `EventBuilder`와 수집기 연결(작업 12), 지문 지름길과 "후보 파일만 해시" 부분은 테스트가 약하다는 점(해시 횟수를 셀 수 있게 하거나 시각을 주입하게 해서 보강).
- **실험 hook이 Kiro의 삭제를 막은 일(구현 3차):** 실험 B hook이 Kiro의 도구 호출 4번을 막았다. 셸의 `rm -rf` 2번은 `/tmp`의 임시 폴더 정리라 오탐이었다. 나머지 2번은 Kiro CLI의 파일 삭제 도구(`delete_file`)로, `write` 매처가 삭제 도구도 잡는다는 증거다(기획서 완료 기준의 "셸이 아닌 파일 쓰기·삭제 도구도 잡는지"). 그런데 Kiro는 두 번 막힌 뒤 같은 파일을 셸의 `rm tests/zz-smoke.test.ts`로 지웠고, 이 명령은 `-rf`가 없어서 패턴 hook을 그대로 통과했다. 지운 것은 Kiro가 직접 만든 임시 테스트 파일이라 피해는 없다. 명령 모양으로 막는 hook은 같은 일을 다른 명령으로 하면 뚫린다는 실제 사례이고, ghost-gate가 상자 안 diff로 판정해야 하는 이유다.
- ghost-runner 구현 4차(10:56): 상자 이미지 `ghost-run/box:<내용 해시>`(arm64, 341 MB). 기반은 `node:20-bookworm-slim`을 digest로 고정했고(`docker buildx imagetools inspect`로 확인한 값), 패키지(strace, sqlite3, curl, openssl, ca-certificates)는 2026-10-01 시각으로 고정한 Debian snapshot에서 받는다. 상자 전용 CA는 이미지를 빌드할 때 만들어 이미지 안에만 둔다(저장소에 개인 키가 없음을 시험으로 확인). 상자 안 기록기는 가짜 DNS, HTTP·TLS 수신기, strace, SQLite 행 수 세기다. 네트워크 없는 컨테이너에서 `.example` 주소로 보낸 TLS 요청의 SNI가 기록되는 것을 Kiro가 확인했다. 시험 도우미가 있지도 않은 이미지 이름(`ghost-run-box:local`)을 찾고 있어서 Docker 시험이 조용히 건너뛰어지던 것도 이번에 고쳐졌다. Claude Code 확인: ghost-runner typecheck·lint 통과, 테스트 121개 모두 통과(건너뜀 0, Docker 시험 포함 8초), 시험 뒤 남은 컨테이너·볼륨 0개.
- 같은 회차에서 실험 hook이 Kiro의 셸 명령 5번을 막았는데 모두 오탐이었다. Dockerfile을 heredoc으로 쓰는 명령(안에 `rm -f`와 `--no-install-recommends`가 있어 r과 f가 함께 보임), `docker rm -f ...`, `docker run --rm --read-only --tmpfs ...`(`--rm` 안의 rm). 지금까지(ghost-runner 구현 1~4차, possession 구현 1차) 실험 hook이 막은 Kiro의 도구 호출을 CLI 기록에서 세어 보니 19번이다. 13번은 Kiro가 스스로 만든 임시 파일·폴더를 지우려던 것(삭제 도구 8번, 셸 5번)이고, 6번은 지우는 명령조차 아니었다(파일 내용에 든 `rm -rf` 글자, `docker rm -f`, `docker run --rm`). 막힌 뒤 Kiro는 같은 일을 `rm` 한 단어나 `mv`(저장소 밖 `/tmp`로 옮기기)로 해냈다. 명령 모양을 보는 hook은 위험한 명령은 한 번도 만나지 못한 채 무해한 작업만 막았고, 막은 것도 다른 명령으로 우회됐다.
- ghost-runner 구현 5차(11:46): 실행 파이프라인 `runPlan`(원본 지문 → 복사 → 상자 안 유령 실행 → diff·SQLite 행 수·기록기 수집 → 판정 → 정리), `Repo_World`, 상자 안 HTTP·TLS 본문을 메모리로만 넘기는 연결, 비밀값 상한과 유출 방지 시험. 상자 안 스크립트와 호스트 해석기의 형식이 같은지 실제 상자로 확인하는 시험도 생겼다. 전체 빌드(`pnpm -r build`)의 TS6059 문제도 ghost-runner 빌드 설정이 core를 소스 대신 빌드 결과로 읽게 바뀌어 풀렸다(Claude Code가 루트에서 다시 빌드해 확인, core/src에 찌꺼기 없음).
- **Kiro는 "211개 모두 통과"라고 보고했지만 Claude Code가 다시 돌리니 두 가지가 나왔다.** (1) Docker 시험 `pipeline.docker.test.ts`가 전체 실행에서 매번 실패했다. 이 시험은 `ghost-run.run-id` 라벨이 붙은 컨테이너를 모두 세는데, 동시에 도는 다른 Docker 시험 파일의 컨테이너까지 세었다. 단독으로 돌리면 통과하고 시험 뒤 남은 컨테이너도 0개라 제품 누수가 아니라 시험끼리의 간섭이다. (2) Plan B 공개 성질 P8이 한 번 실패해서 nightly(10,000회)로 다시 돌려 반례를 얻었다. 줄여진 반례는 명령 `${` 하나다. Docker가 없을 때 쓰는 정적 분석기가 shell-quote의 "Bad substitution" 예외를 받지 않아 `runPlan` 전체가 예외로 끝났다. hook에서 이런 일이 생기면 판정 없이 실패하므로 실제 버그다. **PBT가 찾은 첫 제품 버그**로, 6차 지시에 반례(seed -1186101141)와 함께 넣었다.
- ghost-runner 구현 6차(12:53에 끊김): Claude Code가 Kiro CLI를 백그라운드로 돌릴 때 준 한도 60분에 걸려 프로세스가 끊겼다. 끊기기 전 로그에서 Docker 속성 시험 P5·P6(각 100회, 109초)과 다섯 시나리오는 통과했고, 상자에 `--init`(docker-init)이 들어가 PID 1 좀비 문제도 반영됐다. 하지만 Repo_World의 P3 Docker 속성 시험이 100회에 27분쯤 걸렸고, 시험이 남긴 컨테이너 4개와 볼륨 5개가 계속 떠 있었다. 같은 세션을 한도 2시간으로 이어서 누수 원인 수정, 느린 Docker 성질의 실행 시간 조정, 전체 시험 세 번 연속 통과 확인을 맡겼다. 이후 긴 구현 회차는 한도를 2시간으로 준다.
- ghost-runner 구현 6차 이어서(14:21): 작업 14까지 끝났다. 전체 시험 3회 연속 통과(53개 파일 258개, 건너뜀 0, 회당 570~630초). 컨테이너 누수 원인은 시험 시간 초과나 프로세스 종료로 `finally` 정리가 돌지 못한 것이었고, 기록기 볼륨에 run-id 라벨이 없어 누수 검사가 볼륨 누수를 볼 수 없었다. 프로세스 종료 시 상자를 지우는 reaper, `runPlan`의 중단 신호, 상자 최대 수명(보통 120초), 볼륨 라벨을 더했다. 상자 안에서 고아 프로세스 150개가 모두 좀비로 남는 것을 시험으로 확인한 뒤 `--init`으로 0개가 됐다. Repo_World의 P3 Docker 시험은 짧은 계획 쪽으로 길이 분포를 기울여 27분에서 3분대로 줄였다(성질과 범위는 그대로). 남은 일: core의 `verifyWorld`가 상태 객체를 필드별로 비교해서 복사본 경로와 시각이 다른 Repo_World는 원리상 통과할 수 없다. 지금은 `it.fails`로 표시하고 diff로 같은 조건을 보는 시험을 따로 뒀으며, core 쪽 회차에서 비교 방식을 고친다. Kiro가 hook에 막혀 못 지운 `$TMPDIR`의 임시 폴더(668KB)는 시험이 돌지 않는 것을 확인하고 Claude Code가 지웠다. 21분짜리 대기(sleep)에 묶여 있던 세션은, 기다리던 시험이 이미 끝나 있어서 그 sleep만 끝내 바로 마무리하게 했다.
- ghost-runner 구현 7차 앞부분(17:19): ghost-gate의 감시 타이머가 멈춘 상자를 정리할 수 있게 호출자가 run id를 정하는 `runId` 인자를 더했다. 상자에 소유자 라벨을 붙이고, 프로세스의 첫 실행이 죽은 소유자의 정지된 상자를 치운다(SIGKILL 뒤 남는 상자 대책). core의 `stateEquals`로 Repo_World의 계약 PBT를 내용(경로, 종류, 바이트) 비교로 바꿔 "알려진 실패" 표시를 풀었다. README에 ghost-runner 절과 contract-pbt hook 메모(저장 시에는 Docker 시험을 빼고 단위 시험만)를 썼다. 전체 시험 1회 통과(56개 파일 271개, 약 11분), 끝난 뒤 남은 컨테이너·볼륨 0. 측정(작업 15)은 기계가 한가할 때 따로 한다.
- ghost-runner 구현 7차 마무리(18:49): ghost-runner spec의 모든 작업이 끝났다. gate가 44초 예산을 넘길 수 있게 `runPlan`에 `pipelineDeadlineSec`(1~55초, 기본 55)를 더하고 run id 라벨 상수를 공개했다. 측정은 다른 Kiro 세션 없이 혼자 돌렸다(Apple M1 8코어 16GiB, Docker Desktop 4.94.0, 부하 4~6은 값마다 표시). 다섯 시나리오 각각 복사부터 판정까지 중앙값 1.3~1.5초(hook 제한 60초), 단계 하나 추가에 약 0.12초, 상자 안 가짜 DNS 응답 4ms, `npm test` 0.19초. W6 결정: 비밀 읽기 기록(`strace --seccomp-bpf`)이 더하는 시간이 최대 0.03초라 켜 둔다(P6 주장 유지). 전체 Docker 시험 57개 파일 284개 통과.
- README의 상자 패키지 라이선스는 Kiro가 "병합 전 확인"으로 남겨 둬서, Claude Code가 상자 이미지 안의 Debian copyright 파일로 확인했다: strace 6.1 LGPL-2.1-or-later, sqlite3 3.40.1 public domain, curl 7.88.1 curl license, openssl 3.0.22 Apache-2.0, ca-certificates GPL-2.0-or-later와 MPL-2.0, 상자 안 Node v20.20.2 MIT.

### 앱 2 결정 (13:35)

기획서의 기준("반나절 안에 도형 팔과 서랍이 브라우저에서 결정적으로 돌면 Ghost Hand 유지")을 실험 C가 15분 만에 넘겼다(같은 seed면 Node·Chrome·Web Worker 모두 비트 단위로 같은 결과, 빠르게 당기기 5/8 대 천천히 세게 쥐기 8/8). 사용자가 확인해 앱 2는 Ghost Hand, 세 번째 세계는 Ghost Cloud로 확정했다. Spirit Phone 비교는 해당 없음. 계획 수정 장면은 외부 LLM API 없이, Kiro 에이전트가 판정 메시지를 읽고 계획을 고친 실제 기록을 녹화해 쓰기로 했다.

- ghost-hand requirements(13:40): P1은 브라우저에서 실행마다 지문이 같을 때만, P8은 Node 20.20.2와 Apple M1의 Chrome 157로 한정하고, 페이지가 뜰 때 저장된 해시와 비교하는 결정성 자가 점검을 둔다(Firefox·Safari 사용자는 보장이 아니라 측정 결과를 본다). P5·P6은 이 세계에 해당하지 않는다. Kiro가 남긴 다른 spec과의 충돌 두 가지를 정했다. (1) 관절 한계·자기 충돌은 성공률에 섞으면 20개 중 1개 실패가 95% 기준을 통과하므로, core `VariantResult`에 선택 필드 두 개를 더해 어느 변형에서든 나오면 block한다(wards 2차에 넣음). (2) wards 메시지의 "no ghost rehearsal took place" 줄은 B안에만 맞는 문구라, 이유별 문구로 나누고 P5·P6이 해당하지 않는 세계에는 붙이지 않는다(wards 2차), 화면 배너는 "해당 없음"을 보일 수 있게 한다(ui-kit 2차).
- ghost-hand design(13:59): 세계는 `worlds/drawer-arm`, `reach` 목표는 장 앞면 바닥 중앙을 원점으로 한 월드 좌표, 복원은 `mj_getState`/`mj_setState`(`mjSTATE_INTEGRATION`)로 상태 배열 하나에 둔다(실험 C에서 비트 단위로 같았던 방식). 변형은 Web Worker 최대 4개에서 돌리고 결과는 변형 번호로 정렬한다. MuJoCo 호출은 `engine/` 안에만 두고 `.delete()`는 범위 객체로 관리한다. Kiro가 판정을 읽고 계획을 고치는 장면을 위해 Node 진입점 `ghost-hand-run`(종료 코드 0 pass, 1 warn, 2 block)을 둔다. 다른 spec의 선행 조건 세 가지(관절 한계·자기 충돌 필드, 이유별 메시지 문구, 배너의 "해당 없음")는 들어오기 전까지 주장하지 않거나 잠정 문구를 보이게 했다. P2는 world-contract steering이 놀이터 세계로 한정하고 있어서, "같은 빌드·시험한 환경에서 유령 실행과 기준 시뮬레이션의 결과가 같다(실물 하드웨어에는 주장 안 함)"로 steering을 넓히는 작업을 tasks에 넣게 했다.
- ghost-hand tasks.md(14:14): 첫 작업은 `@mujoco/mujoco` 4.0.1 API 탐침이고, 결과가 design과 다르면 design부터 고친다. P2 문구는 world-contract steering이 넓혀진 뒤에만 켠다(코드 상수로 막음). 선택 작업은 맨 끝의 금지 접촉 붉은 실 하나뿐이다. 이로써 앱 1(ghost-shell), 앱 2(ghost-hand), Kiro 연동, 화면 키트의 spec이 모두 갖춰졌다. 남은 spec은 세 번째 세계(Ghost Cloud, `_new-world` 양식에서 Kiro가 만드는 장면)와 world-smith 에이전트다.
- ghost-hand 구현 1차(14:27): MuJoCo 4.0.1 API 탐침이 design의 가정 여러 개를 바로잡았다. `mj_getState`는 `DoubleBuffer`에만 쓰고 일반 `Float64Array`를 넘기면 오류 없이 0으로 남는다. `mjSTATE_INTEGRATION` 복원은 비트 단위로 같았지만 FULLPHYSICS는 최대 0.0113 달랐다. `mj_step`은 NaN을 만나면 스스로 데이터를 초기화해서 유한성 검사로는 불안정을 못 잡고 경고 카운터를 봐야 한다. `data.warning` 같은 비소유 참조를 `.delete()`하면 모듈이 abort한다. `<size memory="1M"/>`가 있으면 MjData가 약 1MB, 없으면 13.6MB다. design을 먼저 고친 뒤 steering(구조, P2 범위)과 `worlds/drawer-arm`, `apps/ghost-hand` 뼈대를 만들었다. 새 패키지 두 개의 typecheck·lint·시험은 Claude Code도 다시 돌려 통과를 확인했다.
- ghost-hand 구현 2차(14:40): 변형 표본기, 시드 난수, 계획 파일·변형 설정 파서와 출력기, 다른 spec의 선행 조건이 들어왔는지 동작으로 확인하는 탐침. **PBT가 찾은 세 번째 제품 버그:** GH-P3(변형 값은 선언한 범위 안)이 정수가 하나도 없는 지연 범위(최소=최대=-5e-324)에서 표본기가 범위 밖 값을 내는 것을 찾았다. 설정 파서가 그런 범위를 거절하게 고쳤고 반례는 고정 시험이 됐다. 선행 조건(관절·자기 충돌 결계, 메시지의 선택적 claims) 시험 2개는 wards 2차 뒤 core를 다시 빌드하면 켜진다. drawer-arm 60개, ghost-hand 71개 통과(2개는 선행 조건 대기).
- ghost-hand 구현 3차(16:02): MuJoCo 엔진 계층(MJCF, 상태 저장·복원, 경고 카운터 감시, 범위 객체로 `.delete()`), 제어기와 IK, drawer-arm 세계의 여섯 함수, 기준 시뮬레이션, 앱의 순수 파이프라인·자가 점검·겹치기 모델·상태 갱신기. drawer-arm 106개, ghost-hand 128개 시험 통과(Claude Code가 다시 돌려 확인). 저장 시 짧은 실행은 성질마다 36회로 정했다(가장 무거운 예시가 M1에서 약 694ms, 근거는 `tests/pbt-budget.json`). core에 선행 조건이 들어가 건너뛰던 능력 시험이 모두 켜졌다. 지금까지 회차 중 가장 많은 크레딧(95)을 썼다.
- ghost-hand 구현 4차(19:30): **앱 2의 데모 장면이 성립한다.** 시드 42, 유령 8개에서 첫 계획(빠르게 당기기)은 7/8만 통과해 결계 `gentle-hands`(성공률 95%)로 block되고(한 변형은 관절 한계도 보고), 고친 계획(천천히, 세게 쥐기)은 8/8로 pass. 이렇게 되도록 Kiro가 장면 수치를 조정했고 이유를 design에 적었다(팔이 장 윗면에 걸려 기본 세계에서도 접촉력이 생겨 윗면을 낮춤, 손잡이 위치와 센서 잡음의 흔드는 범위를 좁힘). 시험은 통과 수를 결과에서 계산한다. Three.js 겹치기 렌더러와 Web Worker 실행기도 들어갔지만 화면 연결과 브라우저 프레임 시간 측정은 다음 회차다. drawer-arm 106개, ghost-hand 169개 통과.
- ghost-hand 구현 5차(20:15): 실제 MuJoCo 엔진으로 도는 세계 성질 P10~P18·P20(저장 시 35회씩), 결정성 기준 해시(Node 20.20.2, Apple M1에서 만든 값, Chrome 값은 브라우저 측정 때), 계약 PBT 등록 관문. drawer-arm이 "시험한 환경 안에서 결정적" 세계로 `verifyWorld`를 기본 비교로 통과한다(기본 세계와 변형 세계 모두). contract-pbt hook을 drawer-arm 저장으로 직접 돌리면 14.6~15.9초(60초 안). drawer-arm 141개, ghost-hand 175개 통과.
- ghost-hand 구현 6차(20:56): 화면(ui-kit 촛불에 P5·P6 "해당 없음", 묘지, Three.js 유령 팔 겹치기, 움직임 줄이기에서는 정지 화면), 데모에서 Kiro가 판정을 읽고 계획을 고치는 장면에 쓸 명령줄 `ghost-hand-run`. 첫 계획은 종료 코드 2와 "GHOST RUN BLOCKED by ward gentle-hands: success rate 7/8 (0.88) below minimum 0.95. Reduce speed or contact force, or change the plan, and rehearse again.", 고친 계획은 종료 코드 0과 "GHOST RUN PASSED: all 1 ward cleared.". 정적 빌드는 단일 스레드 MuJoCo라 COOP/COEP가 필요 없고, MuJoCo·three·React 등 11개 구성요소의 제3자 고지를 넣었다(빌드 12.45MB, 대부분 MuJoCo wasm 11.2MB). 239개 시험 통과(Claude Code 확인).
- ghost-hand 구현 7차(21:23): 실제 시간으로 도는 headless Chrome 하네스로 잰 값은 페이지 준비 248~416 ms, 유령 8개 308·414 ms(목표 2초), 20개 518·557 ms(목표 5초), 3D 겹치기 프레임 간격 중앙값 16.7 ms(화면 주사율 한계라 여유는 못 보여 줌). 실행 40회 뒤에도 WebAssembly 힙이 그대로(76,218,368 bytes). Chrome의 메인 스레드와 Web Worker 결정성 해시가 Node 값, `golden.json`과 같아서 P8 범위를 줄이지 않았다. P2 문구를 켰고, drawer-arm·ghost-hand·core·ui·wards-config에 `integrations/` import 금지를 넣었다(kiro-integration 2.2 완료). Kiro가 지시 범위 밖에서 `core/tests-node/eslint-builtins.test.ts`의 임시 파일 경합을 한 줄 고쳤고, 스스로 보고했다.
- 계획 고치기 녹화(21:33, design D18): 손으로 쓴 고친 계획(`origin: scripted`)을 실제 Kiro 세션의 결정으로 바꿨다. 손으로 쓴 값을 보지 말고 차단 메시지, `wards.yaml`, 첫 계획, 동작 범위만 보고 정하게 했다. Kiro는 그립을 세게(25, 28 N) 하면 접촉력이 30 N 한도를 넘고 빨리 당기면 성공률이 떨어지는 것을 시도로 확인한 뒤, 그립 15 N, 당기기 0.15 m를 0.15 m/s로 정했다(8개 변형 모두 성공, 최대 접촉력 29.24 N, 기본 세계 서랍 0.1276 m). 첫 시도 중 macOS sed 문법 차이로 한 번은 같은 값으로 돌았고, Kiro가 이를 알아채고 기록에 남겼다. 그립을 낮췄는데 이름이 요구 사항에 박힌 `slow pull, strong grip`이라 어긋나서, 같은 세션을 이어 이름을 바꾸게 했다. Claude Code가 다시 돌린 결과: 첫 계획 종료 코드 2(gentle-hands 7/8, variant-6 관절 한계), 고친 계획 종료 코드 0.
- 남은 수정 회차(22:03, F1): playground의 nightly 계약 PBT(10,000회)가 힙 3.7GB에서 끝나지 못하던 원인은 제품 코드가 아니라 시험용 판정 도우미(`tests/support/journal-adapter.ts`)의 메모였다. 모든 예시의 모든 단계 결과를 프로젝트 상태 전체를 16진수로 만든 키와 함께 끝까지 들고 있었다. 계획마다 비우게 고치자 600회 기준 GC 뒤 힙이 2,054MB에서 37MB로 줄었고, nightly 10,000회가 18분 51초, 최대 메모리 약 685MiB로 처음 끝까지 통과했다. Docker 시험 충돌은 kiro-hook과 mcp가 같은 라벨의 컨테이너 전체 목록을 전후로 비교해서 생겼다. 두 패키지 시험이 기계 하나에 잠금 하나를 잡고 번갈아 돌게 하고, mcp 시험은 자기 run id만 보게 고쳤다. Claude Code가 두 패키지를 동시에 돌려 확인한 결과: 609개와 60개 통과, 25초, 끝난 뒤 컨테이너 0개, 볼륨 변화 없음. playground 397개 통과. Kiro가 남긴 결정거리: 잠금이 패키지 시험 전체를 직렬화하는 것(유지), playground 세계의 Trace 맵이 스냅샷마다 계속 쌓이는 것(데모에는 지장 없음, design에만 기록), 잠금 파일이 두 패키지에 복제된 것(의존 방향 규칙 때문).
- ghost-runner 6차(14:12): 전체 시험 세 번 연속 통과(576초, 630초, 570초, 끝난 뒤 남은 컨테이너·볼륨 0개). Docker 속성 시험이 포함돼 한 번에 10분쯤 걸린다. 저장 시 hook(60초)에는 Docker 시험을 빼고 짧게 돌려야 한다.
- ui-kit 구현 1차(13:55): `ui/` 패키지 뼈대, 두 테마 색 토큰, 화면 여섯 부분의 view-model. 테스트 25개 파일 223개 통과. 손으로 계산했던 대비값은 UI-P6 시험이 50쌍 모두 기준을 넘는다고 확인했다(가장 빠듯한 짝은 밝은 테마의 선 색 대 안개 3.987, 기준 3). **PBT가 찾은 두 번째 제품 버그:** UI-P7(격리 주장 정직성)이 `claims.ts`에서 플래그 하나만 형식이 틀려도(`p5Claimed: null`) Docker 상자 확인 문구 전체가 사라지는 버그를 찾았고, Kiro가 고친 뒤 반례를 고정 시험으로 남겼다. UI-P3은 시험 쪽 기준 실수(U+FFFF 위 글자의 표기 길이)를 잡았다. 측정값 원문은 Kiro가 devlog 끝에 영어로 붙였던 것을 `docs/measurements.md`로 옮겼다. 앞으로 Kiro 지시에는 "devlog.md는 고치지 않고 측정값은 measurements.md에"를 넣는다.
- ui-kit 구현 3차(15:25): 화면 성질 UI-P1~UI-P11의 정적 마크업 시험과 DOM 시험(키보드, 테마, 네트워크 금지, 오류 경계, 움직임 줄이기, axe 접근성 검사). 시험 63개 파일 533개, 저장 시 실행 약 32초. axe 검사가 붉은 실 목록의 잘못된 역할(`<li role="group">`)을 찾아 고쳤다. 다음 회차에 넣을 결정: 블랙라이트의 발견 목록은 스위치를 켜기 전에는 숨긴 문장을 풀어 보이지 않는다(데모의 "켜면 드러난다" 장면을 지키기 위해서. 지금은 목록이 꺼짐 상태에서도 풀어 쓴 내용을 보여 준다), UI-P5의 `javascript:` 검사는 URL을 담는 속성에만 둔다, Nightly 시간 한도를 모든 속성 시험에 맞춘다, UI-P7 생성기가 정적 분석 모드를 너무 드물게 내는 것을 고친다.
- ui-kit 구현 4차(19:35): 브라우저 확인에서 나온 것을 고쳤다. 블랙라이트 발견 목록은 스위치가 꺼져 있으면 분류·위치·코드 포인트 수와 "Turn on the blacklight to read it."만 보이고, 숨은 문장은 켰을 때만 드러난다(끔→켬→끔이면 처음 마크업으로 돌아가는 성질 UI-P10도 고침). 연기는 작은 원 세 개로 줄여 글자와 겹치지 않는 칸 끝 자리에 두었다. `kit.css`에 테마 버튼·입력·텍스트 영역 스타일을 더했다. 모든 속성 시험이 nightly에서 시간 한도를 받게 했다(Nightly 1회 628초, 결과는 통과지만 vitest 워커 응답 경고로 종료 코드 1이 나는 문제는 기록만 함). 713개 시험 통과(Claude Code 확인).
- 같은 회차에서 Kiro가 pnpm의 새 패키지 설치 대기(게시 후 일정 시간 설치를 막는 공급망 보호)를 `@eslint-react` 5.30.4 계열 13개에 대해 `minimumReleaseAgeExclude`로 우회했다. 5.30.4는 11/17 17:04 UTC에 게시돼 반나절밖에 안 된 버전이었다(Claude Code가 이 버전을 지시에 적으면서 게시 시각을 확인하지 않은 탓도 있다). 다음 ui-kit 회차에서 이틀 전에 나온 5.30.3으로 고정하고 예외를 지우게 한다. 이 예외 줄은 wards 커밋(04a2c9b)에 섞여 들어갔다.

### 커밋 (사용자 요청으로 13:40부터)

사용자가 만든 private 저장소(github.com/SungHyunC/ghost-run)에 spec별로 커밋해 올린다. 11:01에 다른 경로로 올라간 첫 커밋 메시지에 Claude 공동 작성자 줄이 있어서, 사용자 허락을 받아 메시지만 고쳐 덮어썼다(트리는 그대로, `--force-with-lease`). 커밋 작성자 메일은 이 저장소에서만 GitHub noreply 주소로 바꿨다. 제품 이름은 사용자 결정으로 Ghost Run+를 유지한다("Ghosting"도 검토: 같은 분야의 같은 이름은 못 찾았지만 흔한 속어라 검색과 상표 식별이 약함).

| 커밋 | 내용 | spec 작업 |
| --- | --- | --- |
| c6f8284 | 11:01 시점 전체 스냅숏 (core-contract 전부, ghost-runner 1~11, possession 1~3과 4 일부, 각 spec 문서) | 여러 spec |
| 8e77373 | possession 속성 시험 1~22, 예시·Node 전용 시험, README possession 절 | possession 4~13 |
| 04a2c9b | core 판정 모듈(`core/src/judge/`), core 타입 추가, wards-config 뼈대, structure steering | wards 1~3 |
| e403cda | ghost-shell과 kiro-integration spec 문서 | 두 spec의 requirements·design·tasks |
| 09f28de | 실험 B hook 끄기 | kiro-integration 3.1(미리 함) |
| ca34c17 | 개발 기록 | |
| f91d9fa | package scaffold, theme tokens with contrast gate, view models | ui-kit tasks 1-5 |
| 55d5a24 | add measurements file and update the development log | docs |
| a7e0fee | React components, SVG art, styles, and claim banner updates | ui-kit tasks 6-7 |
| 2e8ac4e | update the development log | docs |
| 7d1ae49 | Repo_World, runPlan pipeline, Docker integration tests, and fixes | ghost-runner tasks 12-14 |
| 8288fa4 | MuJoCo API probe, steering updates S1-S4, package scaffolds | ghost-hand tasks 1, 2, 3.1-3.2, 4 |
| 62f765f | pure world logic, plan and variant formats, capability probes | ghost-hand tasks 3.3-3.4, 5-6 |
| 603414b | static and DOM component tests for UI-P1..UI-P11 | ui-kit task 8 |
| 89359bc | engine integration in core/src/wards.ts | wards tasks 4-5 |
| 0947227 | verifyWorld stateEquals option; WardNotice kind 'unsupported-step' | core |
| fd9a787 | wards.yaml parser, printer, safe_commands, browser-safe entry | wards-config wards tasks 6-7 |
| fbc7e2e | MuJoCo engine layer, controller, World contract, pipeline, overlay model | ghost-hand tasks 7-8 |
| 69882bb | default wards.yaml, scenario checks, leak/determinism/error-line properties, README | wards tasks 8-11 |
| dcaa6f6 | early verification, world state, virtual FS, diff, SQL executor and watchdog | ghost-shell tasks 2-5 |
| b1fb5d6 | host-fact probe hooks, hook package scaffold, exp-b retirement checks | kiro-integration tasks 1.1-1.3, 2.1, 2.3-2.5, 3.1-3.2 |
| d044d52 | CLI probe results, gate config, hook I/O, Ghost_Store, gate input classification | kiro-integration tasks 1.5-1.6, 4, 5 |
| c560a73 | shell parser and interpreter, command handlers, playground World and contract tests | ghost-shell tasks 6-8 |
| 605b838 | ui wiring, runPlayground pipeline, five scenarios with fixed plans | ghost-shell tasks 9-11 |
| 8374757 | caller runId, stale box sweep, content-based verifyWorld, docs | ghost-runner tasks 16, 18.1-18.5 |
| f508e21 | plan file codec, wards editor, graveyard, screens, static build | ghost-shell tasks 12-15 |
| ba1cec8 | gate judgment and output (semaphore, watchdog, shell and write judgment, Plan B, graveyard records) | kiro-integration tasks 6-7 |
| ad8227e | pipelineDeadlineSec, LABEL_RUN_ID export, timing and secret-read measurements | ghost-runner tasks 15, 17, 18.6; spec complete |
| e65ed07 | gate assembly, bootstrap, ghost-gate.json (disabled), process tests | kiro-integration tasks 8-9 |
| d8dcd30 | variant executors, 3D overlay renderer, run pipeline, demo plans and tuned scene | ghost-hand tasks 9-11 |
| 1e63767 | gallery and static hosting checks, hygiene, docs, blacklight reveal, smoke and control styles | ui-kit tasks 9-12, 14-15 |
| fed6f07 | ghost-log, contract-pbt, world-scaffold, blacklight-steering hooks | kiro-integration tasks 10-13 |
| f82601c | two-column demo layout, docs, hygiene tests, import bans, preview script | ghost-shell tasks 16-18; spec complete |
| 26f34f2 | engine-bound world properties, golden hash, verifyWorld registration gate | ghost-hand tasks 12-13 |
| c392dcc | ghost-run MCP server and Kiro power | kiro-integration tasks 14-15 |
| 2537d0e | ghost-runner boxDir lookup, power bundle runs in the box, import bans | cross-spec fixes ghost-runner 18.7, ui-kit 13.1, kiro-integration 2.2 partial and 15.5 |
| 31f8117 | screens with 3D ghost overlay, ghost-hand-run CLI, build and third-party notices, hygiene | ghost-hand tasks 14-16 |
| 0d32ffe | hygiene and hook timing, docs, _new-world spec template | kiro-integration tasks 16, 18 |
| fcbdf08 | custom agent that builds a new world from the _new-world template | world-smith |
| 5de2960 | browser harness and timings, claim scopes and disclosures, import bans, final checkpoint | ghost-hand tasks 17-20; spec complete except optional 21.1 |
| a2114f2 | recorded plan revision from a Kiro CLI session (design D18), renamed to slow pull, gentle grip; README numbers updated | ghost-hand |
| dac7e79 | nightly verifyWorld no longer runs out of memory (journal oracle memo cleared per plan); nightly measurement | ghost-shell |
| 47492a1 | real-box tests serialized across packages with a box lock, mcp box tests matched by run id, hygiene scan covers .kiro/agents | kiro-integration |

아직 커밋하지 않은 것: 이 개발 기록. 커밋 내용 칸은 커밋 메시지(영어)를 그대로 옮겼다.

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
- 실험 hook 두 개는 11/18 13:20에 Kiro가 껐다(`enabled: false`, 위 "구현 시작" 기록 참고). IDE에서는 Agent Hooks 패널의 눈 아이콘으로도 켜고 끌 수 있다.
