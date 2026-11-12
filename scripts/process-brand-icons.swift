import AppKit
import Foundation

let root = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let fm = FileManager.default

func bitmap(width: Int, height: Int) -> NSBitmapImageRep {
  NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )!
}

func save(_ rep: NSBitmapImageRep, to url: URL) throws {
  let data = rep.representation(using: .png, properties: [:])!
  try data.write(to: url)
}

func extracted(_ name: String) throws -> (NSBitmapImageRep, CGRect) {
  let url = root.appendingPathComponent(name)
  let original = NSBitmapImageRep(data: try Data(contentsOf: url))!
  let clean = bitmap(width: original.pixelsWide, height: original.pixelsHigh)
  var minX = original.pixelsWide
  var minY = original.pixelsHigh
  var maxX = 0
  var maxY = 0

  for y in 0..<original.pixelsHigh {
    for x in 0..<original.pixelsWide {
      let color = original.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
      let red = color.redComponent
      let green = color.greenComponent
      let blue = color.blueComponent
      let alpha = color.alphaComponent
      let luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      let neutral = max(red, green, blue) - min(red, green, blue)
      let whiteBackground = neutral < 0.055 ? min(1, max(0, (luminance - 0.78) / 0.2)) : 0
      let visibleAlpha = alpha * (1 - whiteBackground)
      clean.setColor(
        NSColor(calibratedRed: red, green: green, blue: blue, alpha: visibleAlpha),
        atX: x,
        y: y
      )
      if visibleAlpha > 0.04 {
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }
  }

  return (clean, CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1))
}

func render(
  _ source: NSBitmapImageRep,
  crop: CGRect,
  width: Int,
  height: Int,
  destination: CGRect,
  background: NSColor? = nil,
  backgroundRect: CGRect? = nil,
  rounded: CGFloat? = nil,
  monochrome: Bool = false
) -> NSBitmapImageRep {
  let result = bitmap(width: width, height: height)
  NSGraphicsContext.saveGraphicsState()
  let context = NSGraphicsContext(bitmapImageRep: result)!
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  if let rounded {
    let rect = backgroundRect ?? CGRect(x: 0, y: 0, width: width, height: height)
    NSBezierPath(
      roundedRect: rect,
      xRadius: rounded,
      yRadius: rounded
    ).addClip()
  }
  if let background {
    background.setFill()
    (backgroundRect ?? CGRect(x: 0, y: 0, width: width, height: height)).fill()
  }
  NSImage(cgImage: source.cgImage!, size: NSSize(width: source.pixelsWide, height: source.pixelsHigh))
    .draw(in: destination, from: crop, operation: .sourceOver, fraction: 1)
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  if monochrome {
    for y in 0..<height {
      for x in 0..<width {
        let color = result.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
        if color.alphaComponent > 0 {
          result.setColor(NSColor(calibratedWhite: 0, alpha: color.alphaComponent), atX: x, y: y)
        }
      }
    }
  }
  return result
}

try fm.createDirectory(at: output, withIntermediateDirectories: true)
let (symbol, symbolBounds) = try extracted("source-symbol.png")
let (wordmark, wordmarkBounds) = try extracted("source-wordmark.png")
let symbolOutput = render(
  symbol,
  crop: symbolBounds,
  width: 1024,
  height: 1024,
  destination: CGRect(x: 182, y: 182, width: 660, height: 660)
)
try save(symbolOutput, to: output.appendingPathComponent("icon.png"))
try save(symbolOutput, to: output.appendingPathComponent("linux-1024.png"))
try save(
  render(symbol, crop: symbolBounds, width: 512, height: 512, destination: CGRect(x: 91, y: 91, width: 330, height: 330)),
  to: output.appendingPathComponent("brand-symbol.png")
)

let wordmarkWidth = 2048
let wordmarkHeight = max(1, Int((CGFloat(wordmarkWidth) * wordmarkBounds.height / wordmarkBounds.width).rounded()))
try save(
  render(
    wordmark,
    crop: wordmarkBounds,
    width: wordmarkWidth,
    height: wordmarkHeight,
    destination: CGRect(x: 0, y: 0, width: wordmarkWidth, height: wordmarkHeight)
  ),
  to: output.appendingPathComponent("brand-wordmark.png")
)

let macIcon = render(
  symbol,
  crop: symbolBounds,
  width: 1024,
  height: 1024,
  destination: CGRect(x: 232, y: 232, width: 560, height: 560),
  background: NSColor(calibratedRed: 0.93, green: 0.94, blue: 0.97, alpha: 1),
  backgroundRect: CGRect(x: 112, y: 112, width: 800, height: 800),
  rounded: 208
)
try save(macIcon, to: output.appendingPathComponent("mac-icon.png"))
let platformIcon = render(
  symbol,
  crop: symbolBounds,
  width: 1024,
  height: 1024,
  destination: CGRect(x: 262, y: 262, width: 500, height: 500),
  background: NSColor(calibratedRed: 0.93, green: 0.94, blue: 0.97, alpha: 1),
  rounded: 184
)
try save(platformIcon, to: output.appendingPathComponent("platform-icon.png"))
try save(
  render(symbol, crop: symbolBounds, width: 32, height: 32, destination: CGRect(x: 2, y: 2, width: 28, height: 28), background: NSColor(calibratedRed: 0.93, green: 0.94, blue: 0.97, alpha: 1), rounded: 7),
  to: output.appendingPathComponent("favicon-32.png")
)
try save(
  render(symbol, crop: symbolBounds, width: 16, height: 16, destination: CGRect(x: 1, y: 1, width: 14, height: 14), background: NSColor(calibratedRed: 0.93, green: 0.94, blue: 0.97, alpha: 1), rounded: 3.5),
  to: output.appendingPathComponent("favicon-16.png")
)
try save(
  render(symbol, crop: symbolBounds, width: 18, height: 18, destination: CGRect(x: 2, y: 2, width: 14, height: 14), monochrome: true),
  to: output.appendingPathComponent("tray-template.png")
)
try save(
  render(symbol, crop: symbolBounds, width: 36, height: 36, destination: CGRect(x: 4, y: 4, width: 28, height: 28), monochrome: true),
  to: output.appendingPathComponent("tray-template@2x.png")
)
