# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GeometryPack Contributors

"""
Preview Gaussian Splatting PLY files with gsplat.js viewer (v2).

Adds image output support with controllable resolution and aspect ratio.
"""

import os

import numpy as np
import torch
from PIL import Image

try:
    import folder_paths
    COMFYUI_OUTPUT_FOLDER = folder_paths.get_output_directory()
except (ImportError, AttributeError):
    COMFYUI_OUTPUT_FOLDER = None


ASPECT_RATIO_OPTIONS = [
    "source",
    "1:1",
    "1:2",
    "4:3",
    "3:4",
    "16:9",
    "9:16",
]


class PreviewGaussian2Node:
    """
    Preview Gaussian Splatting PLY files (v2).

    Adds an IMAGE output populated from the last exported viewer snapshot.
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
            },
        }

    RETURN_TYPES = ("STRING", "EXTRINSICS", "INTRINSICS")
    RETURN_NAMES = ("ply_path", "extrinsics", "intrinsics")
    OUTPUT_NODE = True
    FUNCTION = "preview_gaussian2"
    CATEGORY = "geompack/visualization"

    def preview_gaussian2(self, ply_path: str, extrinsics=None, intrinsics=None):
        """
        Prepare PLY file for gsplat.js preview and return parameters.
        
        This node only handles preview - no image output.
        Rendering is handled by the separate RenderGaussian node.
        """
        print("=" * 80)
        print("[PreviewGaussian2] ===== PREVIEW NODE EXECUTED =====")
        print("=" * 80)
        
        print(f"[PreviewGaussian2] Input parameters:")
        print(f"  ply_path: {ply_path}")
        print(f"  extrinsics: {extrinsics is not None}")
        print(f"  intrinsics: {intrinsics is not None}")
        
        if not ply_path:
            print("[PreviewGaussian2] ERROR: No PLY path provided")
            return {"ui": {"error": ["No PLY path provided"]}, "result": (ply_path, extrinsics, intrinsics)}

        if not os.path.exists(ply_path):
            print(f"[PreviewGaussian2] ERROR: PLY file not found: {ply_path}")
            return {"ui": {"error": [f"File not found: {ply_path}"]}, "result": (ply_path, extrinsics, intrinsics)}

        filename = os.path.basename(ply_path)
        if COMFYUI_OUTPUT_FOLDER and ply_path.startswith(COMFYUI_OUTPUT_FOLDER):
            relative_path = os.path.relpath(ply_path, COMFYUI_OUTPUT_FOLDER)
        else:
            relative_path = filename

        file_size = os.path.getsize(ply_path)
        file_size_mb = file_size / (1024 * 1024)

        print(f"[PreviewGaussian2] File info:")
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
            print(f"[PreviewGaussian2] Extrinsics provided: {len(extrinsics)}x{len(extrinsics[0])}")
        if intrinsics is not None:
            ui_data["intrinsics"] = [intrinsics]
            print(f"[PreviewGaussian2] Intrinsics provided: {len(intrinsics)}x{len(intrinsics[0])}")

        print(f"[PreviewGaussian2] UI data keys: {list(ui_data.keys())}")
        print("[PreviewGaussian2] ===== PREVIEW COMPLETE =====")
        print("=" * 80)
        
        return {"ui": ui_data, "result": (ply_path, extrinsics, intrinsics)}


NODE_CLASS_MAPPINGS = {
    "GeomPackPreviewGaussian2": PreviewGaussian2Node,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeomPackPreviewGaussian2": "Preview Gaussian 2.0 (Deprecated)",
}
