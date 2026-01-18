# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GaussianViewer Contributors

"""
ComfyUI Gaussian Splatting Viewer Plugin

Provides interactive 3D preview for Gaussian Splatting PLY files with
high-quality image output capabilities.
"""

# Shared camera params cache - must be at module level for persistence
CAMERA_PARAMS_BY_KEY = {}

from .gaussian_viewer import GaussianViewerNode, NODE_CLASS_MAPPINGS as VIEWER_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS as VIEWER_DISPLAY_MAPPINGS

# Combine node mappings from active nodes only (deprecated nodes hidden)
NODE_CLASS_MAPPINGS = {
    **VIEWER_MAPPINGS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **VIEWER_DISPLAY_MAPPINGS,
}

WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
