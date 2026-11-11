// R4.1B review ORDERING AID (macOS only; CoreText/AppKit system frameworks).
// Scores how similar each official glyph image is to candidate characters rendered in
// local CJK fonts. The output only orders suggestions in the human review tool; it is
// NEVER legal evidence and never confirms anything.
// usage: swiftc -O glyph-suggest.swift -o glyph-suggest
//        ./glyph-suggest <imagesDir(png|bmp)> <listFile: imageId\tcandidates> <out.tsv>
// out.tsv: imageId \t char:score,char:score,... (top 5, best first)
import AppKit
import CoreText
let S = 48
func bitmap(_ draw: (CGContext) -> Void, _ w: Int, _ h: Int) -> [UInt8] {
  var px = [UInt8](repeating: 255, count: w * h)
  let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  ctx.setFillColor(gray: 1, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h)); draw(ctx); return px
}
func normalize(_ px: [UInt8], _ w: Int, _ h: Int) -> [Float]? {
  var minX = w, minY = h, maxX = -1, maxY = -1
  for y in 0..<h { for x in 0..<w where px[y*w+x] < 128 { minX = min(minX,x); maxX = max(maxX,x); minY = min(minY,y); maxY = max(maxY,y) } }
  if maxX < 0 { return nil }
  let bw = maxX-minX+1, bh = maxY-minY+1, side = max(bw,bh)
  var out = [Float](repeating: 0, count: S*S)
  for oy in 0..<S { for ox in 0..<S {
    // area-sample the square box centred on the glyph bounding box
    var acc: Float = 0, n: Float = 0
    for sy in 0..<2 { for sx in 0..<2 {
      let fx = Float(minX) + (Float(ox) + (Float(sx)+0.5)/2) * Float(side)/Float(S) - Float(side-bw)/2
      let fy = Float(minY) + (Float(oy) + (Float(sy)+0.5)/2) * Float(side)/Float(S) - Float(side-bh)/2
      let ix = Int(fx), iy = Int(fy)
      if ix >= 0 && ix < w && iy >= 0 && iy < h { acc += px[iy*w+ix] < 128 ? 1 : 0 }
      n += 1 } }
    out[oy*S+ox] = acc/n } }
  return out
}
func corr(_ a: [Float], _ b: [Float]) -> Float {
  let n = Float(a.count); let ma = a.reduce(0,+)/n, mb = b.reduce(0,+)/n
  var s: Float = 0, sa: Float = 0, sb: Float = 0
  for i in 0..<a.count { let x = a[i]-ma, y = b[i]-mb; s += x*y; sa += x*x; sb += y*y }
  return s / (sa.squareRoot()*sb.squareRoot() + 1e-9)
}
let fonts = ["AppleMyungjo", "Songti TC", "Songti SC", "Hiragino Mincho ProN", "STSong"].compactMap { name -> CTFont? in
  let f = CTFontCreateWithName(name as CFString, 64, nil); return (CTFontCopyFullName(f) as String).isEmpty ? nil : f }
func renderChar(_ ch: String, _ font: CTFont) -> [Float]? {
  // only if the font really has the glyph (no fallback substitution)
  var chars = Array(ch.utf16); var glyphs = [CGGlyph](repeating: 0, count: chars.count)
  guard CTFontGetGlyphsForCharacters(font, &chars, &glyphs, chars.count), glyphs[0] != 0 else { return nil }
  let w = 96, h = 96
  let px = bitmap({ ctx in ctx.setFillColor(gray: 0, alpha: 1); var pos = CGPoint(x: 16, y: 20); CTFontDrawGlyphs(font, &glyphs, &pos, 1, ctx) }, w, h)
  return normalize(px, w, h)
}
let args = CommandLine.arguments
let dir = args[1]; let lines = try! String(contentsOfFile: args[2], encoding: .utf8).split(separator: "\n")
var out = ""
var cache = [String: [[Float]]]()
for line in lines {
  let parts = line.split(separator: "\t"); let id = String(parts[0]); let cands = parts.count > 1 ? parts[1].map(String.init) : []
  guard let img = NSImage(contentsOfFile: "\(dir)/\(id).png") ?? NSImage(contentsOfFile: "\(dir)/\(id).bmp"), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { out += "\(id)\t\n"; continue }
  let w = cg.width, h = cg.height
  let px = bitmap({ ctx in ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h)) }, w, h)
  guard let v = normalize(px, w, h) else { out += "\(id)\t\n"; continue }
  var scored: [(String, Float, Int)] = []
  for c in cands {
    if cache[c] == nil { cache[c] = fonts.map { renderChar(c, $0) ?? [] } }
    var best: Float = -1, bf = -1
    for (fi, r) in cache[c]!.enumerated() where !r.isEmpty { let s = corr(v, r); if s > best { best = s; bf = fi } }
    scored.append((c, best, bf))
  }
  scored.sort { $0.1 > $1.1 }
  out += "\(id)\t" + scored.prefix(5).map { "\($0.0):\(String(format: "%.3f", $0.1))" }.joined(separator: ",") + "\n"
}
try! out.write(toFile: args[3], atomically: true, encoding: .utf8)
print("fonts:", fonts.map { CTFontCopyFullName($0) as String }, "(ordering aid only)")
