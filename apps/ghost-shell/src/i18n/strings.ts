// The page's words in each language. English is built from the fixed texts (texts.ts, page-texts.ts, the tour
// captions), so the English page reads exactly as before. Korean is the ko.html page.
// Not translated: the ui kit parts (candle, claims, mirror table, blacklight, red thread, graveyard), the ward
// reasons, the parser errors, and the message the agent receives, which is the agent's own text.
import { CAPTIONS } from '../flow/tour';
import type { TourCaptions } from '../flow/tour';
import * as P from '../page-texts';
import * as T from '../texts';

export type Locale = 'en' | 'ko';
type ScenarioId = 1 | 2 | 3 | 4 | 5;
type Pair = { readonly title: string; readonly sub: string };

export interface Strings {
  readonly lang: Locale;
  readonly switchLabel: string;
  readonly switchHref: string;
  readonly switchLang: Locale;

  readonly brand: string;
  readonly eyebrow: string;
  readonly tagline: string;
  readonly lead: string;
  readonly points: readonly string[];
  readonly footer: string;

  readonly flowHeading: string;
  readonly flowSummary: string;
  readonly flowNodes: Readonly<Record<'plan' | 'copy' | 'ghost' | 'judge' | 'out' | 'flicker' | 'lit', Pair>>;
  readonly flowJudgeSub: Readonly<Record<'idle' | 'lit' | 'flickering' | 'out', string>>;
  readonly flowEdgeFix: string;
  readonly flowEdgeApproved: string;
  readonly flowReplay: string;
  readonly flowPill: Readonly<Record<'block' | 'warn' | 'pass', string>>;
  readonly captions: TourCaptions;

  readonly stepPick: string;
  readonly scenariosHeading: string;
  readonly scenariosHint: string;
  readonly scenariosIntro: string;
  readonly scenarioSelector: string;
  /** Card titles; undefined means the bundled scenario titles (English). */
  readonly scenarioTitles: Readonly<Record<ScenarioId, string>> | undefined;
  readonly scenarioCards: Readonly<Record<ScenarioId, { readonly tag: string; readonly blurb: string }>>;
  readonly selected: string;
  readonly fixedPlanHint: string;
  readonly runGhost: string;
  readonly applyFixedPlan: string;

  readonly stepRun: string;
  readonly runHeading: string;
  readonly dockerBoxNotUsed: string;
  readonly noRun: string;
  readonly noRunHint: string;
  readonly p1Failed: string;
  readonly messagePanel: string;
  readonly runDetails: string;
  readonly p2Meaning: string;
  readonly p2NotClaimedUnsupported: string;
  readonly p2NotClaimedWatchdog: string;
  readonly p5p6Scope: string;

  readonly stage: {
    readonly realTitle: string;
    readonly realSub: string;
    readonly copyTitle: string;
    readonly copySub: string;
    readonly outsideTitle: string;
    readonly rowsWord: string;
    readonly tableDropped: string;
    readonly secretTag: string;
    readonly afterReadPrefix: string;
    readonly afterReadSuffix: string;
    readonly statusTag: Readonly<Record<'same' | 'deleted' | 'created' | 'changed', string>>;
    readonly stamp: Readonly<Record<'block' | 'warn' | 'pass', string>>;
  };

  readonly stepInspect: string;
  readonly inspectHeading: string;
  readonly inspectIntro: string;
  readonly possessionHeading: string;
  readonly purify: string;
  readonly purifyNote: string;
  readonly possessionAction: string;
  readonly canary: string;
  readonly graveyardDropped: string;

  readonly stepTools: string;
  readonly toolsHeading: string;
  readonly toolsIntro: string;
  readonly planHeading: string;
  readonly planName: string;
  readonly planNote: string;
  readonly planFixture: string;
  readonly scriptedPlan: string;
  readonly recordedPlan: string;
  readonly planSteps: string;
  readonly removeStep: string;
  readonly commandInput: string;
  readonly addToPlan: string;
  readonly clearPlan: string;
  readonly loadPlan: string;
  readonly downloadPlan: string;
  readonly markerUnsupported: string;
  readonly markerWatchdog: string;
  readonly markerFailed: string;
  readonly wardsHeading: string;
  readonly wardsInMemory: string;
  readonly wardsEditor: string;
  readonly wardsErrors: string;
  readonly wardsErrorLines: string;
  readonly resetWards: string;
  readonly downloadWards: string;
  readonly staleWards: string;

