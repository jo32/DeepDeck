import { ImageResponse } from 'next/og';
const size = { width: 1200, height: 630 };
export const dynamic = 'force-static';
export function GET() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', background: '#172420', color: '#fff', display: 'flex', flexDirection: 'column', padding: '55px 70px', fontFamily: 'sans-serif' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b8d1bf', fontSize: 20 }}><span>DeepDeck / Field Notes 001</span><span>September 2026</span></div>
    <div style={{ display: 'flex', fontSize: 80, letterSpacing: -4, lineHeight: 1.07, marginTop: 62 }}>Explore once.</div>
    <div style={{ display: 'flex', fontSize: 80, letterSpacing: -4, lineHeight: 1.07, color: '#caf3cf' }}>Build on it.</div>
    <div style={{ display: 'flex', color: '#b8d1bf', fontSize: 25, marginTop: 26 }}>Three experiments on the potential of WebMCP.</div>
    <div style={{ display: 'flex', gap: 66, borderTop: '1px solid #3d5246', paddingTop: 30, marginTop: 45, fontSize: 23 }}><span>Books / 36.2% less time</span><span>X / 10.3% less time</span><span>HN / 3 of 3 complete</span></div>
  </div>, size);
}
