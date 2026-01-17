# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GaussianViewer Contributors

"""
Preview + Render Gaussian Splatting PLY files (v3).

Combines interactive preview with on-demand render output (IMAGE).
"""

import os

from .render_gaussian import RenderGaussianNode

try:
    import folder_paths
    COMFYUI_OUTPUT_FOLDER = folder_paths.get_output_directory()
except (ImportError, AttributeError):
    COMFYUI_OUTPUT_FOLDER = None


class PreviewGaussian3Node(RenderGaussianNode):
    """
    Preview Gaussian splats and render an IMAGE output in a single node.
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

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_NODE = True
    FUNCTION = "preview_gaussian3"
    CATEGORY = "geompack/visualization"

    def preview_gaussian3(self, ply_path: str, extrinsics=None, intrinsics=None):
        """
        Send preview UI data and render an IMAGE output.
        """
        if not ply_path:
            ui = {"error": ["No PLY path provided"]}
            image = self._create_placeholder_image(2048, 1.0)
            return {"ui": ui, "result": (image,)}

        if not os.path.exists(ply_path):
            ui = {"error": [f"File not found: {ply_path}"]}
            image = self._create_placeholder_image(2048, 1.0)
            return {"ui": ui, "result": (image,)}

        filename = os.path.basename(ply_path)
        if COMFYUI_OUTPUT_FOLDER and ply_path.startswith(COMFYUI_OUTPUT_FOLDER):
            relative_path = os.path.relpath(ply_path, COMFYUI_OUTPUT_FOLDER)
        else:
            relative_path = filename

        file_size = os.path.getsize(ply_path)
        file_size_mb = file_size / (1024 * 1024)

        ui_data = {
            "ply_file": [relative_path],
            "filename": [filename],
            "file_size_mb": [round(file_size_mb, 2)],
        }

        if extrinsics is not None:
            ui_data["extrinsics"] = [extrinsics]
        if intrinsics is not None:
            ui_data["intrinsics"] = [intrinsics]

        image = self.render_gaussian(ply_path, extrinsics, intrinsics)
        return {"ui": ui_data, "result": image}


NODE_CLASS_MAPPINGS = {
    "GeomPackPreviewGaussian3": PreviewGaussian3Node,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeomPackPreviewGaussian3": "Preview Gaussian 3.0",
}