  readonly noticesLabel: string;
  readonly dismiss: string;
  readonly sqlStartFailed: string;
  /** Notices the page state holds in English, shown in this language. */
  readonly notices: Readonly<Record<string, string>>;
}

export const EN: Strings = {
  lang: 'en',
  switchLabel: '한국어',
  switchHref: './ko.html',
  switchLang: 'ko',

  brand: P.APP_BRAND,
  eyebrow: P.APP_EYEBROW,
  tagline: T.APP_TAGLINE,
  lead: P.HERO_LEAD,
  points: P.HERO_POINTS,
  footer: P.FOOTER_TEXT,

  flowHeading: P.FLOW_HEADING,
  flowSummary: P.FLOW_SUMMARY_TEXT,
  flowNodes: P.FLOW_NODES,
  flowJudgeSub: P.FLOW_JUDGE_SUB,
  flowEdgeFix: P.FLOW_EDGE_FIX,
  flowEdgeApproved: P.FLOW_EDGE_APPROVED,
  flowReplay: P.FLOW_REPLAY_LABEL,
  flowPill: P.FLOW_PILL,
  captions: CAPTIONS,

  stepPick: P.STEP_PICK_LABEL,
  scenariosHeading: 'Scenarios',
  scenariosHint: P.SCENARIOS_HEADING_HINT,
  scenariosIntro: P.SCENARIOS_INTRO,
  scenarioSelector: 'Scenario selector',
  scenarioTitles: undefined,
  scenarioCards: P.SCENARIO_CARDS,
  selected: P.SELECTED_TEXT,
  fixedPlanHint: P.FIXED_PLAN_HINT,
  runGhost: T.RUN_GHOST_LABEL,
  applyFixedPlan: T.APPLY_FIXED_PLAN_LABEL,

  stepRun: P.STEP_RUN_LABEL,
  runHeading: 'Ghost run',
  dockerBoxNotUsed: T.DOCKER_BOX_NOT_USED_TEXT,
  noRun: T.NO_RUN_TEXT,
  noRunHint: P.NO_RUN_HINT_TEXT,
  p1Failed: T.P1_FAILED_TEXT,
  messagePanel: T.MESSAGE_PANEL_LABEL,
  runDetails: P.RUN_DETAILS_HEADING,
  p2Meaning: T.P2_MEANING_TEXT,
  p2NotClaimedUnsupported: T.P2_NOT_CLAIMED_UNSUPPORTED_TEXT,
  p2NotClaimedWatchdog: T.P2_NOT_CLAIMED_WATCHDOG_TEXT,
  p5p6Scope: T.P5_P6_SCOPE_TEXT,

  stage: {
    realTitle: P.STAGE_REAL_TITLE,
    realSub: P.STAGE_REAL_SUB,
    copyTitle: P.STAGE_COPY_TITLE,
    copySub: P.STAGE_COPY_SUB,
    outsideTitle: P.STAGE_OUTSIDE_TITLE,
    rowsWord: P.STAGE_ROWS_WORD,
    tableDropped: P.STAGE_TABLE_DROPPED,
    secretTag: P.STAGE_SECRET_TAG,
    afterReadPrefix: `${P.STAGE_AFTER_READ} `,
    afterReadSuffix: '',
    statusTag: P.STAGE_STATUS_TAG,
    stamp: P.STAGE_STAMP,
  },

  stepInspect: P.STEP_INSPECT_LABEL,
  inspectHeading: P.INSPECT_HEADING,
  inspectIntro: P.INSPECT_INTRO,
  possessionHeading: 'Possession',
  purify: T.PURIFY_LABEL,
  purifyNote: T.PURIFY_NOTE_TEXT,
  possessionAction: T.POSSESSION_ACTION_TEXT,
  canary: T.CANARY_TEXT,
  graveyardDropped: T.GRAVEYARD_DROPPED_TEXT,

  stepTools: P.STEP_TOOLS_LABEL,
  toolsHeading: P.TOOLS_HEADING,
  toolsIntro: P.TOOLS_INTRO,
  planHeading: 'Plan',
  planName: 'Plan name:',
  planNote: 'Note:',
  planFixture: 'Project fixture:',
  scriptedPlan: T.SCRIPTED_PLAN_TEXT,
  recordedPlan: T.RECORDED_PLAN_TEXT,
  planSteps: 'Plan steps',
  removeStep: T.REMOVE_STEP_LABEL,
  commandInput: T.COMMAND_INPUT_LABEL,
  addToPlan: T.ADD_TO_PLAN_LABEL,
  clearPlan: T.CLEAR_PLAN_LABEL,
  loadPlan: T.LOAD_PLAN_LABEL,
  downloadPlan: T.DOWNLOAD_PLAN_LABEL,
  markerUnsupported: T.UNSUPPORTED_MARKER_TEXT,
  markerWatchdog: T.WATCHDOG_MARKER_TEXT,
  markerFailed: T.FAILED_MARKER_TEXT,
  wardsHeading: 'Wards',
  wardsInMemory: T.WARDS_IN_MEMORY_TEXT,
  wardsEditor: T.WARDS_EDITOR_LABEL,
  wardsErrors: T.WARDS_ERRORS_LABEL,
  wardsErrorLines: 'Lines with errors:',
  resetWards: T.RESET_WARDS_LABEL,
  downloadWards: T.DOWNLOAD_WARDS_LABEL,
  staleWards: T.STALE_WARDS_TEXT,

  noticesLabel: 'Notices',
  dismiss: 'Dismiss',
  sqlStartFailed: T.SQL_START_FAILED_TEXT,
  notices: {},
};

