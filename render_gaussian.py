# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GeometryPack Contributors

"""
Render Gaussian Splatting PLY files with gsplat.js viewer.

Separate rendering node that takes PLY path and camera parameters,
executes rendering, and outputs IMAGE to downstream nodes.
"""

import base64
import os
import uuid
from io import BytesIO

import hashlib
import json
import numpy as np
import torch
from PIL import Image

try:
    import folder_paths
    COMFYUI_OUTPUT_FOLDER = folder_paths.get_output_directory()
except (ImportError, AttributeError):
    COMFYUI_OUTPUT_FOLDER = None

# Import shared camera params cache
from .camera_params import (
    CAMERA_PARAMS_BY_KEY,
    get_camera_state,
    get_camera_state_version,
    set_camera_state,
)


class RenderGaussianNode:
    """
    Render Gaussian Splatting PLY files.

    Takes PLY path and camera parameters, executes rendering,
    and outputs IMAGE to downstream nodes.
    """

    def __init__(self):
        # Use class-level storage to share between node instances and JavaScript
        if not hasattr(RenderGaussianNode, "render_results"):
            RenderGaussianNode.render_results = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ply_path": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Path to a Gaussian Splatting PLY file (from Preview node)"
                }),
            },
            "optional": {
                "extrinsics": ("EXTRINSICS", {
                    "tooltip": "4x4 camera extrinsics matrix (from Preview node or custom)"
                }),
                "intrinsics": ("INTRINSICS", {
                    "tooltip": "3x3 camera intrinsics matrix (from Preview node or custom)"
                }),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "render_gaussian"
    CATEGORY = "geompack/visualization"

    @classmethod
    def IS_CHANGED(cls, ply_path: str, extrinsics=None, intrinsics=None):
        """
        Force re-execution when camera state changes (cached via Preview node).
        """
        camera_state = _lookup_camera_state_for_change(ply_path)
        camera_version = get_camera_state_version()
        payload = {
            "ply_path": ply_path,
            "camera_state": camera_state,
            "camera_version": camera_version,
            "extrinsics": extrinsics,
            "intrinsics": intrinsics,
        }
        data = json.dumps(payload, sort_keys=True, ensure_ascii=True, default=str)
        print(f"[RenderGaussian] IS_CHANGED: camera_version={camera_version}, camera_state={'yes' if camera_state else 'no'}")
        return hashlib.sha256(data.encode("utf-8")).hexdigest()

    def render_gaussian(self, ply_path: str, extrinsics=None, intrinsics=None):
        """
        Execute rendering and return image tensor.
        """
        import time
        start_time = time.time()
        print("=" * 80)
        print(f"[RenderGaussian] ===== RENDER REQUEST STARTED =====")
        print("=" * 80)
        
        # 1. Validate input parameters
        print(f"[RenderGaussian] Input parameters:")
        print(f"  ply_path: {ply_path}")
        print(f"  extrinsics: {extrinsics is not None}")
        print(f"  intrinsics: {intrinsics is not None}")
        
        if not ply_path:
            print("[RenderGaussian] ERROR: No PLY path provided")
            image = self._create_placeholder_image(2048, 1.0)
            print(f"[RenderGaussian] Created placeholder image: {image.shape}")
            return (image,)

        if not os.path.exists(ply_path):
            print(f"[RenderGaussian] ERROR: PLY file not found: {ply_path}")
            image = self._create_placeholder_image(2048, 1.0)
            print(f"[RenderGaussian] Created placeholder image: {image.shape}")
            return (image,)

        # Get relative path for JavaScript (like Preview node)
        filename = os.path.basename(ply_path)
        if COMFYUI_OUTPUT_FOLDER and ply_path.startswith(COMFYUI_OUTPUT_FOLDER):
            relative_path = os.path.relpath(ply_path, COMFYUI_OUTPUT_FOLDER)
        else:
            relative_path = filename
        
        print(f"[RenderGaussian] File info:")
        print(f"  Full path: {ply_path}")
        print(f"  Relative path: {relative_path}")
        print(f"  Filename: {filename}")

        # 2. Generate unique request ID
        request_id = self._generate_request_id()
        print(f"[RenderGaussian] Generated request ID: {request_id}")

        # Look up camera state
        camera_state = self._lookup_camera_state(ply_path, relative_path, filename)
        print(f"[RenderGaussian] Camera state lookup:")
        print(f"  Found camera_state: {camera_state is not None}")
        if camera_state:
            print(f"  Camera state keys: {list(camera_state.keys())}")
            print(f"  Position: {camera_state.get('position')}")
            print(f"  Target: {camera_state.get('target')}")
            print(f"  Image size: {camera_state.get('image_width')}x{camera_state.get('image_height')}")
            print(f"  Focal length: fx={camera_state.get('fx')}, fy={camera_state.get('fy')}")
            print(f"  Scale: {camera_state.get('scale')}")
            print(f"  Scale compensation: {camera_state.get('scale_compensation')}")

        # Calculate aspect ratio and resolution
        aspect = self._get_aspect_ratio(intrinsics, camera_state)
        output_resolution = self._compute_output_resolution(aspect)
        print(f"[RenderGaussian] Rendering parameters:")
        print(f"  Aspect ratio: {aspect:.4f}")
        print(f"  Output resolution: {output_resolution}")
        print(f"  Output aspect ratio: source")

        # 3. Send RENDER_REQUEST to iframe (via UI data)
        ui_data = {
            "render_request": [True],
            "request_id": [request_id],
            "ply_file": [relative_path],  # Use ply_file like Preview node
            "filename": [filename],
            "output_resolution": [output_resolution],
            "output_aspect_ratio": ["source"],
        }

        if extrinsics is not None:
            ui_data["extrinsics"] = [extrinsics]
            print(f"[RenderGaussian] Extrinsics shape: {len(extrinsics)}x{len(extrinsics[0])}")
        if intrinsics is not None:
            ui_data["intrinsics"] = [intrinsics]
            print(f"[RenderGaussian] Intrinsics shape: {len(intrinsics)}x{len(intrinsics[0])}")
        if camera_state is not None:
            ui_data["camera_state"] = [camera_state]

        print(f"[RenderGaussian] Sending render request to frontend...")
        print(f"[RenderGaussian] Waiting for render result (timeout: 30s)...")

        # Send render request to frontend immediately (do not wait for onExecuted)
        send_start = time.time()
        self._send_render_request(request_id, ui_data)
        send_end = time.time()
        print(f"[RenderGaussian] Render request sent in {send_end - send_start:.3f}s")

        # 4. Wait for render result from iframe
        wait_start = time.time()
        try:
            base64_image = self._wait_for_render_result(request_id, timeout=30)
            wait_end = time.time()
            print(f"[RenderGaussian] Render result received in {wait_end - wait_start:.3f}s")
            print(f"[RenderGaussian] Base64 image length: {len(base64_image)}")
        except TimeoutError as e:
            wait_end = time.time()
            print(f"[RenderGaussian] ERROR: {e}")
            print(f"[RenderGaussian] Wait time: {wait_end - wait_start:.3f}s")
            print(f"[RenderGaussian] Creating placeholder image...")
            image = self._create_placeholder_image(output_resolution, aspect)
            total_time = time.time() - start_time
            print(f"[RenderGaussian] ===== RENDER FAILED (Timeout) =====")
            print(f"[RenderGaussian] Total time: {total_time:.3f}s")
            print("=" * 80)
            return (image,)

        # 5. Convert base64 to tensor
        convert_start = time.time()
        try:
            image_tensor = self._base64_to_tensor(base64_image)
            convert_end = time.time()
            print(f"[RenderGaussian] Image conversion completed in {convert_end - convert_start:.3f}s")
            print(f"[RenderGaussian] Result tensor shape: {image_tensor.shape}")
            print(f"[RenderGaussian] Result tensor dtype: {image_tensor.dtype}")
            print(f"[RenderGaussian] Result tensor value range: [{image_tensor.min():.4f}, {image_tensor.max():.4f}]")
        except Exception as e:
            convert_end = time.time()
            print(f"[RenderGaussian] ERROR: Failed to convert image: {e}")
            print(f"[RenderGaussian] Conversion time: {convert_end - convert_start:.3f}s")
            image = self._create_placeholder_image(output_resolution, aspect)
            total_time = time.time() - start_time
            print(f"[RenderGaussian] ===== RENDER FAILED (Conversion Error) =====")
            print(f"[RenderGaussian] Total time: {total_time:.3f}s")
            print("=" * 80)
            return (image,)

        # 6. Save output image to file
        save_start = time.time()
        try:
            output_filename = self._save_output_image(base64_image, ply_path)
            save_end = time.time()
            print(f"[RenderGaussian] Output image saved: {output_filename}")
            print(f"[RenderGaussian] Save time: {save_end - save_start:.3f}s")
        except Exception as e:
            save_end = time.time()
            print(f"[RenderGaussian] WARNING: Failed to save output image: {e}")
            print(f"[RenderGaussian] Save time: {save_end - save_start:.3f}s")

        # 7. Return image tensor
        total_time = time.time() - start_time
        print(f"[RenderGaussian] ===== RENDER SUCCESS =====")
        print(f"[RenderGaussian] Total time: {total_time:.3f}s")
        print(f"[RenderGaussian] Breakdown:")
        print(f"  - Send request: {send_end - send_start:.3f}s")
        print(f"  - Wait for result: {wait_end - wait_start:.3f}s")
        print(f"  - Convert to tensor: {convert_end - convert_start:.3f}s")
        print(f"  - Save image: {save_end - save_start:.3f}s")
        print("=" * 80)
        
        return (image_tensor,)

    def _generate_request_id(self):
        """Generate unique request ID for render operations."""
        return f"render-{uuid.uuid4().hex[:16]}"

    def _wait_for_render_result(self, request_id, timeout=30):
        """
        Wait for render result with timeout.
        
        Results are stored in class-level dict by JavaScript widget.
        """
        import time
        start_time = time.time()
        print(f"[RenderGaussian] Waiting for render result: request_id={request_id}, timeout={timeout}s")
        while time.time() - start_time < timeout:
            if request_id in RenderGaussianNode.render_results:
                result = RenderGaussianNode.render_results.pop(request_id)
                print(f"[RenderGaussian] Render result found for request_id={request_id}")
                return result
            time.sleep(0.1)
        raise TimeoutError(f"Render timeout for request {request_id}")

    def _lookup_camera_state(self, ply_path: str, relative_path: str, filename: str):
        """Lookup cached camera state by possible keys."""
        for key in (ply_path, relative_path, filename):
            if key and key in CAMERA_PARAMS_BY_KEY:
                return CAMERA_PARAMS_BY_KEY.get(key)
        return None

    def _get_aspect_ratio(self, intrinsics, camera_state):
        """Derive aspect ratio from camera state or intrinsics."""
        if camera_state:
            width = camera_state.get("image_width")
            height = camera_state.get("image_height")
            if width and height:
                try:
                    width = float(width)
                    height = float(height)
                    if width > 0 and height > 0:
                        return width / height
                except (TypeError, ValueError):
                    pass

        if intrinsics and len(intrinsics) >= 2:
            try:
                cx = intrinsics[0][2]
                cy = intrinsics[1][2]
                if cx > 0 and cy > 0:
                    return (cx * 2) / (cy * 2)
            except (TypeError, IndexError):
                pass

        return 1.0

    def _compute_output_resolution(self, aspect: float, min_dim: int = 2048):
        """Compute long-edge resolution so the short edge is at least min_dim."""
        aspect = aspect if aspect and aspect > 0 else 1.0
        if aspect >= 1.0:
            return int(round(min_dim * aspect))
        return int(round(min_dim / aspect))

    def _send_render_request(self, request_id: str, ui_data: dict):
        """Send a render request to the frontend via ComfyUI websocket."""
        try:
            from server import PromptServer
        except Exception as e:
            print(f"[RenderGaussian] PromptServer not available: {e}")
            return

        # Try to get node_id from various possible attributes
        node_id = getattr(self, "id", None)
        if node_id is None:
            node_id = getattr(self, "node_id", None)
        if node_id is None:
            node_id = getattr(self, "_id", None)
        
        # Also try to get from widget if available
        if node_id is None:
            try:
                node_id = self.widgets_values
            except:
                pass
        
        payload = {
            "request_id": request_id,
            "node_id": node_id,
            "ply_file": ui_data.get("ply_file", [None])[0],
            "filename": ui_data.get("filename", [None])[0],
            "output_resolution": ui_data.get("output_resolution", [None])[0],
            "output_aspect_ratio": ui_data.get("output_aspect_ratio", [None])[0],
            "extrinsics": ui_data.get("extrinsics", [None])[0],
            "intrinsics": ui_data.get("intrinsics", [None])[0],
            "camera_state": ui_data.get("camera_state", [None])[0],
        }

        print(f"[RenderGaussian] Sending render request with node_id={node_id}, request_id={request_id}")
        print(f"[RenderGaussian] Render request payload keys: {list(payload.keys())}")

        # Try different methods to send the event
        try:
            if hasattr(PromptServer.instance, "send_sync"):
                PromptServer.instance.send_sync("geompack_render_request", payload)
            elif hasattr(PromptServer.instance, "send"):
                PromptServer.instance.send("geompack_render_request", payload)
            else:
                print("[RenderGaussian] PromptServer has no send method")
                return
            print("[RenderGaussian] Render request sent successfully")
        except Exception as e:
            print(f"[RenderGaussian] Error sending render request: {e}")

    def _base64_to_tensor(self, base64_data: str):
        """Convert base64 image data to torch tensor."""
        # Remove data URL prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]

        image_data = base64.b64decode(base64_data)
        image = Image.open(BytesIO(image_data)).convert("RGB")
        image_np = np.array(image).astype(np.float32) / 255.0
        return torch.from_numpy(image_np).unsqueeze(0)

    def _save_output_image(self, base64_data: str, ply_path: str):
        """
        Save output image to ComfyUI output directory.
        
        Filename format: gaussian-{ply_base}-render-{timestamp}.png
        """
        if not COMFYUI_OUTPUT_FOLDER:
            raise RuntimeError("ComfyUI output folder not found")

        # Generate filename
        base = os.path.splitext(os.path.basename(ply_path))[0]
        base = base[:50]  # Limit base name length
        timestamp = uuid.uuid4().hex[:12]
        filename = f"gaussian-{base}-render-{timestamp}.png"
        filepath = os.path.join(COMFYUI_OUTPUT_FOLDER, filename)

        # Save image
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]

        image_data = base64.b64decode(base64_data)
        image = Image.open(BytesIO(image_data))
        image.save(filepath)

        return filename

    def _create_placeholder_image(self, output_resolution: int, aspect: float):
        """Create a placeholder image for error cases."""
        resolution = max(1, int(output_resolution) if output_resolution else 1024)
        aspect = aspect if aspect and aspect > 0 else 1.0

        if aspect >= 1.0:
            width = resolution
            height = max(1, int(round(resolution / aspect)))
        else:
            height = resolution
            width = max(1, int(round(resolution * aspect)))

        placeholder = np.zeros((height, width, 3), dtype=np.float32)
        return torch.from_numpy(placeholder).unsqueeze(0)


