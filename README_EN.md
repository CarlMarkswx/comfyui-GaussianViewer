# ComfyUI-GaussianViewer

[English](README_EN.md) | [中文](README.md)

[![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

An all-in-one ComfyUI node plugin for interactive Gaussian Splatting PLY previews and high-quality render outputs.

**Note**: This plugin is adapted from [ComfyUI-GeometryPack](https://github.com/PozzettiAndrea/ComfyUI-GeometryPack), and the current version merges preview + render into a single node (`GaussianViewer`).

## Features

- 🎨 **Interactive 3D Preview** - Preview Gaussian Splatting PLY files directly in ComfyUI
- 📸 **High-Quality Rendering** - Outputs high-resolution images with 2048px short edge
- 🖼️ **Reference Overlay** - Optional reference image overlay in the viewer
- 🎥 **Camera Parameters** - Supports extrinsics/intrinsics inputs
- 💾 **Camera State Cache** - Automatically saves and restores camera view
- 🔗 **Seamless Integration** - Outputs IMAGE for downstream ComfyUI nodes
- 🌐 **Web Viewer** - Modern gsplat.js-based 3D viewer

## Installation

### Option 1: Install from GitHub

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/CarlMarkswx/comfyui-GaussianViewer.git
```

### Option 2: Manual Installation

1. Download the ZIP of this repository
2. Extract it into `ComfyUI/custom_nodes/`
3. Rename the folder to `comfyui-GaussianViewer`

### Dependencies

This plugin relies on the following Python packages (usually already installed with ComfyUI):

```
numpy
torch
Pillow
```

If needed, install them manually:

```bash
pip install numpy torch Pillow
```

## Usage

### Main Node

This plugin provides the following node:

#### GaussianViewer

The main node that combines preview + render (recommended). Legacy split preview/render nodes are deprecated and hidden by default.

**Inputs**:
- `ply_path` (required): Path to Gaussian Splatting PLY file
- `extrinsics` (optional): 4x4 camera extrinsics matrix for initial view
- `intrinsics` (optional): 3x3 camera intrinsics matrix for FOV
- `image` (optional): Reference image for overlay display in the viewer

**Output**:
- `image`: Rendered output image (IMAGE type)

**Steps**:
1. Connect the PLY file path
2. Adjust the camera in the viewer
3. **Important**: Click "Set Camera" to save the camera for rendering
4. The node renders and outputs the current view (IMAGE)
5. Optional: Provide a reference image for overlay alignment
6. Use the output image in downstream nodes

### Workflow Examples

#### Basic Preview + Render

```
[PLY path] → [GaussianViewer] → [Image Output]
```

#### With Camera Parameters

```
[PLY path] + [Extrinsics] + [Intrinsics] → [GaussianViewer] → [Image Output]
```

#### With Reference Overlay

```
[PLY path] + [Reference Image] → [GaussianViewer] → [Image Output]
```

#### In Complex Pipelines

```
[PLY path] → [GaussianViewer] → [Image Processing] → [Save/Display]
```

### Viewer Operations (View Panel)

Inside the embedded viewer below the GaussianViewer node:

- **Mouse Controls**
  - Left drag: Orbit
  - Right drag: Pan
  - Scroll: Zoom
- **Keyboard Shortcuts** (click `?` to show)
  - `W/A/S/D` or Arrow keys: Move / Pan
  - `Q/E`: Yaw
  - `R/F`: Pitch
  - `Z/C`: Roll
  - `Shift`: Precision mode (0.1x)
- **Bottom Controls**
  - `Reset View`: Reset camera view
  - `Set Camera`: Save current camera for render (**required before rendering**)
  - `Scale`: Adjust Gaussian size (fix sparse/dense appearance)
  - `Focal`: Scale focal length to change FOV
  - `Overlay`: Adjust reference image transparency (if provided)
- **Aspect Ratio Crop**
  - `Image Ratio` (bottom-left) switches the output crop ratio used for render outputs.

## Technical Details

### Camera Parameters

- **Extrinsics**: 4x4 matrix, camera position/rotation in world space
- **Intrinsics**: 3x3 matrix, focal length + principal point controlling FOV

### Render Resolution

- Default output resolution: 2048px on the short edge
- Long edge is derived from cached camera image size or intrinsics aspect ratio
- Output format: RGB image tensor (0–1 float range)

### Output Filename

Rendered images are saved to the ComfyUI output folder as:

```
gaussian-{PLY_filename}-render-{timestamp}.png
```

### Camera State Cache

Cached per PLY file:
- camera position (position)
- camera target (target)
- focal lengths (fx, fy)
- image dimensions (image_width, image_height)
- gaussian scale (scale)
- scale compensation (scale_compensation)

These are restored automatically on re-execution.

## File Structure

```
comfyui-GaussianViewer/
├── __init__.py                 # Plugin entry & node registration
├── gaussian_viewer.py          # Main node (preview + render)
├── render_gaussian.py          # Render logic + HTTP endpoints (internal)
├── preview_gaussian2.py        # Legacy preview node (deprecated)
├── camera_params.py            # Camera cache module
├── requirements.txt            # Python deps
└── web/                        # Web UI + JavaScript
    ├── viewer_gaussian_v2.html # Viewer UI
    ├── viewer_render_gaussian.html # Render UI
    └── js/
        ├── gsplat-bundle.js
        ├── gaussian_preview_v2.js
        └── render_gaussian.js
```

## Troubleshooting

### Issue 1: PLY file cannot be loaded

**Possible causes**:
- Incorrect file path
- File not in ComfyUI output directory

**Solutions**:
- Verify the PLY path
- Move the PLY file into ComfyUI output directory

### Issue 2: Render timeout

**Possible causes**:
- Large PLY file
- Insufficient system resources

**Solutions**:
- Reduce PLY file size
- Close other resource-heavy apps
- Increase timeout in `render_gaussian.py`

### Issue 3: Blank output image

**Possible causes**:
- Corrupted PLY file
- Incorrect camera parameters

**Solutions**:
- Verify PLY file integrity
- Render without camera parameters for default view

### Issue 4: Plugin node not visible

**Possible causes**:
- Plugin not installed correctly
- ComfyUI not restarted

**Solutions**:
- Ensure plugin is under `ComfyUI/custom_nodes/`
- Restart ComfyUI
- Check console logs for errors

## Development

### Build & Test

```bash
# Clone repo
git clone https://github.com/CarlMarkswx/comfyui-GaussianViewer.git
cd comfyui-GaussianViewer

# Install deps (if needed)
pip install -r requirements.txt

# Restart ComfyUI
```

### Contributing

Issues and Pull Requests are welcome!

## License

This project is licensed under [GPL-3.0-or-later](LICENSE).

## Credits

- [gsplat.js](https://github.com/antimatter15/splat) - JavaScript library for 3D Gaussian splatting
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) - Node-based generative UI

## Contact

- GitHub: [CarlMarkswx/comfyui-GaussianViewer](https://github.com/CarlMarkswx/comfyui-GaussianViewer)
- Issues: [GitHub Issues](https://github.com/CarlMarkswx/comfyui-GaussianViewer/issues)

---

**Note**: This plugin is a ComfyUI custom node and requires [ComfyUI](https://github.com/comfyanonymous/ComfyUI) to use.