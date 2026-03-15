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

function ensureGeompackConfirmDialog() {
    if (window.__GEOMPACK_CONFIRM_DIALOG__) {
        return window.__GEOMPACK_CONFIRM_DIALOG__;
    }

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.55)";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "100000";

    const panel = document.createElement("div");
    panel.style.width = "min(420px, calc(100vw - 32px))";
    panel.style.background = "#1f1f1f";
    panel.style.border = "1px solid #3d3d3d";
    panel.style.borderRadius = "10px";
    panel.style.boxShadow = "0 10px 30px rgba(0,0,0,0.45)";
    panel.style.padding = "14px 14px 12px 14px";
    panel.style.color = "#ddd";
    panel.style.fontFamily = "Inter, Segoe UI, sans-serif";

    const titleEl = document.createElement("div");
    titleEl.style.fontSize = "14px";
    titleEl.style.fontWeight = "700";
    titleEl.style.marginBottom = "8px";

    const messageEl = document.createElement("div");
    messageEl.style.fontSize = "12px";
    messageEl.style.color = "#bdbdbd";
    messageEl.style.lineHeight = "1.45";
    messageEl.style.whiteSpace = "pre-wrap";

    const actions = document.createElement("div");
    actions.style.marginTop = "14px";
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "8px";

    const cancelBtn = document.createElement("button");
    cancelBtn.style.border = "1px solid #555";
    cancelBtn.style.background = "#2d2d2d";
    cancelBtn.style.color = "#ddd";
    cancelBtn.style.padding = "6px 12px";
    cancelBtn.style.borderRadius = "6px";
    cancelBtn.style.cursor = "pointer";

    const confirmBtn = document.createElement("button");
    confirmBtn.style.border = "1px solid #4f6bd6";
    confirmBtn.style.background = "#4f6bd6";
    confirmBtn.style.color = "#fff";
    confirmBtn.style.padding = "6px 12px";
    confirmBtn.style.borderRadius = "6px";
    confirmBtn.style.cursor = "pointer";

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    panel.appendChild(titleEl);
    panel.appendChild(messageEl);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let resolver = null;
    const close = (value) => {
        overlay.style.display = "none";
        const fn = resolver;
        resolver = null;
        if (fn) fn(!!value);
    };

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
    });

    cancelBtn.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));

    const show = ({ title, message, confirmText, cancelText, level }) => {
        titleEl.textContent = title || "Confirm";
        messageEl.textContent = message || "Please confirm this operation.";
        confirmBtn.textContent = confirmText || "Confirm";
        cancelBtn.textContent = cancelText || "Cancel";

        if (level === "danger") {
            confirmBtn.style.background = "#c74646";
            confirmBtn.style.borderColor = "#c74646";
        } else if (level === "warning") {
            confirmBtn.style.background = "#b87922";
            confirmBtn.style.borderColor = "#b87922";
        } else {
            confirmBtn.style.background = "#4f6bd6";
            confirmBtn.style.borderColor = "#4f6bd6";
        }

        overlay.style.display = "flex";
        return new Promise((resolve) => {
            resolver = resolve;
        });
    };

    window.__GEOMPACK_CONFIRM_DIALOG__ = { show };
    return window.__GEOMPACK_CONFIRM_DIALOG__;
}

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
                const WIDGET_OFFSET = 100;
                let lastHeight = 0;
                widget.computeSize = function(width) {
                    const h = Math.floor(Math.max(100, node.size[1] - WIDGET_OFFSET) / 10) * 10;
                    if (Math.abs(h - lastHeight) < 10) return [width, lastHeight];
                    lastHeight = h;
                    return [width, h];
                };

                // Override node's computeSize to return a fixed minimum, preventing auto-expansion
                this.computeSize = function() {
                    return [512, 200];
                };

                // Store references
                this.gaussianViewerIframe = iframe;
                this.gaussianInfoPanel = infoPanel;

                // Track whether initial settings have been sent to iframe
                this.hasInitializedSettings = false;
                this._hasAutoResized = false;

                // Function to resize node dynamically
                this.resizeToAspectRatio = function(imageWidth, imageHeight) {
                    const width = Number(imageWidth);
                    const height = Number(imageHeight);
                    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
                        console.warn("[GeomPack Gaussian v2] Skip auto resize: invalid image size", imageWidth, imageHeight);
                        return;
                    }

                    const aspectRatio = width / height;
                    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
                        console.warn("[GeomPack Gaussian v2] Skip auto resize: invalid aspect ratio", aspectRatio);
                        return;
                    }

                    const MIN_NODE_WIDTH = 512;
                    const MAX_NODE_WIDTH = 800;
                    const MIN_VIEWER_HEIGHT = 180;
                    const MAX_VIEWER_HEIGHT = 900;

                    const nodeWidth = Math.min(Math.max(MIN_NODE_WIDTH, node.size[0]), MAX_NODE_WIDTH);
                    const viewerHeightRaw = Math.round(nodeWidth / aspectRatio);
                    const viewerHeight = Math.min(Math.max(MIN_VIEWER_HEIGHT, viewerHeightRaw), MAX_VIEWER_HEIGHT);
                    const nodeHeight = viewerHeight + WIDGET_OFFSET;

                    // Only resize if the change is significant to avoid tiny loops
                    if (Math.abs(node.size[1] - nodeHeight) > 10 || Math.abs(node.size[0] - nodeWidth) > 10) {
                        node.setSize([nodeWidth, nodeHeight]);
                        node.setDirtyCanvas(true, true);
                        app.graph.setDirtyCanvas(true, true);
                        console.log("[GeomPack Gaussian v2] Resized node to:", nodeWidth, "x", nodeHeight, "(aspect ratio:", aspectRatio.toFixed(2), ")");
                    }
                };

                // Track iframe load state
                let iframeLoaded = false;
                const handleIframeLoad = () => {
                    iframeLoaded = true;
                    if (this.pendingMeshInfo) {
                        this.fetchAndSend?.(this.pendingMeshInfo);
                    }
                };
                iframe.addEventListener('load', handleIframeLoad);
                this._geompackIframeLoadHandler = handleIframeLoad;
                
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
                    this._geompackRenderRequestHandler = handleRenderRequest;
                }

                // Listen for messages from iframe
                const handleWindowMessage = async (event) => {
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
                    else if (event.data.type === 'PRESET_CONFIRM_REQUEST' && event.data.request_id) {
                        const dialog = ensureGeompackConfirmDialog();
                        const confirmed = await dialog.show({
                            title: event.data.title,
                            message: event.data.message,
                            confirmText: event.data.confirm_text,
                            cancelText: event.data.cancel_text,
                            level: event.data.level
                        });

                        iframe.contentWindow?.postMessage({
                            type: 'PRESET_CONFIRM_RESULT',
                            request_id: event.data.request_id,
                            confirmed,
                            timestamp: Date.now()
                        }, '*');
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
                };
                window.addEventListener('message', handleWindowMessage);
                this._geompackPreviewWindowHandler = handleWindowMessage;

                // Set initial node size
                this.setSize([512, 580]);
                this.resizable = true;

                this.onResize = function(size) {
                    if (this.setDirtyCanvas) {
                        this.setDirtyCanvas(true, true);
                    }
                };

                const onRemoved = this.onRemoved;
                this.onRemoved = function() {
                    if (this._geompackPreviewWindowHandler) {
                        window.removeEventListener('message', this._geompackPreviewWindowHandler);
                    }
                    if (this._geompackRenderRequestHandler) {
                        api.removeEventListener("geompack_render_request", this._geompackRenderRequestHandler);
                    }
                    if (this._geompackIframeLoadHandler) {
                        iframe.removeEventListener('load', this._geompackIframeLoadHandler);
                    }
                    if (window.GEOMPACK_PREVIEW_IFRAMES) {
                        if (this.currentPlyFile) delete window.GEOMPACK_PREVIEW_IFRAMES[this.currentPlyFile];
                        if (this.currentFilename) delete window.GEOMPACK_PREVIEW_IFRAMES[this.currentFilename];
                    }
                    onRemoved?.apply(this, arguments);
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

                        // Resize node once to match image aspect ratio from intrinsics
                        if (!this._hasAutoResized && intrinsics && intrinsics[0] && intrinsics[1]) {
                            const cx = Number(intrinsics[0][2]);
                            const cy = Number(intrinsics[1][2]);
                            const imageWidth = cx * 2;
                            const imageHeight = cy * 2;
                            if (Number.isFinite(imageWidth) && Number.isFinite(imageHeight) && imageWidth > 0 && imageHeight > 0) {
                                this.resizeToAspectRatio(imageWidth, imageHeight);
                                this._hasAutoResized = true;
                            } else {
                                console.warn("[GeomPack Gaussian v2] Skip auto resize: invalid intrinsics", intrinsics);
                            }
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