NODE_CLASS_MAPPINGS = {
    "GeomPackRenderGaussian": RenderGaussianNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeomPackRenderGaussian": "Render Gaussian (Deprecated)",
}


def _lookup_camera_state_for_change(ply_path: str):
    if not ply_path:
        return None
    filename = os.path.basename(ply_path)
    if COMFYUI_OUTPUT_FOLDER and ply_path.startswith(COMFYUI_OUTPUT_FOLDER):
        relative_path = os.path.relpath(ply_path, COMFYUI_OUTPUT_FOLDER)
    else:
        relative_path = filename
    for key in (ply_path, relative_path, filename):
        if key and key in CAMERA_PARAMS_BY_KEY:
            return CAMERA_PARAMS_BY_KEY.get(key)
    return None

# Register a lightweight endpoint to receive render results from frontend.
try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.post("/geompack/render_result")
    async def geompack_render_result(request):
        data = await request.json()
        request_id = data.get("request_id")
        image = data.get("image")

        if not request_id or not image:
            print(f"[RenderGaussian] render_result missing request_id or image: request_id={request_id}, image_present={image is not None}")
            return web.json_response({"status": "error", "reason": "missing request_id or image"}, status=400)

        print(f"[RenderGaussian] render_result received: request_id={request_id}, image_len={len(image)}")
        RenderGaussianNode.render_results[request_id] = image
        return web.json_response({"status": "ok"})

    @PromptServer.instance.routes.post("/geompack/preview_camera")
    async def geompack_preview_camera(request):
        print("=" * 80)
        print("[RenderGaussian] ===== PREVIEW_CAMERA REQUEST RECEIVED =====")
        print("=" * 80)
        
        data = await request.json()
        print(f"[RenderGaussian] Raw request data: {data}")
        
        camera_state = data.get("camera_state")
        ply_file = data.get("ply_file")
        filename = data.get("filename")
        
        print(f"[RenderGaussian] Parsed parameters:")
        print(f"[RenderGaussian]   - ply_file: {ply_file}")
        print(f"[RenderGaussian]   - filename: {filename}")
        print(f"[RenderGaussian]   - camera_state present: {camera_state is not None}")

        if not camera_state:
            print(f"[RenderGaussian] ERROR: camera_state is missing!")
            return web.json_response({"status": "error", "reason": "missing camera_state"}, status=400)
        
        print(f"[RenderGaussian] Camera state details:")
        print(f"[RenderGaussian]   - Keys: {list(camera_state.keys())}")
        if 'position' in camera_state:
            pos = camera_state['position']
            print(f"[RenderGaussian]   - Position: x={pos.get('x')}, y={pos.get('y')}, z={pos.get('z')}")
        if 'target' in camera_state:
            tgt = camera_state['target']
            if isinstance(tgt, dict):
                print(f"[RenderGaussian]   - Target: x={tgt.get('x')}, y={tgt.get('y')}, z={tgt.get('z')}")
            else:
                print(f"[RenderGaussian]   - Target: {tgt}")
        if 'fx' in camera_state or 'fy' in camera_state:
            print(f"[RenderGaussian]   - Focal length: fx={camera_state.get('fx')}, fy={camera_state.get('fy')}")
        if 'image_width' in camera_state or 'image_height' in camera_state:
            print(f"[RenderGaussian]   - Image size: {camera_state.get('image_width')}x{camera_state.get('image_height')}")
        if 'scale' in camera_state:
            print(f"[RenderGaussian]   - Scale: {camera_state.get('scale')}")
        if 'scale_compensation' in camera_state:
            print(f"[RenderGaussian]   - Scale compensation: {camera_state.get('scale_compensation')}")

        # Use the shared set_camera_state function
        print(f"[RenderGaussian] Saving camera state to cache...")
        for key in (ply_file, filename):
            if key:
                set_camera_state(key, camera_state)
                print(f"[RenderGaussian] ✓ Camera state saved for key: '{key}'")
        
        print(f"[RenderGaussian] ===== PREVIEW_CAMERA REQUEST COMPLETE =====")
        print("=" * 80)
        return web.json_response({"status": "ok"})

except Exception as e:
    print(f"[RenderGaussian] Failed to register render_result endpoint: {e}")
