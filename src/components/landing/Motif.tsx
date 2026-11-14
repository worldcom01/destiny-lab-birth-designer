import s from './landing.module.css';

/**
 * Brand motif (decorative, local SVG): a slowly turning time dial with two overlapping circles
 * — the permitted schedule and the name candidates — whose intersection is the comparison space.
 */
export default function Motif({ className = '' }: { className?: string }) {
  const ticks = Array.from({ length: 48 }, (_, i) => i);
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="bd-left"><circle cx="168" cy="210" r="112" /></clipPath>
        <radialGradient id="bd-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4f43c9" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#4f43c9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="196" fill="url(#bd-glow)" />
      <g className={s.dial}>
        <circle cx="200" cy="200" r="176" fill="none" stroke="#d8d2c4" strokeWidth="1" />
        {ticks.map(i => {
          const major = i % 4 === 0;
          const a = (i / 48) * Math.PI * 2;
          const r1 = major ? 162 : 168, r2 = 176;
          return (
            <line key={i}
              x1={200 + r1 * Math.sin(a)} y1={200 - r1 * Math.cos(a)} x2={200 + r2 * Math.sin(a)} y2={200 - r2 * Math.cos(a)}
              stroke={major ? '#8f88c9' : '#cfc8b8'} strokeWidth={major ? 1.6 : 1} strokeLinecap="round" />
          );
        })}
        <circle cx="200" cy="24" r="4" fill="#4f43c9" />
      </g>
      <circle cx="168" cy="210" r="112" fill="none" stroke="#17171c" strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx="232" cy="190" r="112" fill="none" stroke="#17171c" strokeOpacity="0.55" strokeWidth="1.2" />
      <g className={s.lens}>
        <circle cx="232" cy="190" r="112" fill="#4f43c9" fillOpacity="0.14" clipPath="url(#bd-left)" />
      </g>
      <circle cx="200" cy="200" r="5" fill="#4f43c9" />
      <circle cx="200" cy="200" r="13" fill="none" stroke="#4f43c9" strokeOpacity="0.5" />
    </svg>
  );
}
