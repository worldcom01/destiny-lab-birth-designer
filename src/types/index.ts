export type OhaengType = '목' | '화' | '토' | '금' | '수';
export type YinYangType = '양' | '음';
export type Gender = '남' | '여';
export type AnalysisLevel = '간단' | '정밀';
export type Grade = 'SS' | 'S' | 'A' | 'B' | 'C';

// ─── 한자 선택 상태 ───────────────────────────────────────────────────────────
export interface HanjaSelectionState {
  surnameHanja: string;          // e.g., "金"
  surnameStrokes: number;
  surnameJaWon: OhaengType;
  dolrimHanja?: string;          // e.g., "珉"
  dolrimStrokes?: number;
  dolrimJaWon?: OhaengType;
  // 이름 글자별 선택 (results에서 사용)
  char1Hanja?: string;
  char1Strokes?: number;
  char1JaWon?: OhaengType;
  char2Hanja?: string;
  char2Strokes?: number;
  char2JaWon?: OhaengType;
}

export type ImageType =
  | '리더형'
  | '학자형'
  | '예술형'
  | '사업가형'
  | '창의형'
  | '균형형'
  | '건강중심형'
  | '글로벌형'
  | '대인관계형';

// ─── 이름 스타일 선호도 ─────────────────────────────────────────────────────────
export type NameStyle =
  | '현대형'
  | '전통형'
  | '고급형'
  | '지적인 느낌'
  | '부드러운 느낌'
  | '리더형'
  | '글로벌형'
  | '예술형';

export const NAME_STYLE_LABELS: Record<NameStyle, { icon: string; desc: string }> = {
  '현대형':      { icon: '✨', desc: '최신 트렌드 반영' },
  '전통형':      { icon: '📜', desc: '전통적 의미 중심' },
  '고급형':      { icon: '💎', desc: '세련되고 고급스러운' },
  '지적인 느낌': { icon: '📚', desc: '학습·지식 성향' },
  '부드러운 느낌':{ icon: '🌸', desc: '온화하고 부드러운' },
  '리더형':      { icon: '⚡', desc: '리더십·강한 기운' },
  '글로벌형':    { icon: '🌐', desc: '국제감각·친숙한 발음' },
  '예술형':      { icon: '🎨', desc: '창의적·예술적 감성' },
};

export interface Pillar {
  stemIndex: number;
  branchIndex: number;
  label: string;
  stemOhaeng: OhaengType;
  branchOhaeng: OhaengType;
  stemYinYang: YinYangType;
  branchYinYang: YinYangType;
}

export interface FourPillars {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
}

export interface OhaengBalance {
  목: number;
  화: number;
  토: number;
  금: number;
  수: number;
}

export interface NameCharData {
  hangul: string;
  hanja: string;
  meaning: string;
  ohaeng: OhaengType;
  yinyang: YinYangType;
  gender: 'male' | 'female' | 'neutral';
  modernity: number;        // 0-100: 2020-2024 실제 출생신고 기반 현대 선호도
  positivity: number;       // 0-100: 의미 긍정성
  nameStyleFit: NameStyle[]; // 이름 스타일 분류
  images: ImageType[];
}

export interface GeneratedName {
  full: string;     // 성 + 이름 (e.g., 김민준)
  surname: string;  // 성 (e.g., 김)
  given: string;    // 이름 (e.g., 민준)
  gender: Gender;
  char1: NameCharData;
  char2: NameCharData;
  nameQualityScore: number;
}

export interface NameAnalysis {
  name: string;
  given: string;
  pronunciationOhaeng: OhaengType[];
  nameOhaengBalance: OhaengBalance;
  hanja: string;
  meanings: string[];
  rhythmScore: number;
  pronunciationScore: number;
  readabilityScore: number;
  modernityScore: number;
  imageMatchScore: number;
}

export interface Scores {
  sajuOhaengBalance: number;
  yinYangHarmony: number;
  nameHarmony: number;
  pronunciationStability: number;
  hanjaQuality: number;
  modernPreference: number;        // 현대 이름 선호도 (20%)
  pronunciationNaturalness: number; // 발음 자연스러움 (10%)
  // legacy alias kept for PDF compatibility
  modernUsability: number;
  imageMatch: number;
  overall: number;
}

export interface AnalysisResult {
  id: string;
  name: GeneratedName;
  date: Date;
  hour: number;
  fourPillars: FourPillars;
  sajuOhaengBalance: OhaengBalance;
  combinedOhaengBalance: OhaengBalance;
  nameAnalysis: NameAnalysis;
  scores: Scores;
  grade: Grade;
  characteristics: string[];
  description: string;
  imageMatches: ImageType[];
  rank?: number;
}

