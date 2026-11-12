# OneLinkAI Brand Assets

`originals/` stores the provided brand artwork. `npm run icons` removes the white canvas and source padding, then renders platform icon sizes from those originals.

- The source brand symbol stays square. The legacy ICNS image is exported with a rounded-square mask because Electron's ICNS icon is shown square in the target Dock unless corners are present in the bitmap.
- Windows and Linux packages use platform-sized PNG/ICO assets with rounded corners, a neutral background, and safe artwork inset.
- Browser tabs use dedicated 16 px and 32 px icons so the mark stays legible at favicon sizes.
- Linux packages use a size-named PNG icon directory.
- The macOS menu bar uses a separate monochrome template image.

Generated assets are kept in `build/icons/`; the app UI and browser favicon use the cleaned symbol and wordmark in this directory.
