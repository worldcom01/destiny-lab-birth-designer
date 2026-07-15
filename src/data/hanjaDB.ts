import { OhaengType } from '@/types';

export interface HanjaOption {
  hanja: string;
  meaning: string;       // e.g., "뛰어날 준"
  fullMeaning: string;   // e.g., "재능이 뛰어나고 빼어난 인물"
  strokes: number;
  radical: string;       // 부수
  jaWonOhaeng: OhaengType;   // 자원오행 (부수 기반)
  usageFreq: number;     // 0-100 사용 빈도
  modernPref: number;    // 0-100 현대 선호도
  positivity: number;    // 0-100 의미 긍정성
}

// 획수 → 수리오행
export function getSuriOhaeng(strokes: number): OhaengType {
  const d = strokes % 10;
  if (d === 1 || d === 2) return '목';
  if (d === 3 || d === 4) return '화';
  if (d === 5 || d === 6) return '토';
  if (d === 7 || d === 8) return '금';
  return '수'; // 9 or 0
}

// ─── 이름 글자 한자 데이터베이스 ─────────────────────────────────────────────

export const HANJA_DB: Record<string, HanjaOption[]> = {

  // ── 남아용 ───────────────────────────────────────────────────────────────

  '준': [
    { hanja: '俊', meaning: '뛰어날 준', fullMeaning: '재능이 뛰어나고 빼어난 인물', strokes: 9,  radical: '人', jaWonOhaeng: '화', usageFreq: 95, modernPref: 92, positivity: 95 },
    { hanja: '峻', meaning: '높을 준',   fullMeaning: '산처럼 높고 굳건한 기상',    strokes: 10, radical: '山', jaWonOhaeng: '토', usageFreq: 80, modernPref: 83, positivity: 90 },
    { hanja: '準', meaning: '기준 준',   fullMeaning: '올바른 기준과 원칙을 세움',  strokes: 13, radical: '水', jaWonOhaeng: '수', usageFreq: 65, modernPref: 70, positivity: 85 },
    { hanja: '駿', meaning: '준마 준',   fullMeaning: '빠르고 뛰어난 준마처럼',    strokes: 17, radical: '馬', jaWonOhaeng: '화', usageFreq: 55, modernPref: 65, positivity: 88 },
  ],
  '민': [
    { hanja: '珉', meaning: '옥돌 민',   fullMeaning: '옥처럼 고귀하고 맑은 품성', strokes: 10, radical: '玉', jaWonOhaeng: '금', usageFreq: 88, modernPref: 92, positivity: 92 },
    { hanja: '敏', meaning: '민첩할 민', fullMeaning: '총명하고 민첩한 지혜',       strokes: 11, radical: '攴', jaWonOhaeng: '금', usageFreq: 85, modernPref: 88, positivity: 90 },
    { hanja: '旼', meaning: '부드러울 민', fullMeaning: '온화하고 부드러운 품성',   strokes: 8,  radical: '日', jaWonOhaeng: '화', usageFreq: 75, modernPref: 82, positivity: 88 },
    { hanja: '旻', meaning: '하늘 민',   fullMeaning: '드넓은 하늘처럼 큰 기상',   strokes: 8,  radical: '日', jaWonOhaeng: '화', usageFreq: 72, modernPref: 80, positivity: 90 },
    { hanja: '民', meaning: '백성 민',   fullMeaning: '사람들과 함께하는 넓은 마음',strokes: 5,  radical: '氏', jaWonOhaeng: '토', usageFreq: 60, modernPref: 62, positivity: 80 },
  ],
  '서': [
    { hanja: '瑞', meaning: '상서로울 서', fullMeaning: '상서로운 기운이 가득함', strokes: 13, radical: '玉', jaWonOhaeng: '금', usageFreq: 90, modernPref: 93, positivity: 97 },
    { hanja: '書', meaning: '글 서',      fullMeaning: '학문과 지식을 사랑하는',  strokes: 10, radical: '日', jaWonOhaeng: '화', usageFreq: 82, modernPref: 80, positivity: 90 },
    { hanja: '緖', meaning: '실마리 서',  fullMeaning: '모든 일의 실마리를 찾는', strokes: 15, radical: '糸', jaWonOhaeng: '목', usageFreq: 62, modernPref: 68, positivity: 80 },
  ],
  '현': [
    { hanja: '賢', meaning: '어질 현',  fullMeaning: '덕과 지혜를 겸비한 인물', strokes: 15, radical: '貝', jaWonOhaeng: '수', usageFreq: 85, modernPref: 86, positivity: 97 },
    { hanja: '炫', meaning: '빛날 현',  fullMeaning: '불꽃처럼 빛나는 재능',    strokes: 9,  radical: '火', jaWonOhaeng: '화', usageFreq: 80, modernPref: 85, positivity: 90 },
    { hanja: '玄', meaning: '검을 현',  fullMeaning: '깊고 오묘한 지혜',        strokes: 5,  radical: '玄', jaWonOhaeng: '수', usageFreq: 75, modernPref: 78, positivity: 82 },
    { hanja: '鉉', meaning: '쇠줄 현',  fullMeaning: '굳건하고 의연한 성품',    strokes: 13, radical: '金', jaWonOhaeng: '금', usageFreq: 65, modernPref: 68, positivity: 78 },
  ],
  '우': [
    { hanja: '宇', meaning: '집 우',   fullMeaning: '온 세상을 품는 넓은 기상', strokes: 6,  radical: '宀', jaWonOhaeng: '토', usageFreq: 82, modernPref: 83, positivity: 90 },
    { hanja: '佑', meaning: '도울 우', fullMeaning: '남을 돕고 베푸는 마음',    strokes: 7,  radical: '人', jaWonOhaeng: '화', usageFreq: 85, modernPref: 86, positivity: 92 },
    { hanja: '羽', meaning: '깃 우',   fullMeaning: '높이 날아오르는 기상',     strokes: 6,  radical: '羽', jaWonOhaeng: '목', usageFreq: 68, modernPref: 72, positivity: 85 },
  ],
  '도': [
    { hanja: '道', meaning: '길 도',   fullMeaning: '올바른 길을 걷는 삶',    strokes: 12, radical: '辵', jaWonOhaeng: '토', usageFreq: 78, modernPref: 78, positivity: 92 },
    { hanja: '導', meaning: '이끌 도', fullMeaning: '많은 이를 이끄는 리더',  strokes: 15, radical: '寸', jaWonOhaeng: '화', usageFreq: 65, modernPref: 70, positivity: 90 },
  ],
  '진': [
    { hanja: '眞', meaning: '참 진',  fullMeaning: '진실되고 거짓없는 성품', strokes: 10, radical: '目', jaWonOhaeng: '토', usageFreq: 88, modernPref: 88, positivity: 97 },
    { hanja: '珍', meaning: '보배 진', fullMeaning: '귀하고 소중한 존재',    strokes: 9,  radical: '玉', jaWonOhaeng: '금', usageFreq: 82, modernPref: 85, positivity: 95 },
    { hanja: '振', meaning: '떨칠 진', fullMeaning: '기운차게 기상을 떨침',   strokes: 10, radical: '手', jaWonOhaeng: '목', usageFreq: 78, modernPref: 78, positivity: 88 },
    { hanja: '晉', meaning: '나아갈 진', fullMeaning: '발전하고 앞으로 나아감', strokes: 10, radical: '日', jaWonOhaeng: '화', usageFreq: 70, modernPref: 72, positivity: 90 },
  ],
  '재': [
    { hanja: '才', meaning: '재주 재',  fullMeaning: '타고난 재능과 능력',     strokes: 3,  radical: '手', jaWonOhaeng: '목', usageFreq: 72, modernPref: 75, positivity: 92 },
    { hanja: '宰', meaning: '재상 재',  fullMeaning: '큰 뜻을 품은 지도자',   strokes: 10, radical: '宀', jaWonOhaeng: '토', usageFreq: 65, modernPref: 68, positivity: 88 },
    { hanja: '在', meaning: '있을 재',  fullMeaning: '존재감있는 당당한 인물', strokes: 6,  radical: '土', jaWonOhaeng: '토', usageFreq: 60, modernPref: 65, positivity: 82 },
  ],
  '혁': [
    { hanja: '赫', meaning: '빛날 혁',  fullMeaning: '찬란히 빛나는 명성',    strokes: 14, radical: '赤', jaWonOhaeng: '화', usageFreq: 78, modernPref: 76, positivity: 90 },
    { hanja: '爀', meaning: '빛날 혁',  fullMeaning: '불처럼 타오르는 열정',  strokes: 17, radical: '火', jaWonOhaeng: '화', usageFreq: 65, modernPref: 68, positivity: 85 },
  ],
  '성': [
    { hanja: '誠', meaning: '성실할 성', fullMeaning: '진실하고 성실한 삶의 자세', strokes: 13, radical: '言', jaWonOhaeng: '토', usageFreq: 82, modernPref: 83, positivity: 97 },
    { hanja: '聖', meaning: '성인 성',   fullMeaning: '높은 덕성을 지닌 인물',    strokes: 13, radical: '耳', jaWonOhaeng: '토', usageFreq: 80, modernPref: 80, positivity: 95 },
    { hanja: '成', meaning: '이룰 성',   fullMeaning: '모든 일을 이루어내는',     strokes: 6,  radical: '戈', jaWonOhaeng: '금', usageFreq: 75, modernPref: 78, positivity: 90 },
  ],
  '호': [
    { hanja: '昊', meaning: '넓은 하늘 호', fullMeaning: '하늘처럼 드넓은 기상',  strokes: 8,  radical: '日', jaWonOhaeng: '화', usageFreq: 78, modernPref: 82, positivity: 92 },
    { hanja: '浩', meaning: '넓을 호',      fullMeaning: '물처럼 넓고 깊은 마음',  strokes: 10, radical: '水', jaWonOhaeng: '수', usageFreq: 75, modernPref: 78, positivity: 90 },
  ],
  '찬': [
    { hanja: '燦', meaning: '빛날 찬',  fullMeaning: '찬란히 빛나는 성품',    strokes: 17, radical: '火', jaWonOhaeng: '화', usageFreq: 82, modernPref: 85, positivity: 93 },
    { hanja: '瓚', meaning: '옥잔 찬',  fullMeaning: '고귀하고 빛나는 가치',  strokes: 23, radical: '玉', jaWonOhaeng: '금', usageFreq: 55, modernPref: 62, positivity: 88 },
  ],
  '건': [
    { hanja: '健', meaning: '건강할 건', fullMeaning: '건강하고 씩씩한 기상',   strokes: 11, radical: '人', jaWonOhaeng: '화', usageFreq: 82, modernPref: 82, positivity: 93 },
    { hanja: '乾', meaning: '하늘 건',  fullMeaning: '하늘처럼 강건한 기상',   strokes: 11, radical: '乙', jaWonOhaeng: '금', usageFreq: 65, modernPref: 68, positivity: 88 },
  ],
  '승': [
    { hanja: '昇', meaning: '오를 승',  fullMeaning: '높이 오르는 기운',      strokes: 8,  radical: '日', jaWonOhaeng: '화', usageFreq: 80, modernPref: 82, positivity: 92 },
    { hanja: '承', meaning: '이을 승',  fullMeaning: '전통과 뜻을 이어받음',  strokes: 8,  radical: '手', jaWonOhaeng: '목', usageFreq: 75, modernPref: 76, positivity: 88 },
    { hanja: '勝', meaning: '이길 승',  fullMeaning: '뛰어난 능력으로 성취',  strokes: 12, radical: '力', jaWonOhaeng: '목', usageFreq: 68, modernPref: 72, positivity: 88 },
  ],
  '태': [
    { hanja: '泰', meaning: '클 태',   fullMeaning: '물처럼 넉넉하고 큰 인물', strokes: 10, radical: '水', jaWonOhaeng: '수', usageFreq: 78, modernPref: 80, positivity: 92 },
    { hanja: '太', meaning: '클 태',   fullMeaning: '크고 당당한 기상',        strokes: 4,  radical: '大', jaWonOhaeng: '토', usageFreq: 65, modernPref: 68, positivity: 88 },
  ],
  '원': [
    { hanja: '源', meaning: '근원 원', fullMeaning: '모든 것의 근원이 되는 힘', strokes: 13, radical: '水', jaWonOhaeng: '수', usageFreq: 78, modernPref: 80, positivity: 90 },
    { hanja: '元', meaning: '으뜸 원', fullMeaning: '으뜸가는 능력과 품성',    strokes: 4,  radical: '儿', jaWonOhaeng: '화', usageFreq: 72, modernPref: 75, positivity: 90 },
    { hanja: '遠', meaning: '멀 원',  fullMeaning: '원대한 꿈을 향해 나아감', strokes: 13, radical: '辵', jaWonOhaeng: '토', usageFreq: 60, modernPref: 65, positivity: 88 },
  ],
  '선': [
    { hanja: '善', meaning: '착할 선', fullMeaning: '선하고 착한 마음씨',      strokes: 12, radical: '口', jaWonOhaeng: '토', usageFreq: 85, modernPref: 85, positivity: 98 },
    { hanja: '宣', meaning: '펼칠 선', fullMeaning: '뜻을 널리 펼치는 인물',   strokes: 9,  radical: '宀', jaWonOhaeng: '토', usageFreq: 78, modernPref: 80, positivity: 90 },
  ],
  '인': [
    { hanja: '仁', meaning: '어질 인', fullMeaning: '어진 덕을 갖춘 인물',    strokes: 4,  radical: '人', jaWonOhaeng: '화', usageFreq: 80, modernPref: 80, positivity: 97 },
    { hanja: '印', meaning: '도장 인', fullMeaning: '확실하고 분명한 존재감', strokes: 6,  radical: '卩', jaWonOhaeng: '금', usageFreq: 55, modernPref: 58, positivity: 78 },
  ],
  '석': [
    { hanja: '碩', meaning: '클 석',  fullMeaning: '크고 훌륭한 학자의 기질', strokes: 14, radical: '石', jaWonOhaeng: '토', usageFreq: 72, modernPref: 75, positivity: 90 },
    { hanja: '錫', meaning: '주석 석', fullMeaning: '귀하고 쓸모있는 인재',    strokes: 16, radical: '金', jaWonOhaeng: '금', usageFreq: 60, modernPref: 62, positivity: 82 },
    { hanja: '晳', meaning: '밝을 석', fullMeaning: '총명하고 밝은 지혜',      strokes: 12, radical: '日', jaWonOhaeng: '화', usageFreq: 65, modernPref: 68, positivity: 88 },
  ],
  '창': [
    { hanja: '昌', meaning: '창성할 창', fullMeaning: '번창하고 성대한 기운',   strokes: 8,  radical: '日', jaWonOhaeng: '화', usageFreq: 75, modernPref: 78, positivity: 92 },
    { hanja: '彰', meaning: '나타날 창', fullMeaning: '재능이 드러나는 인물',   strokes: 14, radical: '彡', jaWonOhaeng: '목', usageFreq: 68, modernPref: 72, positivity: 88 },
  ],
  '윤': [
    { hanja: '潤', meaning: '윤택할 윤', fullMeaning: '넉넉하고 풍요로운 삶',  strokes: 15, radical: '水', jaWonOhaeng: '수', usageFreq: 90, modernPref: 92, positivity: 93 },
    { hanja: '允', meaning: '진실 윤',  fullMeaning: '진실되고 믿음직한 성품', strokes: 4,  radical: '儿', jaWonOhaeng: '화', usageFreq: 80, modernPref: 82, positivity: 90 },
  ],
  '규': [
    { hanja: '奎', meaning: '별 규',  fullMeaning: '빛나는 별자리같은 존재',  strokes: 9,  radical: '大', jaWonOhaeng: '토', usageFreq: 72, modernPref: 75, positivity: 88 },
    { hanja: '圭', meaning: '옥 규',  fullMeaning: '옥처럼 귀하고 고운 성품', strokes: 6,  radical: '土', jaWonOhaeng: '토', usageFreq: 68, modernPref: 70, positivity: 88 },
  ],
  '율': [
    { hanja: '律', meaning: '법칙 율', fullMeaning: '바른 도리를 지키는 인물', strokes: 9,  radical: '彳', jaWonOhaeng: '화', usageFreq: 85, modernPref: 88, positivity: 90 },
    { hanja: '栗', meaning: '밤나무 율', fullMeaning: '굳건하고 알찬 생명력', strokes: 10, radical: '木', jaWonOhaeng: '목', usageFreq: 75, modernPref: 80, positivity: 88 },
  ],
  '하': [
    { hanja: '夏', meaning: '여름 하', fullMeaning: '활기차고 풍성한 기운',   strokes: 10, radical: '夂', jaWonOhaeng: '화', usageFreq: 88, modernPref: 90, positivity: 90 },
    { hanja: '河', meaning: '강 하',  fullMeaning: '유유히 흐르는 큰 강처럼', strokes: 8,  radical: '水', jaWonOhaeng: '수', usageFreq: 72, modernPref: 75, positivity: 85 },
    { hanja: '賀', meaning: '축하 하', fullMeaning: '기쁨과 축복이 가득한 삶', strokes: 12, radical: '貝', jaWonOhaeng: '수', usageFreq: 68, modernPref: 70, positivity: 95 },
  ],
  '지': [
    { hanja: '智', meaning: '지혜 지', fullMeaning: '총명하고 지혜로운 성품',  strokes: 12, radical: '日', jaWonOhaeng: '화', usageFreq: 90, modernPref: 92, positivity: 97 },
    { hanja: '志', meaning: '뜻 지',  fullMeaning: '큰 뜻과 포부를 가진',    strokes: 7,  radical: '心', jaWonOhaeng: '화', usageFreq: 80, modernPref: 82, positivity: 92 },
    { hanja: '芝', meaning: '지초 지', fullMeaning: '상서로운 풀처럼 복된 기운', strokes: 7, radical: '艹', jaWonOhaeng: '목', usageFreq: 85, modernPref: 88, positivity: 92 },
  ],
  '수': [
    { hanja: '秀', meaning: '빼어날 수', fullMeaning: '뛰어나고 출중한 재능',    strokes: 7,  radical: '禾', jaWonOhaeng: '목', usageFreq: 82, modernPref: 82, positivity: 93 },
    { hanja: '洙', meaning: '물가 수',   fullMeaning: '맑은 물가처럼 청아한',    strokes: 9,  radical: '水', jaWonOhaeng: '수', usageFreq: 68, modernPref: 70, positivity: 82 },
    { hanja: '受', meaning: '받을 수',   fullMeaning: '복을 받아들이는',          strokes: 8,  radical: '又', jaWonOhaeng: '목', usageFreq: 60, modernPref: 62, positivity: 82 },
  ],
  '빛': [
    { hanja: '光', meaning: '빛 광',  fullMeaning: '밝게 빛나는 존재',        strokes: 6,  radical: '人', jaWonOhaeng: '화', usageFreq: 80, modernPref: 82, positivity: 93 },
    { hanja: '炳', meaning: '빛날 병', fullMeaning: '불처럼 밝게 빛나는',      strokes: 9,  radical: '火', jaWonOhaeng: '화', usageFreq: 72, modernPref: 75, positivity: 90 },
  ],
  '온': [
    { hanja: '溫', meaning: '따뜻할 온', fullMeaning: '따뜻하고 온화한 성품',  strokes: 13, radical: '水', jaWonOhaeng: '수', usageFreq: 90, modernPref: 92, positivity: 97 },
  ],
  '빈': [
    { hanja: '彬', meaning: '빛날 빈',  fullMeaning: '문채나고 빛나는 성품',  strokes: 11, radical: '彡', jaWonOhaeng: '목', usageFreq: 85, modernPref: 88, positivity: 90 },
    { hanja: '斌', meaning: '빛날 빈',  fullMeaning: '문무를 겸비한 인물',    strokes: 12, radical: '文', jaWonOhaeng: '목', usageFreq: 78, modernPref: 80, positivity: 90 },
  ],
  '한': [
    { hanja: '翰', meaning: '깃 한',  fullMeaning: '높이 날아오르는 큰 꿈', strokes: 16, radical: '羽', jaWonOhaeng: '목', usageFreq: 82, modernPref: 85, positivity: 90 },
    { hanja: '漢', meaning: '한수 한', fullMeaning: '한강처럼 넓고 큰 기상', strokes: 14, radical: '水', jaWonOhaeng: '수', usageFreq: 72, modernPref: 72, positivity: 85 },
  ],
  '상': [
    { hanja: '祥', meaning: '상서 상',  fullMeaning: '좋은 조짐과 복된 기운', strokes: 10, radical: '示', jaWonOhaeng: '토', usageFreq: 80, modernPref: 82, positivity: 95 },
    { hanja: '尙', meaning: '오히려 상', fullMeaning: '높고 고상한 기품',      strokes: 8,  radical: '小', jaWonOhaeng: '토', usageFreq: 70, modernPref: 72, positivity: 85 },
  ],

  // ── 여아용 ───────────────────────────────────────────────────────────────

  '아': [
    { hanja: '雅', meaning: '아름다울 아', fullMeaning: '우아하고 고상한 기품',   strokes: 12, radical: '隹', jaWonOhaeng: '금', usageFreq: 92, modernPref: 95, positivity: 97 },
    { hanja: '娥', meaning: '예쁠 아',    fullMeaning: '달처럼 아름다운 자태',    strokes: 10, radical: '女', jaWonOhaeng: '토', usageFreq: 75, modernPref: 78, positivity: 92 },
  ],
  '연': [
    { hanja: '蓮', meaning: '연꽃 연',  fullMeaning: '청아하고 고운 연꽃처럼',    strokes: 15, radical: '艹', jaWonOhaeng: '목', usageFreq: 85, modernPref: 85, positivity: 95 },
    { hanja: '燕', meaning: '제비 연',  fullMeaning: '제비처럼 자유롭고 활발한',  strokes: 16, radical: '火', jaWonOhaeng: '화', usageFreq: 72, modernPref: 75, positivity: 88 },
    { hanja: '妍', meaning: '고울 연',  fullMeaning: '아름답고 고운 자태',        strokes: 7,  radical: '女', jaWonOhaeng: '토', usageFreq: 80, modernPref: 82, positivity: 92 },
  ],
  '은': [
    { hanja: '恩', meaning: '은혜 은',  fullMeaning: '은혜를 베풀고 받는 기운',  strokes: 10, radical: '心', jaWonOhaeng: '화', usageFreq: 88, modernPref: 88, positivity: 97 },
    { hanja: '銀', meaning: '은 은',    fullMeaning: '은처럼 귀하고 빛나는',     strokes: 14, radical: '金', jaWonOhaeng: '금', usageFreq: 75, modernPref: 78, positivity: 88 },
    { hanja: '殷', meaning: '성할 은',  fullMeaning: '풍성하고 번성하는 기운',   strokes: 10, radical: '殳', jaWonOhaeng: '금', usageFreq: 65, modernPref: 68, positivity: 85 },
  ],
  '유': [
    { hanja: '侑', meaning: '도울 유',  fullMeaning: '도움을 주고 나누는 마음',  strokes: 8,  radical: '人', jaWonOhaeng: '화', usageFreq: 88, modernPref: 90, positivity: 92 },
    { hanja: '柔', meaning: '부드러울 유', fullMeaning: '부드럽고 유연한 성품',  strokes: 9,  radical: '木', jaWonOhaeng: '목', usageFreq: 85, modernPref: 88, positivity: 90 },
    { hanja: '瑜', meaning: '옥빛 유',  fullMeaning: '옥처럼 빛나는 아름다움', strokes: 13, radical: '玉', jaWonOhaeng: '금', usageFreq: 82, modernPref: 85, positivity: 93 },
  ],
  '채': [
    { hanja: '彩', meaning: '채색 채',  fullMeaning: '다채롭고 아름다운 재능',    strokes: 11, radical: '彡', jaWonOhaeng: '목', usageFreq: 90, modernPref: 92, positivity: 95 },
    { hanja: '菜', meaning: '나물 채',  fullMeaning: '자연처럼 싱그럽고 건강한', strokes: 12, radical: '艹', jaWonOhaeng: '목', usageFreq: 70, modernPref: 72, positivity: 85 },
  ],
  '미': [
    { hanja: '美', meaning: '아름다울 미', fullMeaning: '아름답고 뛰어난 품성',   strokes: 9,  radical: '羊', jaWonOhaeng: '토', usageFreq: 88, modernPref: 88, positivity: 97 },
    { hanja: '渼', meaning: '물결 미',    fullMeaning: '물결처럼 아름다운',       strokes: 12, radical: '水', jaWonOhaeng: '수', usageFreq: 72, modernPref: 78, positivity: 90 },
  ],
  '혜': [
    { hanja: '慧', meaning: '지혜로울 혜', fullMeaning: '총명하고 지혜로운 성품', strokes: 15, radical: '心', jaWonOhaeng: '화', usageFreq: 85, modernPref: 85, positivity: 97 },
    { hanja: '惠', meaning: '은혜 혜',    fullMeaning: '사랑과 은혜가 넘치는',    strokes: 12, radical: '心', jaWonOhaeng: '화', usageFreq: 80, modernPref: 80, positivity: 95 },
  ],
  '예': [
    { hanja: '藝', meaning: '재주 예',  fullMeaning: '뛰어난 예술적 재능',      strokes: 19, radical: '艹', jaWonOhaeng: '목', usageFreq: 88, modernPref: 90, positivity: 93 },
    { hanja: '禮', meaning: '예의 예',  fullMeaning: '예의바르고 고상한 성품',  strokes: 18, radical: '示', jaWonOhaeng: '토', usageFreq: 75, modernPref: 75, positivity: 90 },
    { hanja: '睿', meaning: '밝을 예',  fullMeaning: '총명하고 빛나는 지혜',    strokes: 14, radical: '目', jaWonOhaeng: '토', usageFreq: 82, modernPref: 85, positivity: 92 },
  ],
  '희': [
    { hanja: '熙', meaning: '빛날 희',  fullMeaning: '따뜻하게 빛나는 성품',    strokes: 13, radical: '火', jaWonOhaeng: '화', usageFreq: 80, modernPref: 80, positivity: 92 },
    { hanja: '喜', meaning: '기쁠 희',  fullMeaning: '기쁨이 가득한 삶',        strokes: 12, radical: '口', jaWonOhaeng: '토', usageFreq: 72, modernPref: 75, positivity: 97 },
  ],
  '주': [
    { hanja: '珠', meaning: '구슬 주',  fullMeaning: '구슬처럼 빛나는 귀한 존재', strokes: 10, radical: '玉', jaWonOhaeng: '금', usageFreq: 82, modernPref: 83, positivity: 93 },
    { hanja: '朱', meaning: '붉을 주',  fullMeaning: '따뜻하고 열정적인 기운',   strokes: 6,  radical: '木', jaWonOhaeng: '목', usageFreq: 70, modernPref: 72, positivity: 85 },
    { hanja: '株', meaning: '그루 주',  fullMeaning: '굳건하게 뿌리내린 기운',  strokes: 10, radical: '木', jaWonOhaeng: '목', usageFreq: 55, modernPref: 58, positivity: 80 },
  ],
  '소': [
    { hanja: '素', meaning: '본바탕 소', fullMeaning: '순수하고 꾸밈없는 마음',   strokes: 10, radical: '糸', jaWonOhaeng: '목', usageFreq: 85, modernPref: 87, positivity: 93 },
    { hanja: '昭', meaning: '밝을 소',   fullMeaning: '밝고 환한 빛처럼',         strokes: 9,  radical: '日', jaWonOhaeng: '화', usageFreq: 78, modernPref: 80, positivity: 90 },
  ],
  '린': [
    { hanja: '琳', meaning: '옥 림',  fullMeaning: '옥처럼 맑고 고운 성품',      strokes: 12, radical: '玉', jaWonOhaeng: '금', usageFreq: 88, modernPref: 90, positivity: 93 },
    { hanja: '麟', meaning: '기린 린', fullMeaning: '상서로운 기린처럼 귀한',    strokes: 23, radical: '鹿', jaWonOhaeng: '토', usageFreq: 68, modernPref: 72, positivity: 92 },
  ],
  '슬': [
    { hanja: '瑟', meaning: '거문고 슬', fullMeaning: '아름다운 선율처럼 조화로운', strokes: 13, radical: '玉', jaWonOhaeng: '금', usageFreq: 82, modernPref: 85, positivity: 90 },
  ],
  '나': [
    { hanja: '娜', meaning: '아름다울 나', fullMeaning: '아름답고 사랑스러운 모습', strokes: 10, radical: '女', jaWonOhaeng: '토', usageFreq: 85, modernPref: 87, positivity: 92 },
    { hanja: '羅', meaning: '비단 나',    fullMeaning: '곱고 부드러운 비단처럼',   strokes: 19, radical: '网', jaWonOhaeng: '목', usageFreq: 70, modernPref: 72, positivity: 85 },
  ],
  '가': [
    { hanja: '佳', meaning: '아름다울 가', fullMeaning: '아름답고 훌륭한 성품',   strokes: 8,  radical: '人', jaWonOhaeng: '화', usageFreq: 90, modernPref: 93, positivity: 97 },
    { hanja: '嘉', meaning: '아름다울 가', fullMeaning: '아름답고 훌륭하여 칭찬받음', strokes: 14, radical: '口', jaWonOhaeng: '토', usageFreq: 82, modernPref: 85, positivity: 95 },
  ],
  '이': [
    { hanja: '怡', meaning: '기쁠 이',  fullMeaning: '기쁨을 나누는 밝은 성품',  strokes: 8,  radical: '心', jaWonOhaeng: '화', usageFreq: 88, modernPref: 90, positivity: 95 },
    { hanja: '伊', meaning: '저 이',    fullMeaning: '아름다운 존재 그 자체',     strokes: 6,  radical: '人', jaWonOhaeng: '화', usageFreq: 82, modernPref: 85, positivity: 88 },
  ],
  '별': [
    // 別: 음독 '별', 星(성)의 훈 '별'과 혼동 주의. 여기서는 음독 기준 수록.
    { hanja: '別', meaning: '특별할 별', fullMeaning: '특별하고 고유한 존재', strokes: 7, radical: '刀', jaWonOhaeng: '금', usageFreq: 72, modernPref: 80, positivity: 90 },
    { hanja: '彆', meaning: '굽을 별',   fullMeaning: '굽히지 않는 곧은 기상', strokes: 18, radical: '弓', jaWonOhaeng: '목', usageFreq: 25, modernPref: 40, positivity: 78 },
  ],
};

