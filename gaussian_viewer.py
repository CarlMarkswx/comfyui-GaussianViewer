# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GaussianViewer Contributors

"""
Combined Gaussian viewer node.

Merges preview and render into a single IMAGE-producing node.

Outputs:
  - image: Rendered image from the current camera view
  - extrinsics: 4x4 camera-to-world matrix from viewer state
  - intrinsics: 3x3 camera intrinsics matrix (fx, fy, cx, cy)
"""

import os
import uuid
import numpy as np
import torch
from PIL import Image

from .render_gaussian import RenderGaussianNode, COMFYUI_OUTPUT_FOLDER
from .camera_params import get_camera_state


def camera_state_to_extrinsics(camera_state):
    """
    Convert camera state (position, target) to a 4x4 extrinsics matrix.
    
    Returns a list-of-lists representation of the camera-to-world transform.
    The matrix follows OpenGL convention: columns are [right, up, -forward, position].
    """
    if not camera_state:
        return None
    
    position = camera_state.get('position')
    target = camera_state.get('target')
    
    if not position or not target:
        return None
    
    # Extract position
    px = float(position.get('x', 0))
    py = float(position.get('y', 0))
    pz = float(position.get('z', 0))
    
    # Extract target
    if isinstance(target, dict):
        tx = float(target.get('x', 0))
        ty = float(target.get('y', 0))
        tz = float(target.get('z', 0))
    else:
        tx, ty, tz = 0, 0, 0
    
    # Compute forward vector (camera looks toward target)
    forward = np.array([tx - px, ty - py, tz - pz])
    forward_norm = np.linalg.norm(forward)
    if forward_norm < 1e-8:
        forward = np.array([0, 0, -1])
    else:
        forward = forward / forward_norm
    
    # Compute right and up vectors (assuming Y-up world)
    world_up = np.array([0, 1, 0])
    right = np.cross(forward, world_up)
    right_norm = np.linalg.norm(right)
    if right_norm < 1e-8:
        # Forward is parallel to world up, use different reference
        world_up = np.array([0, 0, 1])
        right = np.cross(forward, world_up)
        right_norm = np.linalg.norm(right)
    right = right / right_norm
    
    up = np.cross(right, forward)
    up = up / np.linalg.norm(up)
    
    # Build 4x4 camera-to-world matrix
    # Convention: columns are right, up, -forward (OpenGL style)
    extrinsics = [
        [float(right[0]), float(up[0]), float(-forward[0]), float(px)],
        [float(right[1]), float(up[1]), float(-forward[1]), float(py)],
        [float(right[2]), float(up[2]), float(-forward[2]), float(pz)],
        [0.0, 0.0, 0.0, 1.0]
    ]
    
    return extrinsics


def camera_state_to_intrinsics(camera_state):
    """
    Convert camera state (fx, fy, image dimensions) to a 3x3 intrinsics matrix.
    
    Returns a list-of-lists representation of the camera intrinsics.
    
    Matrix format:
        [[fx,  0, cx],
         [ 0, fy, cy],
         [ 0,  0,  1]]
    
    Where fx, fy are focal lengths and (cx, cy) is the principal point.
    """
    if not camera_state:
        return None
    
    fx = camera_state.get('fx')
    fy = camera_state.get('fy')
    image_width = camera_state.get('image_width')
    image_height = camera_state.get('image_height')
    
    if fx is None or fy is None:
        return None
    
    fx = float(fx)
    fy = float(fy)
    
    # Principal point at image center
    cx = float(image_width) / 2.0 if image_width else fx
    cy = float(image_height) / 2.0 if image_height else fy
    
    intrinsics = [
        [fx, 0.0, cx],
        [0.0, fy, cy],
        [0.0, 0.0, 1.0]
    ]
    
    return intrinsics


