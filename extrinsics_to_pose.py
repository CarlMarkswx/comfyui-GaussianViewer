# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2025 ComfyUI-GaussianViewer Contributors

"""
Convert camera extrinsics matrix to pose parameters (x, y, z, pitch, yaw, roll).
"""

import math
import numpy as np


def rotation_matrix_to_euler(R):
    """
    Convert a 3x3 rotation matrix to Euler angles (pitch, yaw, roll) in degrees.
    
    Uses the convention:
    - Pitch: rotation around X axis
    - Yaw: rotation around Y axis  
    - Roll: rotation around Z axis
    
    Order: YXZ (yaw, pitch, roll)
    """
    # Extract rotation matrix elements
    r00, r01, r02 = R[0][0], R[0][1], R[0][2]
    r10, r11, r12 = R[1][0], R[1][1], R[1][2]
    r20, r21, r22 = R[2][0], R[2][1], R[2][2]
    
    # Check for gimbal lock
    if abs(r21) < 0.99999:
        pitch = math.asin(-r21)
        yaw = math.atan2(r20, r22)
        roll = math.atan2(r01, r11)
    else:
        # Gimbal lock case
        pitch = math.copysign(math.pi / 2, -r21)
        yaw = math.atan2(-r02, r00)
        roll = 0.0
    
    # Convert to degrees
    pitch_deg = math.degrees(pitch)
    yaw_deg = math.degrees(yaw)
    roll_deg = math.degrees(roll)
    
    return pitch_deg, yaw_deg, roll_deg


class ExtrinsicsToPoseNode:
    """
    Convert a 4x4 camera extrinsics matrix to pose parameters.
    
    Outputs x, y, z position and pitch, yaw, roll rotation in degrees.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "extrinsics": ("EXTRINSICS", {
                    "tooltip": "4x4 camera extrinsics matrix"
                }),
            },
        }

    RETURN_TYPES = ("FLOAT", "FLOAT", "FLOAT", "FLOAT", "FLOAT", "FLOAT", "STRING")
    RETURN_NAMES = ("x", "y", "z", "pitch", "yaw", "roll", "pose_string")
    FUNCTION = "convert"
    CATEGORY = "geompack/camera"

    def convert(self, extrinsics):
        """
        Convert extrinsics matrix to pose parameters.
        """
        if extrinsics is None:
            print("[ExtrinsicsToPose] ERROR: No extrinsics provided")
            return (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, "")

        # Extract position from the 4th column
        x = float(extrinsics[0][3])
        y = float(extrinsics[1][3])
        z = float(extrinsics[2][3])

        # Extract 3x3 rotation matrix
        R = [
            [extrinsics[0][0], extrinsics[0][1], extrinsics[0][2]],
            [extrinsics[1][0], extrinsics[1][1], extrinsics[1][2]],
            [extrinsics[2][0], extrinsics[2][1], extrinsics[2][2]],
        ]

        # Convert rotation to Euler angles
        pitch, yaw, roll = rotation_matrix_to_euler(R)

        # Round for cleaner output
        x = round(x, 2)
        y = round(y, 2)
        z = round(z, 2)
        pitch = round(pitch, 2)
        yaw = round(yaw, 2)
        roll = round(roll, 2)

        # Create formatted string output
        pose_string = f'"x":{x},"y":{y},"z":{z},"pitch":{pitch},"yaw":{yaw},"roll":{roll}'

        print(f"[ExtrinsicsToPose] Position: x={x}, y={y}, z={z}")
        print(f"[ExtrinsicsToPose] Rotation: pitch={pitch}, yaw={yaw}, roll={roll}")
        print(f"[ExtrinsicsToPose] Pose string: {pose_string}")

        return (x, y, z, pitch, yaw, roll, pose_string)


NODE_CLASS_MAPPINGS = {
    "ExtrinsicsToPose": ExtrinsicsToPoseNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ExtrinsicsToPose": "Extrinsics to Pose",
}
