# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GaussianViewer Contributors

"""
Shared camera parameters cache.

This module provides a global cache for camera parameters that persists
across Python module reloads and is shared between Preview and Render nodes.
"""

# Global camera parameters cache
# Key: PLY filename or path
# Value: Camera state dict with position, target, fx, fy, etc.
CAMERA_PARAMS_BY_KEY = {}
CAMERA_STATE_VERSION = 0


def get_camera_state(key):
    """Get camera state for a given PLY key."""
    return CAMERA_PARAMS_BY_KEY.get(key)


def set_camera_state(key, camera_state):
    """Set camera state for a given PLY key."""
    if key and camera_state:
        CAMERA_PARAMS_BY_KEY[key] = camera_state
        global CAMERA_STATE_VERSION
        CAMERA_STATE_VERSION += 1


def clear_camera_state(key=None):
    """Clear camera state for a given key or all keys."""
    if key:
        CAMERA_PARAMS_BY_KEY.pop(key, None)
    else:
        CAMERA_PARAMS_BY_KEY.clear()


def list_camera_states():
    """List all cached camera states."""
    return list(CAMERA_PARAMS_BY_KEY.keys())


def get_camera_state_version():
    """Return a monotonically increasing camera state version."""
    return CAMERA_STATE_VERSION