const KO_CAPTIONS: TourCaptions = {
  copy: '세계를 복사합니다: 파일과 데이터베이스를 이 페이지 안에 복사합니다.',
  ghost: '유령이 복사본에서 먼저 계획을 실행하고 바뀐 것을 기록합니다.',
  judgeIdle: '결계가 바뀐 것을 판정합니다.',
  outBlock: '촛불이 꺼졌습니다. 명령은 막히고 에이전트는 이유를 받습니다.',
  loop: '에이전트가 계획을 고쳐 유령을 다시 보냅니다.',
  loopRun: '다음: 계획을 고친 뒤(시나리오 1, 2는 고친 계획 적용) 유령을 다시 보내세요.',
  flicker: '촛불이 흔들립니다. 복사본 밖 부작용이 있어 사람이 판단합니다.',
  lit: '촛불이 켜졌습니다. 어긴 결계가 없으니 이제야 실제 에이전트가 실행할 수 있습니다.',
  litPlayground: '촛불이 켜졌습니다. 어긴 결계가 없으니 이제야 실제 에이전트가 실행할 수 있습니다(이 페이지는 여기서 멈춥니다).',
  introPlan: '에이전트가 명령을 계획합니다: DROP TABLE users.',
  introJudge: '결계 판정: 사용자 행이 모두 사라집니다.',
  introFixPlan: '새 계획: 테이블을 백업하고, 행은 삭제 표시만 합니다.',
  introFixJudge: '결계 판정: 잃는 행이 없습니다.',
  runJudgePass: '결계 판정: 어긴 결계가 없습니다.',
  runPlan: (command, moreSteps) => `에이전트의 계획: ${command}${moreSteps > 0 ? ` (외 ${moreSteps}개)` : ''}`,
  runJudge: (reason) => `결계 판정: ${reason}`,
};

