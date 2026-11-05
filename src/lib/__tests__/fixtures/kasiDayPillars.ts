// Independent reference: KASI solar/lunar conversion service,
// https://astro.kasi.re.kr/life/pageView/8 (GET /life/solc?yyyy=&mm=&dd=).
// Retrieved 2026-11-04. Fields: SOLC_JD (Julian Day Number) and LUNC_ILJIN (일진).
// Copied by script from the JSON responses.

export const KASI_DAY_PILLARS: readonly { date: string; jd: number; ganji: string }[] = [
  { date: '1900-01-01', jd: 2415021, ganji: '甲戌' }, // 갑술
  { date: '1900-02-28', jd: 2415079, ganji: '壬申' }, // 임신
  { date: '1900-03-01', jd: 2415080, ganji: '癸酉' }, // 계유
  { date: '1904-02-28', jd: 2416539, ganji: '壬辰' }, // 임진
  { date: '1904-02-29', jd: 2416540, ganji: '癸巳' }, // 계사
  { date: '1904-03-01', jd: 2416541, ganji: '甲午' }, // 갑오
  { date: '1949-10-01', jd: 2433191, ganji: '甲子' }, // 갑자
  { date: '1970-01-01', jd: 2440588, ganji: '辛巳' }, // 신사
  { date: '1987-05-10', jd: 2446926, ganji: '己未' }, // 기미
  { date: '1988-10-09', jd: 2447444, ganji: '丁酉' }, // 정유
  { date: '1999-12-31', jd: 2451544, ganji: '丁巳' }, // 정사
  { date: '2000-01-01', jd: 2451545, ganji: '戊午' }, // 무오
  { date: '2000-02-28', jd: 2451603, ganji: '丙辰' }, // 병진
  { date: '2000-02-29', jd: 2451604, ganji: '丁巳' }, // 정사
  { date: '2000-03-01', jd: 2451605, ganji: '戊午' }, // 무오
  { date: '2019-01-01', jd: 2458485, ganji: '戊戌' }, // 무술
  { date: '2019-01-06', jd: 2458490, ganji: '癸卯' }, // 계묘
  { date: '2019-12-31', jd: 2458849, ganji: '壬寅' }, // 임인
  { date: '2020-01-01', jd: 2458850, ganji: '癸卯' }, // 계묘
  { date: '2020-02-29', jd: 2458909, ganji: '壬寅' }, // 임인
  { date: '2023-01-31', jd: 2459976, ganji: '己丑' }, // 기축
  { date: '2023-02-01', jd: 2459977, ganji: '庚寅' }, // 경인
  { date: '2023-04-30', jd: 2460065, ganji: '戊午' }, // 무오
  { date: '2023-05-01', jd: 2460066, ganji: '己未' }, // 기미
  { date: '2024-02-04', jd: 2460345, ganji: '戊戌' }, // 무술
  { date: '2024-02-29', jd: 2460370, ganji: '癸亥' }, // 계해
  { date: '2024-03-01', jd: 2460371, ganji: '甲子' }, // 갑자
  { date: '2024-12-31', jd: 2460676, ganji: '己巳' }, // 기사
  { date: '2025-01-01', jd: 2460677, ganji: '庚午' }, // 경오
  { date: '2026-02-17', jd: 2461089, ganji: '壬戌' }, // 임술
  { date: '2026-11-04', jd: 2461349, ganji: '壬午' }, // 임오
  { date: '2026-11-09', jd: 2461354, ganji: '丁亥' }, // 정해
  { date: '2027-01-01', jd: 2461407, ganji: '庚辰' }, // 경진
  { date: '2027-12-31', jd: 2461771, ganji: '甲申' }, // 갑신
  { date: '2028-02-29', jd: 2461831, ganji: '甲申' }, // 갑신
  { date: '2028-12-31', jd: 2462137, ganji: '庚寅' }, // 경인
  { date: '2050-12-31', jd: 2470172, ganji: '乙酉' }, // 을유
];