export interface DesignerInput {
  startDate: string;
  endDate: string;
  surname: string;
  gender: Gender;
  dolrimChar: string;
  dolrimPosition: 'first' | 'second' | 'auto';
  images: ImageType[];
  nameStyles: NameStyle[];   // NEW: 이름 스타일 선호도
  analysisLevel: AnalysisLevel;
}

// ─── Mode B Input ────────────────────────────────────────────────────────────
export interface ModeBInput {
  birthDate: string;       // e.g. "2027-07-04"
  birthHour: number;       // 0-23
  surname: string;
  gender: Gender;
  dolrimChar: string;
  dolrimPosition: 'first' | 'second' | 'auto';
  images: ImageType[];
  nameStyles: NameStyle[];   // NEW
}

// ─── Mode C Input ────────────────────────────────────────────────────────────
export interface ModeCInput {
  birthDate: string;
  birthHour: number;
  gender: Gender;
  names: string[];         // user-provided full names e.g. ["김민준", "김도윤"]
}

// 시진 선택지
export const SIJIN_OPTIONS = [
  { hour: 23, label: '자시 (子時)', range: '오후 11시 ~ 오전 1시', hanja: '子' },
  { hour: 1,  label: '축시 (丑時)', range: '오전 1시 ~ 3시',       hanja: '丑' },
  { hour: 3,  label: '인시 (寅時)', range: '오전 3시 ~ 5시',       hanja: '寅' },
  { hour: 5,  label: '묘시 (卯時)', range: '오전 5시 ~ 7시',       hanja: '卯' },
  { hour: 7,  label: '진시 (辰時)', range: '오전 7시 ~ 9시',       hanja: '辰' },
  { hour: 9,  label: '사시 (巳時)', range: '오전 9시 ~ 11시',      hanja: '巳' },
  { hour: 11, label: '오시 (午時)', range: '오전 11시 ~ 오후 1시', hanja: '午' },
  { hour: 13, label: '미시 (未時)', range: '오후 1시 ~ 3시',       hanja: '未' },
  { hour: 15, label: '신시 (申時)', range: '오후 3시 ~ 5시',       hanja: '申' },
  { hour: 17, label: '유시 (酉時)', range: '오후 5시 ~ 7시',       hanja: '酉' },
  { hour: 19, label: '술시 (戌時)', range: '오후 7시 ~ 9시',       hanja: '戌' },
  { hour: 21, label: '해시 (亥時)', range: '오후 9시 ~ 11시',      hanja: '亥' },
] as const;

export const OHAENG_COLORS: Record<OhaengType, string> = {
  목: '#16A34A',
  화: '#EF4444',
  토: '#CA8A04',
  금: '#64748B',
  수: '#2563EB',
};

export const OHAENG_KR: Record<OhaengType, string> = {
  목: '木 목',
  화: '火 화',
  토: '土 토',
  금: '金 금',
  수: '水 수',
};

export const GRADE_CONFIG: Record<Grade, {
  label: string;
  description: string;
  textColor: string;
  bgFrom: string;
  bgTo: string;
  ring: string;
}> = {
  SS: { label: 'SS', description: '최고 조화도', textColor: 'text-amber-800', bgFrom: 'from-amber-400', bgTo: 'to-yellow-500', ring: 'ring-2 ring-amber-400' },
  S:  { label: 'S',  description: '우수 조화도', textColor: 'text-indigo-800', bgFrom: 'from-indigo-500', bgTo: 'to-violet-600', ring: 'ring-2 ring-indigo-400' },
  A:  { label: 'A',  description: '양호 조화도', textColor: 'text-emerald-800', bgFrom: 'from-emerald-500', bgTo: 'to-teal-600', ring: 'ring-2 ring-emerald-400' },
  B:  { label: 'B',  description: '보통 조화도', textColor: 'text-blue-800', bgFrom: 'from-blue-500', bgTo: 'to-cyan-600', ring: 'ring-1 ring-blue-300' },
  C:  { label: 'C',  description: '기본 조화도', textColor: 'text-slate-700', bgFrom: 'from-slate-400', bgTo: 'to-slate-500', ring: 'ring-1 ring-slate-200' },
};

export const IMAGE_LABELS: Record<ImageType, { icon: string; desc: string }> = {
  '리더형':    { icon: '⚡', desc: '리더십·추진력' },
  '학자형':    { icon: '📚', desc: '학습·지식추구' },
  '예술형':    { icon: '🎨', desc: '예술·감수성' },
  '사업가형':  { icon: '💼', desc: '실용·경영감각' },
  '창의형':    { icon: '✨', desc: '창의·혁신성향' },
  '균형형':    { icon: '⚖️', desc: '조화·균형잡힌 성장' },
  '건강중심형':{ icon: '🌿', desc: '건강·자연친화' },
  '글로벌형':  { icon: '🌐', desc: '국제감각·소통' },
  '대인관계형':{ icon: '🤝', desc: '친화력·협동성' },
};