// ─── 성씨 한자 데이터베이스 ───────────────────────────────────────────────────

export interface SurnameHanja {
  hangul: string;
  hanja: string;
  meaning: string;
  strokes: number;
  radical: string;
  jaWonOhaeng: OhaengType;
  origin: string;   // 유래
}

export const SURNAME_HANJA_DB: SurnameHanja[] = [
  { hangul: '김', hanja: '金', meaning: '쇠 금',    strokes: 8,  radical: '金', jaWonOhaeng: '금', origin: '신라 경주 김씨 / 가야 김해 김씨' },
  { hangul: '이', hanja: '李', meaning: '오얏 이',  strokes: 7,  radical: '木', jaWonOhaeng: '목', origin: '전주 이씨 / 경주 이씨' },
  { hangul: '박', hanja: '朴', meaning: '박 박',    strokes: 6,  radical: '木', jaWonOhaeng: '목', origin: '신라 개국 시조 박혁거세' },
  { hangul: '최', hanja: '崔', meaning: '높을 최',  strokes: 11, radical: '山', jaWonOhaeng: '토', origin: '경주 최씨' },
  { hangul: '정', hanja: '鄭', meaning: '정나라 정', strokes: 15, radical: '邑', jaWonOhaeng: '토', origin: '하동 정씨 / 경주 정씨' },
  { hangul: '강', hanja: '姜', meaning: '생강 강',  strokes: 9,  radical: '女', jaWonOhaeng: '토', origin: '진주 강씨' },
  { hangul: '조', hanja: '趙', meaning: '나라 조',  strokes: 14, radical: '走', jaWonOhaeng: '화', origin: '한양 조씨 / 풍양 조씨' },
  { hangul: '윤', hanja: '尹', meaning: '다스릴 윤', strokes: 4,  radical: '尸', jaWonOhaeng: '화', origin: '파평 윤씨' },
  { hangul: '장', hanja: '張', meaning: '베풀 장',  strokes: 11, radical: '弓', jaWonOhaeng: '목', origin: '인동 장씨' },
  { hangul: '임', hanja: '林', meaning: '수풀 림',  strokes: 8,  radical: '木', jaWonOhaeng: '목', origin: '평택 임씨 / 부안 임씨' },
  { hangul: '한', hanja: '韓', meaning: '나라 한',  strokes: 17, radical: '韋', jaWonOhaeng: '금', origin: '청주 한씨' },
  { hangul: '오', hanja: '吳', meaning: '나라 오',  strokes: 7,  radical: '口', jaWonOhaeng: '토', origin: '해주 오씨' },
  { hangul: '서', hanja: '徐', meaning: '천천히 서', strokes: 10, radical: '彳', jaWonOhaeng: '화', origin: '이천 서씨 / 달성 서씨' },
  { hangul: '신', hanja: '申', meaning: '납 신',    strokes: 5,  radical: '田', jaWonOhaeng: '토', origin: '고령 신씨' },
  { hangul: '권', hanja: '權', meaning: '권세 권',  strokes: 22, radical: '木', jaWonOhaeng: '목', origin: '안동 권씨' },
  { hangul: '황', hanja: '黃', meaning: '누를 황',  strokes: 12, radical: '黃', jaWonOhaeng: '토', origin: '장수 황씨' },
  { hangul: '안', hanja: '安', meaning: '편안 안',  strokes: 6,  radical: '宀', jaWonOhaeng: '토', origin: '순흥 안씨' },
  { hangul: '송', hanja: '宋', meaning: '나라 송',  strokes: 7,  radical: '宀', jaWonOhaeng: '토', origin: '여산 송씨' },
  { hangul: '류', hanja: '柳', meaning: '버드나무 류', strokes: 9, radical: '木', jaWonOhaeng: '목', origin: '진주 류씨' },
  { hangul: '홍', hanja: '洪', meaning: '넓을 홍',  strokes: 9,  radical: '水', jaWonOhaeng: '수', origin: '남양 홍씨' },
  { hangul: '전', hanja: '全', meaning: '온전 전',  strokes: 6,  radical: '人', jaWonOhaeng: '화', origin: '천안 전씨' },
  { hangul: '고', hanja: '高', meaning: '높을 고',  strokes: 10, radical: '高', jaWonOhaeng: '토', origin: '제주 고씨 / 개성 고씨' },
  { hangul: '문', hanja: '文', meaning: '글 문',    strokes: 4,  radical: '文', jaWonOhaeng: '목', origin: '남평 문씨' },
  { hangul: '양', hanja: '梁', meaning: '들보 양',  strokes: 11, radical: '木', jaWonOhaeng: '목', origin: '남원 양씨' },
  { hangul: '손', hanja: '孫', meaning: '손자 손',  strokes: 10, radical: '子', jaWonOhaeng: '수', origin: '밀양 손씨 / 경주 손씨' },
  { hangul: '배', hanja: '裵', meaning: '성씨 배',  strokes: 14, radical: '衣', jaWonOhaeng: '목', origin: '성주 배씨' },
  { hangul: '백', hanja: '白', meaning: '흰 백',    strokes: 5,  radical: '白', jaWonOhaeng: '금', origin: '수원 백씨' },
  { hangul: '허', hanja: '許', meaning: '허락 허',  strokes: 11, radical: '言', jaWonOhaeng: '토', origin: '양천 허씨 / 김해 허씨' },
  { hangul: '남', hanja: '南', meaning: '남쪽 남',  strokes: 9,  radical: '十', jaWonOhaeng: '화', origin: '의령 남씨' },
];