class GaussianViewerNode(RenderGaussianNode):
    """
    Preview + render Gaussian splatting PLY files in a single node.
    
    This is the main node that combines interactive 3D preview with high-quality rendering.
    
    Inputs:
        - ply_path: Path to Gaussian Splatting PLY file (required)
        - extrinsics: 4x4 camera matrix for initial view (optional)
        - intrinsics: 3x3 camera matrix for FOV (optional)
        - image: Reference image for overlay (optional)
    
    Outputs:
        - image: Rendered image from viewer camera state
        - extrinsics: 4x4 camera-to-world matrix from viewer
        - intrinsics: 3x3 camera intrinsics from viewer
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ply_path": ("STRING", {
                    "forceInput": True,
                    "tooltip": "Path to a Gaussian Splatting PLY file"
                }),
            },
            "optional": {
                "extrinsics": ("EXTRINSICS", {
                    "tooltip": "4x4 camera extrinsics matrix for initial view"
                }),
                "intrinsics": ("INTRINSICS", {
                    "tooltip": "3x3 camera intrinsics matrix for FOV"
                }),
                "image": ("IMAGE", {
                    "tooltip": "Reference image to show as overlay"
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "EXTRINSICS", "INTRINSICS")
    RETURN_NAMES = ("image", "extrinsics", "intrinsics")
    OUTPUT_NODE = True
    FUNCTION = "gaussian_viewer"
    CATEGORY = "geompack/visualization"

    def gaussian_viewer(self, ply_path: str, extrinsics=None, intrinsics=None, image=None):
        """
        Preview the PLY in the viewer and return the rendered IMAGE output,
        along with camera extrinsics and intrinsics from the viewer state.
        """
        print("=" * 80)
        print("[GaussianViewer] ===== VIEWER NODE EXECUTED =====")
        print("=" * 80)
        print("[GaussianViewer] Input parameters:")
        print(f"  ply_path: {ply_path}")
        print(f"  extrinsics: {extrinsics is not None}")
        print(f"  intrinsics: {intrinsics is not None}")

        if not ply_path:
            print("[GaussianViewer] ERROR: No PLY path provided")
            placeholder_image = self._create_placeholder_image(2048, 1.0)
            return {"ui": {"error": ["No PLY path provided"]}, "result": (placeholder_image, None, None)}

        if not os.path.exists(ply_path):
            print(f"[GaussianViewer] ERROR: PLY file not found: {ply_path}")
            placeholder_image = self._create_placeholder_image(2048, 1.0)
            return {"ui": {"error": [f"File not found: {ply_path}"]}, "result": (placeholder_image, None, None)}

        filename = os.path.basename(ply_path)
        if COMFYUI_OUTPUT_FOLDER and ply_path.startswith(COMFYUI_OUTPUT_FOLDER):
            relative_path = os.path.relpath(ply_path, COMFYUI_OUTPUT_FOLDER)
        else:
            relative_path = filename

        file_size = os.path.getsize(ply_path)
        file_size_mb = file_size / (1024 * 1024)

        print("[GaussianViewer] File info:")
        print(f"  Full path: {ply_path}")
        print(f"  Relative path: {relative_path}")
        print(f"  Filename: {filename}")
        print(f"  File size: {file_size_mb:.2f} MB ({file_size:,} bytes)")

        ui_data = {
            "ply_file": [relative_path],
            "filename": [filename],
            "file_size_mb": [round(file_size_mb, 2)],
        }

        if extrinsics is not None:
            ui_data["extrinsics"] = [extrinsics]
            print(f"[GaussianViewer] Extrinsics provided: {len(extrinsics)}x{len(extrinsics[0])}")
        if intrinsics is not None:
            ui_data["intrinsics"] = [intrinsics]
            print(f"[GaussianViewer] Intrinsics provided: {len(intrinsics)}x{len(intrinsics[0])}")

        if image is not None:
            print(f"[GaussianViewer] Reference image provided: {image.shape}")
            try:
                # Save the first image in the batch as an overlay
                img_tensor = image[0]
                i = 255. * img_tensor.cpu().numpy()
                img = Image.fromarray(np.uint8(i))

                overlay_filename = f"gaussian_overlay_{uuid.uuid4().hex}.png"
                overlay_path = os.path.join(COMFYUI_OUTPUT_FOLDER, overlay_filename)
                img.save(overlay_path)

                ui_data["overlay_image"] = [overlay_filename]
                print(f"[GaussianViewer] Overlay image saved: {overlay_filename}")
            except Exception as e:
                print(f"[GaussianViewer] ERROR saving overlay image: {e}")

        print(f"[GaussianViewer] UI data keys: {list(ui_data.keys())}")
        print("[GaussianViewer] ===== VIEWER PREVIEW READY =====")
        print("=" * 80)

        # Render the image
        image_tuple = super().render_gaussian(ply_path, extrinsics, intrinsics)
        rendered_image = image_tuple[0]

        # Look up camera state and convert to extrinsics/intrinsics
        camera_state = None
        for key in (ply_path, relative_path, filename):
            camera_state = get_camera_state(key)
            if camera_state:
                print(f"[GaussianViewer] Found camera state for key: {key}")
                break

        output_extrinsics = camera_state_to_extrinsics(camera_state)
        output_intrinsics = camera_state_to_intrinsics(camera_state)

        if output_extrinsics:
            print(f"[GaussianViewer] Output extrinsics: 4x4 matrix")
        else:
            print("[GaussianViewer] Output extrinsics: None (no camera state)")

        if output_intrinsics:
            print(f"[GaussianViewer] Output intrinsics: 3x3 matrix")
        else:
            print("[GaussianViewer] Output intrinsics: None (no camera state)")

        return {"ui": ui_data, "result": (rendered_image, output_extrinsics, output_intrinsics)}


NODE_CLASS_MAPPINGS = {
    "GaussianViewer": GaussianViewerNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GaussianViewer": "GaussianViewer",
}
