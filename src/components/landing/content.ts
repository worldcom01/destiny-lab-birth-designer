// R5.10 — landing copy. Every product statement here is checked against the shipped R4 code:
//   Mode A: medically permitted date range + daily time windows (a confirmation checkbox is required),
//           surname, gender, optional generation character / styles / images → EVERY permitted
//           name·date·time combination ranked; the list shows 20 at a time (+20 per "더 보기");
//           the PDF holds the top 20 combinations
//   Mode B: confirmed birth date and time → ALL generated candidates ranked; 20 at a time (+20); PDF top 20
//   Mode C: confirmed birth date and time, gender + up to 10 full candidate names → ranking and grades
//   Results: overall score of the combination + component breakdown, grade SS/S/A/B/C, suggested Hanja with
//           the legal-status label, PDF report download (all three modes)
//   Data: the analysis runs in the browser; inputs and Hanja choices are stored in this browser
//         (localStorage / IndexedDB); the app sends no analysis data to a server.
// Deliberately absent: prices, access periods, refund terms, accounts/cloud saving (not launched),
// testimonials, user counts, "AI" claims (the engine is a rule-based scoring model), medical advice.

export const HERO = {
  eyebrow: 'Destiny Lab · Birth Designer V2',
  titleLines: ['한 사람의 시작을,', '더 깊이 설계하다.'],
  subtitle: '출생 가능 일정과 이름 후보를 함께 탐색하고, 여러 기준이 교차하는 결과를 한눈에 비교하세요.',
  primaryCta: '분석 시작하기',
  secondaryCta: '어떻게 분석하나요?',
  medicalNote: '출산 일정은 언제나 담당 의료진의 판단이 우선합니다.',
};

export const VALUES = [
  {
    title: '허용된 범위 안에서만',
    body: '의료진이 허용한 날짜와 시간대만 계산합니다. 범위 밖의 일정은 만들거나 추천하지 않습니다.',
  },
  {
    title: '여러 기준을 한 화면에',
    body: '사주 오행·음양 균형, 이름의 발음과 조화, 현대성까지 항목별 점수와 가중치를 함께 보여줍니다.',
  },
  {
    title: '근거를 숨기지 않는 결과',
    body: '종합 점수가 어떻게 구성되는지, 한자의 인명용 여부가 확인되었는지까지 결과에 그대로 표시합니다.',
  },
];

export const MODES = [
  {
    id: 'A', href: '/mode-a', title: '출생 설계', lead: '출생 일정과 이름을 함께',
    body: '의료진이 허용한 기간과 시간대 안의 날짜·시간·이름 조합을 모두 계산해 종합 점수 순으로 비교합니다. 결과는 20개씩 펼쳐 보고, PDF에는 상위 20개 조합을 담습니다.',
    inputs: ['허용된 출산 기간과 시간대', '성씨 · 성별', '돌림자 · 스타일 · 이미지(선택)'],
    cta: 'Mode A로 시작하기',
  },
  {
    id: 'B', href: '/mode-b', title: '이름 설계', lead: '출생 일시가 정해졌다면',
    body: '확정된 출생일과 시간을 기준으로 이름 후보를 만들고, 생성된 후보 전체를 종합 점수 순으로 정리합니다. 처음 20개를 보여주고 20개씩 더 볼 수 있습니다.',
    inputs: ['확정된 출생일 · 출생 시간', '성씨 · 성별', '돌림자 · 스타일 · 이미지(선택)'],
    cta: 'Mode B로 시작하기',
  },
  {
    id: 'C', href: '/mode-c', title: '이름 평가', lead: '생각해 둔 이름이 있다면',
    body: '준비한 이름 후보를 최대 10개까지 입력하면, 확정된 출생 일시와의 조화를 평가해 순위와 등급으로 비교합니다.',
    inputs: ['확정된 출생일 · 출생 시간', '성별', '성을 포함한 이름 후보(최대 10개)'],
    cta: 'Mode C로 시작하기',
  },
] as const;

