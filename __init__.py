# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GaussianViewer Contributors

"""
ComfyUI Gaussian Splatting Viewer Plugin

Provides interactive 3D preview for Gaussian Splatting PLY files with
high-quality image output capabilities.
"""

# Shared camera params cache - must be at module level for persistence
CAMERA_PARAMS_BY_KEY = {}

from .preview_gaussian2 import PreviewGaussian2Node, NODE_CLASS_MAPPINGS as PREVIEW_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS as PREVIEW_DISPLAY_MAPPINGS
from .preview_gaussian3 import PreviewGaussian3Node, NODE_CLASS_MAPPINGS as PREVIEW3_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS as PREVIEW3_DISPLAY_MAPPINGS
from .render_gaussian import RenderGaussianNode, NODE_CLASS_MAPPINGS as RENDER_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS as RENDER_DISPLAY_MAPPINGS

# Combine node mappings from both files
NODE_CLASS_MAPPINGS = {
    **PREVIEW_MAPPINGS,
    **PREVIEW3_MAPPINGS,
    **RENDER_MAPPINGS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **PREVIEW_DISPLAY_MAPPINGS,
    **PREVIEW3_DISPLAY_MAPPINGS,
    **RENDER_DISPLAY_MAPPINGS,
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