// 성씨 한글로 검색
export function findSurnameHanja(hangul: string): SurnameHanja | undefined {
  return SURNAME_HANJA_DB.find(s => s.hangul === hangul);
}

// 이름 글자의 한자 옵션 조회
export function getHanjaOptions(hangul: string): HanjaOption[] {
  return HANJA_DB[hangul] ?? [];
}

// 추천 한자 선택 (오행 보완 기준)
export function getRecommendedHanja(
  hangul: string,
  neededOhaeng: OhaengType | null,
): HanjaOption | undefined {
  const opts = HANJA_DB[hangul];
  if (!opts || opts.length === 0) return undefined;

  if (!neededOhaeng) {
    // 오행 기준 없을 때: 현대 선호도 + 긍정성 가중 점수로 선택
    return [...opts].sort((a, b) =>
      (b.modernPref * 0.5 + b.positivity * 0.5) - (a.modernPref * 0.5 + a.positivity * 0.5)
    )[0];
  }

  // 자원오행이 필요한 오행과 일치하는 것 우선, 그 중 현대 선호도 높은 것
  const matching = opts.filter(o => o.jaWonOhaeng === neededOhaeng);
  if (matching.length > 0) {
    return [...matching].sort((a, b) => b.modernPref - a.modernPref)[0];
  }
  // 없으면 수리오행으로 재시도
  const suriMatch = opts.filter(o => getSuriOhaeng(o.strokes) === neededOhaeng);
  if (suriMatch.length > 0) return suriMatch[0];
  // 그래도 없으면 기본값
  return opts[0];
}
