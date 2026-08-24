# cast-metal

Native macOS camera app that runs your webcam (FaceTime / Continuity Camera /
OBS Virtual Cam) through a **Metal** port of CAST's dither + distort shader and
shows the result in a clean borderless preview window. Controlled live from the
CAST web app's **Metal** tab.

```
camera ─▶ AVFoundation ─▶ Metal compute shader ─▶ preview window ─▶ OBS window capture ─▶ virtual cam ─▶ Zoom/everywhere
                                   ▲
        CAST web panel (ws://127.0.0.1:4313/ws)
```

## Run it

```bash
# 1. Start cast-metal (first run: approve the macOS camera prompt)
cd ~/Documents/CAST/cast-metal && swift run castmetal

# 2. In CAST, open the "Metal" tab — sliders drive the shader live.
```

Requirements: macOS 13+, Command Line Tools (`xcode-select --install`). No Xcode needed.

## Get it into Zoom / streaming (v1 path)

1. Open **OBS** → Sources → **+** → *Window Capture* → pick the **CAST Metal** window.
2. Click **Start Virtual Camera** in OBS.
3. In Zoom/Meet/wherever, select **OBS Virtual Camera**.

## Flags

| flag | purpose |
|---|---|
| *(none)* | live preview window + control server on port 4313 |
| `--probe` | camera sanity check: prints frames/sec for 2s, exits |
| `--stills` | writes dither test renders to `out/still-*.png` |

## Control API (port 4313)

- `GET /status` → `{version, fps, camera}`
- `GET /params` → full JSON param snapshot (same field names as CAST `preset.video`)
- `PUT /params` with partial JSON → merge patch, returns merged params
- `GET /presets` → list CAST presets from `../presets/*.json`
- `POST /presets/load {"name":"white-sand-v3"}` → apply preset
- `WS /ws` → send `{"type":"setParams","patch":{...}}` or `{"type":"getParams"}`;
  receive `{"type":"params",...}` broadcasts and `{"type":"stats",...}` every second

## Layout

- `Resources/Shaders.msl` — the shader port. Uniforms are passed as a flat
  `float4` array; the slot map is documented at the top of both this file and
  `Sources/CastMetalCore/FrameRenderer.swift`. Keep them in sync.
- `Sources/CastMetalCore/` — library: ShaderParams, UniformEncoder,
  FrameRenderer, ControlServer, PresetBridge, ShaderCompiler.
- `Sources/castmetal/` — app: CameraCapture, TextureUploader, PreviewWindow,
  AppMain.
- `Tests/cast-tests/` — logic tests (`swift run cast-tests`; XCTest isn't
  available without full Xcode).
- `Tests/cast-stills/`, `Tests/cast-pixcheck/` — GPU verification harnesses.

## Troubleshooting

- **Camera permission**: reset prompts with `tccutil reset Camera`, then rerun.
- **Port busy**: another cast-metal instance is running; kill it first.
- **Shader edits look wrong**: recheck the float4 slot map in Shaders.msl vs
  FrameRenderer.swift — misaligned slots are the classic failure mode.
- **Window looks frozen in OBS**: make sure the CAST Metal window is visible on
  screen (not minimized) while captured.

## Known deltas vs WebGL (CAST browser)

- Same math, but the Metal path samples textures with point reads; edge pixels
  can differ by a hair from GL bilinear sampling.
- The alpha pulse animation uses the same formula; timing starts when the app launches.

## Phase 2 (not built): native virtual camera

Expose "CAST Camera" system-wide via a Core Media I/O system extension. Needs an
app bundle, Developer ID signing, and one-time approval in System Settings →
Privacy & Security. Revisit once v1 workflow is proven.
