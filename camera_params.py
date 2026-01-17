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
    result = CAMERA_PARAMS_BY_KEY.get(key)
    print(f"[CameraParams] get_camera_state(key='{key}')")
    print(f"[CameraParams] Result: {result is not None}")
    if result:
        print(f"[CameraParams] Cached position: x={result.get('position', {}).get('x')}, y={result.get('position', {}).get('y')}, z={result.get('position', {}).get('z')}")
        print(f"[CameraParams] Cached focal: fx={result.get('fx')}, fy={result.get('fy')}")
    return result


def set_camera_state(key, camera_state):
    """Set camera state for a given PLY key."""
    global CAMERA_STATE_VERSION
    if key and camera_state:
        print("=" * 80)
        print("[CameraParams] ===== SET_CAMERA_STATE STARTED =====")
        print("=" * 80)
        print(f"[CameraParams] Setting camera state for key: '{key}'")
        print(f"[CameraParams] Camera state keys: {list(camera_state.keys())}")
        print(f"[CameraParams] Camera state details:")
        if 'position' in camera_state:
            pos = camera_state['position']
            print(f"  - Position: x={pos.get('x')}, y={pos.get('y')}, z={pos.get('z')}")
        if 'target' in camera_state:
            tgt = camera_state['target']
            print(f"  - Target: x={tgt.get('x')}, y={tgt.get('y')}, z={tgt.get('z')}")
        if 'fx' in camera_state or 'fy' in camera_state:
            print(f"  - Focal length: fx={camera_state.get('fx')}, fy={camera_state.get('fy')}")
        if 'image_width' in camera_state or 'image_height' in camera_state:
            print(f"  - Image size: {camera_state.get('image_width')}x{camera_state.get('image_height')}")
        if 'scale' in camera_state:
            print(f"  - Scale: {camera_state.get('scale')}")
        if 'scale_compensation' in camera_state:
            print(f"  - Scale compensation: {camera_state.get('scale_compensation')}")
        
        old_version = CAMERA_STATE_VERSION
        CAMERA_PARAMS_BY_KEY[key] = camera_state
        CAMERA_STATE_VERSION += 1
        
        print(f"[CameraParams] Camera state saved successfully")
        print(f"[CameraParams] Version updated: {old_version} -> {CAMERA_STATE_VERSION}")
        print(f"[CameraParams] Total cached states: {len(CAMERA_PARAMS_BY_KEY)}")
        print(f"[CameraParams] Cached keys: {list(CAMERA_PARAMS_BY_KEY.keys())}")
        print("[CameraParams] ===== SET_CAMERA_STATE COMPLETE =====")
        print("=" * 80)
    else:
        print(f"[CameraParams] WARNING: set_camera_state called with key={key}, camera_state={camera_state is not None}")


def clear_camera_state(key=None):
    """Clear camera state for a given key or all keys."""
    if key is None:
        key_str = 'None (all)'
    else:
        key_str = f"'{key}'"
    print(f"[CameraParams] clear_camera_state(key={key_str})")
    if key:
        removed = CAMERA_PARAMS_BY_KEY.pop(key, None)
        print(f"[CameraParams] Removed state for key '{key}': {removed is not None}")
    else:
        count = len(CAMERA_PARAMS_BY_KEY)
        CAMERA_PARAMS_BY_KEY.clear()
        print(f"[CameraParams] Cleared all {count} cached states")
    print(f"[CameraParams] Remaining cached keys: {list(CAMERA_PARAMS_BY_KEY.keys())}")


def list_camera_states():
    """List all cached camera states."""
    keys = list(CAMERA_PARAMS_BY_KEY.keys())
    print(f"[CameraParams] list_camera_states() - Found {len(keys)} cached states")
    for key in keys:
        state = CAMERA_PARAMS_BY_KEY[key]
        print(f"[CameraParams]   - '{key}': position={state.get('position')}, fx={state.get('fx')}, fy={state.get('fy')}")
    return keys


def get_camera_state_version():
    """Return a monotonically increasing camera state version."""
    return CAMERA_STATE_VERSION
