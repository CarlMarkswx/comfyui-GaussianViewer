/**
 * ComfyUI GeomPack - Gaussian Splat Preview Widget (v2)
 * Adds image output support for the previewed splats.
 */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Auto-detect extension folder name (handles ComfyUI-GeometryPack or comfyui-geometrypack)
const EXTENSION_FOLDER = (() => {
    const url = import.meta.url;
    const match = url.match(/\/extensions\/([^/]+)\//);
    return match ? match[1] : "ComfyUI-GeometryPack";
})();

console.log("[GeomPack Gaussian v2] Loading extension...");

app.registerExtension({
    name: "geompack.gaussianpreview.v2",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "GeomPackPreviewGaussian2" || nodeData.name === "GaussianViewer") {
            console.log("[GeomPack Gaussian v2] Registering Preview Gaussian 2.0 node");

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const isGaussianViewer = nodeData.name === "GaussianViewer";

                window.GEOMPACK_PREVIEW_IFRAMES = window.GEOMPACK_PREVIEW_IFRAMES || {};

                // Create container for viewer + info panel
                const container = document.createElement("div");
                container.style.width = "100%";
                container.style.height = "100%";
                container.style.display = "flex";
                container.style.flexDirection = "column";
                container.style.backgroundColor = "#1a1a1a";
                container.style.overflow = "hidden";

                // Create iframe for gsplat.js viewer
                const iframe = document.createElement("iframe");
                iframe.style.width = "100%";
                iframe.style.flex = "1 1 0";
                iframe.style.minHeight = "0";
                iframe.style.border = "none";
                iframe.style.backgroundColor = "#1a1a1a";

                // Point to gsplat.js HTML viewer (with cache buster)
                iframe.src = `/extensions/${EXTENSION_FOLDER}/viewer_gaussian_v2.html?v=` + Date.now();

                // Create info panel
                const infoPanel = document.createElement("div");
                infoPanel.style.backgroundColor = "#1a1a1a";
                infoPanel.style.borderTop = "1px solid #444";
                infoPanel.style.padding = "6px 12px";
                infoPanel.style.fontSize = "10px";
                infoPanel.style.fontFamily = "monospace";
                infoPanel.style.color = "#ccc";
                infoPanel.style.lineHeight = "1.3";
                infoPanel.style.flexShrink = "0";
                infoPanel.style.overflow = "hidden";
                infoPanel.innerHTML = '<span style="color: #888;">Gaussian splat info will appear here after execution</span>';

                // Add iframe and info panel to container
                container.appendChild(iframe);
                container.appendChild(infoPanel);

                // Add widget with required options
                const widget = this.addDOMWidget("preview_gaussian_v2", "GAUSSIAN_PREVIEW_V2", container, {
                    getValue() { return ""; },
                    setValue(v) { }
                });

                // Store reference to node for dynamic resizing
                const node = this;

                // computeSize should return the current node size to allow the widget to fill the node
                let lastHeight = 0;
                widget.computeSize = function(width) {
                    const h = Math.max(100, node.size[1] - 80); // Increased offset to 80 to prevent growth loops
                    if (Math.abs(h - lastHeight) < 4) return [width, lastHeight];
                    lastHeight = h;
                    return [width, h];
                };

                // Override node's computeSize to return a fixed minimum, preventing auto-expansion
                this.computeSize = function() {
                    return [512, 580];
                };

                // Store references
                this.gaussianViewerIframe = iframe;
                this.gaussianInfoPanel = infoPanel;

                // Track whether initial settings have been sent to iframe
                this.hasInitializedSettings = false;

                // Function to resize node dynamically
                this.resizeToAspectRatio = function(imageWidth, imageHeight) {
                    const aspectRatio = imageWidth / imageHeight;
                    const nodeWidth = Math.max(512, node.size[0]);
                    const viewerHeight = Math.round(nodeWidth / aspectRatio);
                    const nodeHeight = viewerHeight + 60;  // Add space for info panel

                    node.setSize([nodeWidth, nodeHeight]);
                    node.setDirtyCanvas(true, true);
                    app.graph.setDirtyCanvas(true, true);

                    console.log("[GeomPack Gaussian v2] Resized node to:", nodeWidth, "x", nodeHeight, "(aspect ratio:", aspectRatio.toFixed(2), ")");
                };

                // Track iframe load state
                let iframeLoaded = false;
                iframe.addEventListener('load', () => {
                    iframeLoaded = true;
                    if (this.pendingMeshInfo) {
                        this.fetchAndSend?.(this.pendingMeshInfo);
                    }
                });
                
                if (isGaussianViewer) {
                    const nodeId = this.id;
                    const handleRenderRequest = async (event) => {
                        const message = event?.detail || event;
                        if (!message?.request_id) {
                            return;
                        }
                        if (message.node_id != null && message.node_id !== undefined && message.node_id !== nodeId) {
                            return;
                        }
                        if (!iframe.contentWindow) {
                            console.error("[GeomPack Gaussian v2] Render request received but iframe not ready");
                            return;
                        }

                        const requestId = message.request_id;
                        const resolution = message.output_resolution || 2048;
                        const aspectRatio = message.output_aspect_ratio || "source";

                        iframe.contentWindow.postMessage({
                            type: "OUTPUT_SETTINGS",
                            output_resolution: resolution,
                            output_aspect_ratio: aspectRatio
                        }, "*");

                        iframe.contentWindow.postMessage({
                            type: "RENDER_REQUEST",
                            request_id: requestId,
                            output_resolution: resolution,
                            output_aspect_ratio: aspectRatio
                        }, "*");

                        console.log("[GeomPack Gaussian v2] Forwarded render request to preview iframe:", requestId);
                    };

                    api.addEventListener("geompack_render_request", handleRenderRequest);
                }

                // Listen for messages from iframe
                window.addEventListener('message', async (event) => {
                    if (event.source !== iframe.contentWindow) {
                        return;
                    }
                    // Handle screenshot messages (optional)
                    if (event.data.type === 'SCREENSHOT_V2' && event.data.image) {
                        try {
                            // Convert base64 data URL to blob
                            const base64Data = event.data.image.split(',')[1];
                            const byteString = atob(base64Data);
                            const arrayBuffer = new ArrayBuffer(byteString.length);
                            const uint8Array = new Uint8Array(arrayBuffer);

                            for (let i = 0; i < byteString.length; i++) {
                                uint8Array[i] = byteString.charCodeAt(i);
                            }

                            const blob = new Blob([uint8Array], { type: 'image/png' });

                            // Generate filename with timestamp
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const filename = `gaussian-screenshot-${timestamp}.png`;

                            // Create FormData for upload
                            const formData = new FormData();
                            formData.append('image', blob, filename);
                            formData.append('type', 'output');
                            formData.append('subfolder', '');

                            // Upload to ComfyUI backend
                            const response = await fetch('/upload/image', {
                                method: 'POST',
                                body: formData
                            });

                            if (response.ok) {
                                const result = await response.json();
                                console.log('[GeomPack Gaussian v2] Screenshot saved:', result.name);
                            } else {
                                throw new Error(`Upload failed: ${response.status}`);
                            }

                        } catch (error) {
                            console.error('[GeomPack Gaussian v2] Error saving screenshot:', error);
                        }
                    }
                    // Handle error messages from iframe
                    else if (event.data.type === 'MESH_ERROR' && event.data.error) {
                        console.error('[GeomPack Gaussian v2] Error from viewer:', event.data.error);
                        if (infoPanel) {
                            infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error: ${event.data.error}</div>`;
                        }
                    }
                    // Handle camera params from iframe
                    else if (event.data.type === 'SET_CAMERA_PARAMS' && event.data.camera_state) {
                        console.log('[GeomPack Gaussian v2] ===== CAMERA PARAMS RECEIVED =====');
                        console.log('[GeomPack Gaussian v2] Current PLY file:', this.currentPlyFile);
                        console.log('[GeomPack Gaussian v2] Current filename:', this.currentFilename);
                        
                        const cameraState = event.data.camera_state;
                        console.log('[GeomPack Gaussian v2] Camera state details:');
                        console.log('[GeomPack Gaussian v2]   Position:', cameraState.position);
                        console.log('[GeomPack Gaussian v2]   Target:', cameraState.target);
                        console.log('[GeomPack Gaussian v2]   Focal length (fx):', cameraState.fx);
                        console.log('[GeomPack Gaussian v2]   Focal length (fy):', cameraState.fy);
                        console.log('[GeomPack Gaussian v2]   Image size:', `${cameraState.image_width}x${cameraState.image_height}`);
                        console.log('[GeomPack Gaussian v2]   Scale:', cameraState.scale);
                        console.log('[GeomPack Gaussian v2]   Scale compensation:', cameraState.scale_compensation);
                        
                        // Calculate and log FOV
                        if (cameraState.fy && cameraState.image_height) {
                            const fovY = 2 * Math.atan(cameraState.image_height / (2 * cameraState.fy));
                            const fovYDeg = fovY * 180 / Math.PI;
                            console.log('[GeomPack Gaussian v2]   Calculated FOV Y:', fovYDeg.toFixed(2), 'degrees');
                        }
                        
                        const plyFile = this.currentPlyFile;
                        const filename = this.currentFilename;
                        
                        if (!plyFile && !filename) {
                            console.warn('[GeomPack Gaussian v2] No PLY info for camera params');
                            console.warn('[GeomPack Gaussian v2] Please make sure Preview node has been executed first');
                            infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error: Please run Preview node first</div>`;
                            setTimeout(() => {
                                infoPanel.innerHTML = '<span style="color: #888;">Gaussian splat info will appear here after execution</span>';
                            }, 3000);
                            return;
                        }
                        
                        console.log('[GeomPack Gaussian v2] Preparing to send camera params to backend...');
                        console.log('[GeomPack Gaussian v2] Payload:', {
                            ply_file: plyFile,
                            filename: filename,
                            has_camera_state: !!cameraState
                        });
                        
                        try {
                            const response = await fetch('/geompack/preview_camera', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    ply_file: plyFile,
                                    filename: filename,
                                    camera_state: cameraState
                                })
                            });
                            console.log('[GeomPack Gaussian v2] Backend response status:', response.status, response.statusText);
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }
                            const result = await response.json();
                            console.log('[GeomPack Gaussian v2] Camera params saved successfully:', result);
                            infoPanel.innerHTML = `<span style="color: #6cc;">✓ Camera params saved</span>`;
                            setTimeout(() => {
                                infoPanel.innerHTML = '<span style="color: #888;">Gaussian splat info will appear here after execution</span>';
                            }, 2000);
                        } catch (error) {
                            console.error('[GeomPack Gaussian v2] Failed to save camera params:', error);
                            console.error('[GeomPack Gaussian v2] Error stack:', error.stack);
                            infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error saving camera: ${error.message}</div>`;
                        }
                    }
                    // Handle render results for Render node
                    else if (event.data.type === 'RENDER_RESULT' && event.data.request_id && event.data.image) {
                        const payload = {
                            ...event.data,
                            source: 'preview_gaussian_v2'
                        };

                        window.postMessage(payload, "*");

                        try {
                            const response = await fetch("/geompack/render_result", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ request_id: payload.request_id, image: payload.image })
                            });
                            if (!response.ok) {
                                console.error("[GeomPack Gaussian v2] Failed to send render result:", response.status);
                            } else {
                                console.log("[GeomPack Gaussian v2] Render result forwarded to backend");
                            }
                        } catch (error) {
                            console.error("[GeomPack Gaussian v2] Error sending render result:", error);
                        }
                    } else if (event.data.type === 'RENDER_ERROR' && event.data.request_id) {
                        const payload = {
                            ...event.data,
                            source: 'preview_gaussian_v2'
                        };
                        window.postMessage(payload, "*");
                    }
                });

                // Set initial node size
                this.setSize([512, 580]);
                this.resizable = true;

                this.onResize = function(size) {
                    if (this.setDirtyCanvas) {
                        this.setDirtyCanvas(true, true);
                    }
                };

                // Handle execution
                const onExecuted = this.onExecuted;
                this.onExecuted = function(message) {
                    console.log("[GeomPack Gaussian v2] onExecuted called with:", message);
                    onExecuted?.apply(this, arguments);

                    // Check for errors
                    if (message?.error && message.error[0]) {
                        infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error: ${message.error[0]}</div>`;
                        return;
                    }

                    const uiData = message?.ui || message;
                    if (uiData?.ply_file && uiData.ply_file[0]) {
                        const filename = uiData.ply_file[0];
                        const displayName = uiData.filename?.[0] || filename;
                        const fileSizeMb = uiData.file_size_mb?.[0] || 'N/A';

                        // Extract camera parameters if provided
                        const extrinsics = uiData.extrinsics?.[0] || null;
                        const intrinsics = uiData.intrinsics?.[0] || null;
                        const overlay_image = uiData.overlay_image?.[0] || null;

                        // Resize node to match image aspect ratio from intrinsics
                        if (intrinsics && intrinsics[0] && intrinsics[1]) {
                            const imageWidth = intrinsics[0][2] * 2;   // cx * 2
                            const imageHeight = intrinsics[1][2] * 2;  // cy * 2
                            this.resizeToAspectRatio(imageWidth, imageHeight);
                        }

                        // Update info panel
                        infoPanel.innerHTML = `
                            <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;">
                                <span style="color: #888;">File:</span>
                                <span style="color: #6cc;">${displayName}</span>
                                <span style="color: #888;">Size:</span>
                                <span>${fileSizeMb} MB</span>
                            </div>
                        `;

                        // Store current file info for camera param saving
                        this.currentPlyFile = filename;
                        this.currentFilename = uiData.filename?.[0] || filename;
                        window.GEOMPACK_PREVIEW_IFRAMES[this.currentPlyFile] = iframe;
                        window.GEOMPACK_PREVIEW_IFRAMES[this.currentFilename] = iframe;

                        // ComfyUI serves output files via /view API endpoint
                        const filepath = `/view?filename=${encodeURIComponent(filename)}&type=output&subfolder=`;

                        // Function to fetch and send data to iframe
                        const fetchAndSend = async (meshInfo = null) => {
                            const info = meshInfo || {
                                filename,
                                extrinsics,
                                intrinsics,
                                overlay_image
                            };
                            if (!iframe.contentWindow) {
                                console.error("[GeomPack Gaussian v2] Iframe contentWindow not available");
                                return;
                            }

                            try {
                                // Fetch the PLY file from parent context (authenticated)
                                const targetFilename = info.filename || filename;
                                const targetExtrinsics = info.extrinsics || extrinsics;
                                const targetIntrinsics = info.intrinsics || intrinsics;
                                const targetOverlayImage = info.overlay_image || overlay_image;
                                const targetPath = `/view?filename=${encodeURIComponent(targetFilename)}&type=output&subfolder=`;

                                console.log("[GeomPack Gaussian v2] Fetching PLY file:", targetPath);
                                const response = await fetch(targetPath);
                                if (!response.ok) {
                                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                                }
                                const arrayBuffer = await response.arrayBuffer();
                                console.log("[GeomPack Gaussian v2] Fetched PLY file, size:", arrayBuffer.byteLength);

                                // Send the data to iframe with camera parameters
                                iframe.contentWindow.postMessage({
                                    type: "LOAD_MESH_DATA",
                                    data: arrayBuffer,
                                    filename: targetFilename,
                                    extrinsics: targetExtrinsics,
                                    intrinsics: targetIntrinsics,
                                    overlay_image: targetOverlayImage,
                                    timestamp: Date.now()
                                }, "*", [arrayBuffer]);
                            } catch (error) {
                                console.error("[GeomPack Gaussian v2] Error fetching PLY:", error);
                                infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error loading PLY: ${error.message}</div>`;
                            }
                        };
                        this.fetchAndSend = fetchAndSend;

                        // Fetch and send when iframe is ready
                        const meshInfo = { filename, extrinsics, intrinsics, overlay_image };
                        this.pendingMeshInfo = meshInfo;
                        if (iframeLoaded) {
                            fetchAndSend(meshInfo);
                        } else {
                            setTimeout(() => fetchAndSend(meshInfo), 500);
                        }
                    }
                };

                return r;
            };
        }
    }
});
