import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = path.join(root, "src/assets/brand");
const sourceDir = path.join(brandDir, "originals");
const buildDir = path.join(root, "build");
const iconDir = path.join(buildDir, "icons");
const tempDir = await mkdtemp(path.join(tmpdir(), "onelink-icons-"));
const inputDir = path.join(tempDir, "input");
const processedDir = path.join(tempDir, "processed");
const iconset = path.join(tempDir, "OneLink.iconset");

async function resize(source, size, output) {
  await execFileAsync("sips", ["-s", "format", "png", "-z", String(size), String(size), source, "--out", output]);
}

try {
  await Promise.all([
    mkdir(inputDir, { recursive: true }),
    mkdir(processedDir, { recursive: true }),
    mkdir(iconset, { recursive: true }),
    mkdir(path.join(iconDir, "linux"), { recursive: true }),
  ]);
  await copyFile(path.join(sourceDir, "symbol.png"), path.join(inputDir, "source-symbol.png"));
  await copyFile(path.join(sourceDir, "wordmark.png"), path.join(inputDir, "source-wordmark.png"));
  await execFileAsync("swift", [path.join(root, "scripts/process-brand-icons.swift"), inputDir, processedDir]);

  const transparentIcon = path.join(processedDir, "icon.png");
  const macIcon = path.join(processedDir, "mac-icon.png");
  const platformIcon = path.join(processedDir, "platform-icon.png");
  await copyFile(platformIcon, path.join(buildDir, "icon.png"));
  await copyFile(transparentIcon, path.join(iconDir, "icon.png"));
  await copyFile(path.join(processedDir, "brand-symbol.png"), path.join(brandDir, "onelink-symbol.png"));
  await copyFile(path.join(processedDir, "brand-wordmark.png"), path.join(brandDir, "onelink-wordmark.png"));
  await copyFile(path.join(processedDir, "favicon-32.png"), path.join(root, "public/favicon-32.png"));
  await copyFile(path.join(processedDir, "favicon-16.png"), path.join(root, "public/favicon-16.png"));
  await copyFile(macIcon, path.join(iconDir, "mac-icon.png"));
  await copyFile(path.join(processedDir, "tray-template.png"), path.join(iconDir, "tray-template.png"));
  await copyFile(path.join(processedDir, "tray-template@2x.png"), path.join(iconDir, "tray-template@2x.png"));

  const iconsetSizes = [
    [16, "icon_16x16.png"], [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"], [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"], [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"], [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"], [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, name] of iconsetSizes) await resize(macIcon, size, path.join(iconset, name));
  await execFileAsync("iconutil", ["-c", "icns", iconset, "-o", path.join(iconDir, "icon.icns")]);

  await copyFile(path.join(iconDir, "icon.icns"), path.join(iconDir, "mac-icon.icns"));

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const frames = await Promise.all(icoSizes.map(async (size) => {
    const file = path.join(tempDir, `ico-${size}.png`);
    await resize(platformIcon, size, file);
    return readFile(file);
  }));
  let offset = 6 + icoSizes.length * 16;
  const entries = icoSizes.map((size, index) => {
    const frame = frames[index];
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.length;
    return entry;
  });
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoSizes.length, 4);
  await writeFile(path.join(iconDir, "icon.ico"), Buffer.concat([header, ...entries, ...frames]));

  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await resize(platformIcon, size, path.join(iconDir, "linux", `${size}x${size}.png`));
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