export const KO: Strings = {
  lang: 'ko',
  switchLabel: 'English',
  switchHref: './',
  switchLang: 'en',

  brand: P.APP_BRAND,
  eyebrow: '플레이그라운드',
  tagline: '에이전트의 유령이 먼저 해 보게 하세요.',
  lead: '코딩 에이전트가 셸이나 SQL 명령을 실행하기 전에, 그 유령이 프로젝트 복사본에서 먼저 실행합니다. 결계가 바뀐 것을 판정하고, 촛불이 꺼지면 명령은 막히고 에이전트는 그 이유를 받습니다.',
  points: ['이 탭 안에서 실행', '각본 계획, LLM 없음', '가짜 비밀값만 사용'],
  footer: 'Ghost Run+, MIT 라이선스, Kiroween 2026 출품작',

  flowHeading: '유령이 통과한 계획만 현실에서 실행됩니다.',
  flowSummary:
    '흐름도: 에이전트가 명령을 계획하면 세계를 복사하고, 유령이 복사본에서 먼저 실행합니다. 결계가 바뀐 것을 판정합니다. 촛불이 꺼지면 명령을 막고 이유를 에이전트에게 돌려주며, 에이전트는 계획을 고칩니다. 촛불이 흔들리면 복사본 밖 부작용이 있어 사람이 판단합니다. 촛불이 켜지면 모든 결계를 통과한 것이고, 실제 명령을 실행할 수 있습니다.',
  flowNodes: {
    plan: { title: '에이전트의 계획', sub: '셸 명령, SQL, 로봇 동작' },
    copy: { title: '세계를 복사한다', sub: '복사본: 파일, DB, 물리' },
    ghost: { title: '유령이 먼저 실행', sub: '바뀌는 것과 행동을 기록' },
    judge: { title: '결계 판정', sub: '촛불' },
    out: { title: '꺼짐: 막는다', sub: '이유를 에이전트에게 돌려줌' },
    flicker: { title: '흔들림: 사람 승인', sub: '복사본 밖 부작용이 있을 때' },
    lit: { title: '켜짐: 실제 실행', sub: '모든 결계를 통과' },
  },
  flowJudgeSub: { idle: '촛불', lit: '촛불 켜짐', flickering: '촛불 흔들림', out: '촛불 꺼짐' },
  flowEdgeFix: '계획을 고친다',
  flowEdgeApproved: '승인하면',
  flowReplay: '다시 보기',
  flowPill: { block: '촛불 꺼짐', warn: '흔들림', pass: '촛불 켜짐' },
  captions: KO_CAPTIONS,

  stepPick: '1단계',
  scenariosHeading: '시나리오',
  scenariosHint: '시나리오를 고르고 유령을 실행해 지켜보세요.',
  scenariosIntro: '시나리오를 고르세요. 모두 에이전트가 할 법한 각본 계획입니다.',
  scenarioSelector: '시나리오 선택',
  scenarioTitles: {
    1: 'users 테이블 삭제',
    2: 'data와 build 삭제',
    3: 'README에 빙의',
    4: '테스트 실행',
    5: 'npm clean 실행',
  },
  scenarioCards: {
    1: { tag: 'SQL', blurb: '에이전트가 DROP TABLE 한 줄로 데이터베이스를 정리하려 합니다. 모든 사용자가 그 테이블에 있습니다.' },
    2: { tag: '파일', blurb: '깨끗한 빌드를 위해 rm -rf부터 실행합니다. data 폴더가 함께 휘말립니다.' },
    3: { tag: '빙의', blurb: 'README에 숨은 보이지 않는 글자가 .env를 설정 서버로 보내라고 지시합니다.' },
    4: { tag: '테스트', blurb: '평범한 명령입니다. 조용한 유령 실행이 어떻게 보이는지 확인해 보세요.' },
    5: { tag: 'npm 스크립트', blurb: 'npm run clean은 무해해 보이지만, 그 뒤의 스크립트는 data/를 지웁니다.' },
  },
  selected: '선택됨',
  fixedPlanHint: '고친 계획 적용은 시나리오 1, 2의 수정된 계획을 실행합니다.',
  runGhost: '유령 실행',
  applyFixedPlan: '고친 계획 적용',

  stepRun: '2단계',
  runHeading: '유령 실행 결과',
  dockerBoxNotUsed: '이 페이지는 Docker 상자(실제 모드)를 쓰지 않습니다.',
  noRun: '아직 유령 실행이 없습니다.',
  noRunHint: '시나리오를 고르고 유령 실행을 누르세요.',
  p1Failed: '유령 실행이 현실을 바꿨습니다. 플레이그라운드의 버그입니다.',
  messagePanel: '에이전트가 받는 메시지',
  runDetails: '모든 변경, 단계별로',
  p2Meaning: 'P2는 플레이그라운드 세계에서만 성립합니다. 실제 모드의 셸 세계에는 주장하지 않습니다.',
  p2NotClaimedUnsupported: '이번 실행에는 P2를 주장하지 않습니다. 지원하지 않는 단계가 있어 리허설하지 못했습니다.',
  p2NotClaimedWatchdog: '이번 실행에는 P2를 주장하지 않습니다. SQL 감시 장치가 단계를 멈췄습니다.',
  p5p6Scope:
    '지원하지 않는 단계가 있는 실행에는 P5와 P6을 주장하지 않습니다. 비밀을 압축하거나 암호화하거나 DNS로 빼내는 것은 내용 검사 밖이며, 행동 기준으로만 잡힙니다.',

  stage: {
    realTitle: '현실',
    realSub: '유령 실행 전',
    copyTitle: '유령 복사본',
    copySub: '유령이 계획을 실행한 뒤',
    outsideTitle: '복사본 밖',
    rowsWord: '행',
    tableDropped: '테이블 삭제됨',
    secretTag: '비밀 읽음',
    afterReadPrefix: '',
    afterReadSuffix: ' 읽은 뒤',
    statusTag: { same: '', deleted: '삭제', created: '새로 생김', changed: '변경' },
    stamp: { block: '결계가 막음', warn: '사람이 판단', pass: '결계가 허용' },
  },

  stepInspect: '3단계',
  inspectHeading: '자세히 보기',
  inspectIntro:
    '묘지는 막힌 명령을 모두 보관합니다. 붉은 실과 블랙라이트는 빙의된 행동이 어디서 왔는지 보여 줍니다. 결계는 무엇이 피해인지 정합니다.',
  possessionHeading: '빙의',
  purify: '정화',
  purifyNote: '정화는 메모리 속 복사본의 README 글만 바꿉니다. 계획을 다시 실행하거나 파일을 쓰지 않습니다.',
  possessionAction: '비밀을 읽은 뒤 승인되지 않은 곳으로 네트워크를 시도하면, 숨은 글자가 있든 없든 행동만으로 막습니다.',
  canary: '이 데모의 비밀값은 가짜 카나리 값이고, 주소는 예약된 예시 도메인입니다.',
  graveyardDropped: '가장 오래된 막힌 명령을 지웠습니다(최대 200개).',

  stepTools: '직접 해 보기',
  toolsHeading: '계획을 쓰고, 결계를 조정하기',
  toolsIntro: '명령을 입력해 계획을 만들거나 계획 파일을 불러오고, 유령을 판정하는 결계를 고쳐 보세요. 여기서 바꾼 것은 저장되지 않습니다.',
  planHeading: '계획',
  planName: '계획 이름:',
  planNote: '메모:',
  planFixture: '프로젝트 픽스처:',
  scriptedPlan: '각본 계획: 이 페이지의 LLM이 정한 것이 아닙니다.',
  recordedPlan: '녹화된 계획: 여기서 다시 재생할 뿐, 이 페이지의 LLM이 정한 것이 아닙니다.',
  planSteps: '계획 단계',
  removeStep: '단계 삭제',
  commandInput: '명령',
  addToPlan: '계획에 추가',
  clearPlan: '계획 비우기',
  loadPlan: '계획 파일 불러오기',
  downloadPlan: '계획 파일 받기',
  markerUnsupported: '지원 안 됨',
  markerWatchdog: '감시 시간 초과',
  markerFailed: '실패',
  wardsHeading: '결계',
  wardsInMemory: '이 편집은 메모리 속 복사본입니다. 저장되지 않으며, 함께 배포된 wards.yaml 파일은 바뀌지 않습니다.',
  wardsEditor: 'wards.yaml 편집기',
  wardsErrors: 'wards.yaml 오류',
  wardsErrorLines: '오류가 있는 줄:',
  resetWards: '기본값으로',
  downloadWards: 'wards.yaml 받기',
  staleWards: '이전 결과: wards.yaml에 오류가 있습니다',

  noticesLabel: '알림',
  dismiss: '닫기',
  sqlStartFailed: 'SQL 엔진을 시작하지 못했습니다.',
  notices: {
    [T.EMPTY_PLAN_TEXT]: '계획이 비어 있습니다. 먼저 명령을 추가하세요.',
    [T.RUN_FAILED_TEXT]: '플레이그라운드가 이 계획을 실행하지 못했습니다.',
  },
};

export const STRINGS: Readonly<Record<Locale, Strings>> = { en: EN, ko: KO };