export const STEPS = [
  { title: '정보 입력', body: '모드를 고르고 필요한 정보를 입력합니다. Mode A는 의료진이 허용한 일정 범위를 입력하고 확인합니다.' },
  { title: '조합 비교', body: '허용된 범위 안의 날짜·시간과 이름 후보를 같은 기준으로 계산해 비교합니다.' },
  { title: '유력 후보 검토', body: '종합 점수와 등급, 항목별 점수, 한자 정보를 보며 마음에 드는 후보를 좁혀갑니다.' },
  { title: '상세 결과 · PDF', body: '후보별 상세 분석을 확인하고, 결과를 PDF 리포트로 내려받아 가족과 함께 볼 수 있습니다.' },
];

export const SAFETY = [
  '이 서비스는 의료적 안전성이나 적절한 출산 시점을 판단하지 않습니다. 출산 일정은 담당 의료진과 결정하세요.',
  '점수는 전통 명리학·성명학 기준을 수치로 정리한 참고 정보이며, 건강·성격·발달이나 미래를 예측하지 않습니다.',
  '한자의 인명용 여부는 결과에 표시된 상태를 참고하고, 출생신고 전 대법원 전자가족관계등록시스템 등에서 확인해야 합니다.',
];

export const PRICING = {
  title: '이용 안내',
  status: '요금 안내 준비 중',
  body: '유료 이용권의 요금과 조건은 아직 확정되지 않았습니다. 확정되면 이 페이지와 이용약관에 먼저 안내하겠습니다.',
  items: ['요금과 이용 범위', '이용 기간', '취소 · 환불 기준'],
};

export const FAQ = [
  {
    q: 'Birth Designer는 무엇인가요?',
    a: '출생 가능 일정과 이름 후보를 전통 명리학·성명학 기준으로 계산해 한 화면에서 비교할 수 있게 돕는 의사결정 보조 도구입니다. 정답을 정해 주는 서비스가 아니라, 여러 선택지를 같은 기준으로 살펴보도록 돕습니다.',
  },
  {
    q: 'Mode A, B, C는 어떻게 다른가요?',
    a: 'Mode A는 의료진이 허용한 기간·시간대 안에서 날짜·시간·이름 조합을 함께 비교합니다. Mode B는 출생 일시가 확정된 경우 이름 후보를 만들어 비교하고, Mode C는 직접 준비한 이름 후보(최대 10개)를 평가해 순위를 보여줍니다.',
  },
  {
    q: '분석 결과는 어떻게 이해하면 되나요?',
    a: '종합 점수는 날짜·시간·이름이 함께 이루는 조합에 대한 점수이며, 항목별 점수와 가중치가 함께 표시됩니다. 등급(SS·S·A·B·C)은 종합 점수 구간입니다. 전통적인 기준에 따른 참고 정보일 뿐, 아이의 성격이나 미래를 예측하거나 보장하지 않습니다.',
  },
  {
    q: '의료진의 판단을 대신하나요?',
    a: '아니요. 이 서비스는 의료적 안전성이나 출산 시점을 판단하지 않습니다. Mode A는 의료진이 허용한 범위로 입력한 날짜·시간만 계산하며, 범위 밖의 일정은 추천하지 않습니다. 출산과 관련된 결정은 언제나 담당 의료진의 판단이 우선합니다.',
  },
  {
    q: '결과를 저장하거나 내려받을 수 있나요?',
    a: '결과 화면에서 PDF 리포트를 내려받을 수 있습니다. 입력한 정보와 한자 선택은 지금 사용하는 브라우저에 저장되어 같은 기기·브라우저에서 다시 불러올 수 있습니다. 계정에 저장하는 기능은 아직 제공하지 않습니다.',
  },
  {
    q: '입력한 정보는 어떻게 처리되나요?',
    a: '현재 분석 화면은 입력값을 서비스 서버로 보내지 않고 브라우저 안에서 계산합니다. 입력값과 한자 선택은 이 기기의 브라우저 저장소에만 보관되며, 브라우저의 사이트 데이터를 지우면 함께 삭제됩니다. 자세한 내용은 공개 예정인 개인정보처리방침에서 안내합니다.',
  },
];

export const FINAL_CTA = {
  title: '지금, 첫 비교를 시작해 보세요.',
  body: '모드를 고르고 필요한 정보만 입력하면 됩니다.',
  cta: '분석 시작하기',
};

/** Legal/business items: not published yet — rendered as text, never as dead links. */
export const LEGAL_PENDING = ['이용약관', '개인정보처리방침', '취소 · 환불 정책', '사업자 정보'];
