import { ImageResponse } from 'next/og';

// R5.10 — Open Graph image for the landing page, served at /birth/og. A route handler (not the
// opengraph-image file convention) because the file convention emits the image URL WITHOUT the
// basePath, which on www.destiny-code.kr would resolve to the root site's own image.
// Latin text only: the built-in font has no Hangul glyphs and no external font is fetched.
export const dynamic = 'force-static';
const size = { width: 1200, height: 630 };

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#faf8f3', padding: '72px 80px', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
          <div style={{ display: 'flex', fontSize: 28, color: '#4f43c9', letterSpacing: 4 }}>DESTINY LAB</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: '#17171c', letterSpacing: -3 }}>Birth Designer</div>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 700, color: '#17171c', letterSpacing: -3 }}>V2</div>
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#64646e' }}>Birth windows × name candidates, compared side by side</div>
        </div>
        <div style={{ position: 'absolute', right: 120, top: 150, width: 330, height: 330, borderRadius: 330, border: '2px solid rgba(23,23,28,0.55)', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 40, top: 110, width: 330, height: 330, borderRadius: 330, border: '2px solid rgba(23,23,28,0.55)', background: 'rgba(79,67,201,0.10)', display: 'flex' }} />
        <div style={{ position: 'absolute', right: 196, top: 268, width: 14, height: 14, borderRadius: 14, background: '#4f43c9', display: 'flex' }} />
      </div>
    ),
    size,
  );
}
