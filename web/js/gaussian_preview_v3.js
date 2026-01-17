/**
 * ComfyUI GeomPack - Gaussian Splat Preview Widget (v3)
 * Combines preview UI with render request handling (IMAGE output).
 */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Auto-detect extension folder name (handles ComfyUI-GeometryPack or comfyui-geometrypack)
const EXTENSION_FOLDER = (() => {
    const url = import.meta.url;
    const match = url.match(/\/extensions\/([^/]+)\//);
    return match ? match[1] : "ComfyUI-GeometryPack";
})();

console.log("[GeomPack Gaussian v3] Loading extension...");

app.registerExtension({
    name: "geompack.gaussianpreview.v3",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "GeomPackPreviewGaussian3") {
            console.log("[GeomPack Gaussian v3] Registering Preview Gaussian 3.0 node");

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

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

                container.appendChild(iframe);
                container.appendChild(infoPanel);

                const widget = this.addDOMWidget("preview_gaussian_v3", "GAUSSIAN_PREVIEW_V3", container, {
                    getValue() { return ""; },
                    setValue(v) { }
                });

                const node = this;
                let currentNodeSize = [512, 580];

                widget.computeSize = () => currentNodeSize;

                this.gaussianViewerIframe = iframe;
                this.gaussianInfoPanel = infoPanel;

                this.hasInitializedSettings = false;

                this.resizeToAspectRatio = function(imageWidth, imageHeight) {
                    const aspectRatio = imageWidth / imageHeight;
                    const nodeWidth = 512;
                    const viewerHeight = Math.round(nodeWidth / aspectRatio);
                    const nodeHeight = viewerHeight + 60;

                    currentNodeSize = [nodeWidth, nodeHeight];
                    node.setSize(currentNodeSize);
                    node.setDirtyCanvas(true, true);
                    app.graph.setDirtyCanvas(true, true);

                    console.log("[GeomPack Gaussian v3] Resized node to:", nodeWidth, "x", nodeHeight, "(aspect ratio:", aspectRatio.toFixed(2), ")");
                };

                let iframeLoaded = false;
                let meshLoaded = false;
                let pendingMeshLoad = null;
                let pendingMeshResolve = null;
                let pendingMeshReject = null;

                const markMeshLoading = () => {
                    meshLoaded = false;
                    if (pendingMeshReject) {
                        pendingMeshReject(new Error("Mesh load superseded"));
                    }
                    pendingMeshLoad = new Promise((resolve, reject) => {
                        pendingMeshResolve = resolve;
                        pendingMeshReject = reject;
                    });
                    return pendingMeshLoad;
                };

                iframe.addEventListener('load', () => {
                    iframeLoaded = true;
                    if (this.pendingMeshInfo) {
                        this.fetchAndSend?.(this.pendingMeshInfo);
                    }
                });

                window.addEventListener('message', async (event) => {
                    if (event.source !== iframe.contentWindow) {
                        return;
                    }

                    if (event.data.type === 'MESH_LOADED') {
                        meshLoaded = true;
                        if (pendingMeshResolve) {
                            pendingMeshResolve();
                        }
                        pendingMeshLoad = null;
                        pendingMeshResolve = null;
                        pendingMeshReject = null;
                        return;
                    }

                    if (event.data.type === 'MESH_ERROR' && event.data.error) {
                        console.error('[GeomPack Gaussian v3] Error from viewer:', event.data.error);
                        if (infoPanel) {
                            infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error: ${event.data.error}</div>`;
                        }
                        if (pendingMeshReject) {
                            pendingMeshReject(new Error(event.data.error));
                        }
                        pendingMeshLoad = null;
                        pendingMeshResolve = null;
                        pendingMeshReject = null;
                        return;
                    }

                    if (event.data.type === 'SET_CAMERA_PARAMS' && event.data.camera_state) {
                        console.log('[GeomPack Gaussian v3] ===== CAMERA PARAMS RECEIVED =====');
                        console.log('[GeomPack Gaussian v3] Current PLY file:', this.currentPlyFile);
                        console.log('[GeomPack Gaussian v3] Current filename:', this.currentFilename);

                        const plyFile = this.currentPlyFile;
                        const filename = this.currentFilename;

                        if (!plyFile && !filename) {
                            console.warn('[GeomPack Gaussian v3] No PLY info for camera params');
                            console.warn('[GeomPack Gaussian v3] Please make sure Preview node has been executed first');
                            infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error: Please run Preview node first</div>`;
                            setTimeout(() => {
                                infoPanel.innerHTML = '<span style="color: #888;">Gaussian splat info will appear here after execution</span>';
                            }, 3000);
                            return;
                        }

                        console.log('[GeomPack Gaussian v3] Saving camera params to backend...');
                        try {
                            const response = await fetch('/geompack/preview_camera', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    ply_file: plyFile,
                                    filename: filename,
                                    camera_state: event.data.camera_state
                                })
                            });
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }
                            const result = await response.json();
                            console.log('[GeomPack Gaussian v3] Camera params saved successfully:', result);
                            infoPanel.innerHTML = `<span style="color: #6cc;">Camera params saved</span>`;
                            setTimeout(() => {
                                infoPanel.innerHTML = '<span style="color: #888;">Gaussian splat info will appear here after execution</span>';
                            }, 2000);
                        } catch (error) {
                            console.error('[GeomPack Gaussian v3] Failed to save camera params:', error);
                            infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error saving camera: ${error.message}</div>`;
                        }
                        return;
                    }

                    if (event.data.type === 'RENDER_RESULT' && event.data.request_id && event.data.image) {
                        const payload = {
                            ...event.data,
                            source: 'preview_gaussian_v3'
                        };

                        window.postMessage(payload, "*");

                        try {
                            const response = await fetch("/geompack/render_result", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ request_id: payload.request_id, image: payload.image })
                            });
                            if (!response.ok) {
                                console.error("[GeomPack Gaussian v3] Failed to send render result:", response.status);
                            }
                        } catch (error) {
                            console.error("[GeomPack Gaussian v3] Error sending render result:", error);
                        }
                        return;
                    }

                    if (event.data.type === 'RENDER_ERROR' && event.data.request_id) {
                        const payload = {
                            ...event.data,
                            source: 'preview_gaussian_v3'
                        };
                        window.postMessage(payload, "*");
                        return;
                    }
                });

                this.setSize([512, 580]);

                const onExecuted = this.onExecuted;
                this.onExecuted = function(message) {
                    console.log("[GeomPack Gaussian v3] onExecuted called with:", message);
                    onExecuted?.apply(this, arguments);

                    if (message?.error && message.error[0]) {
                        infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error: ${message.error[0]}</div>`;
                        return;
                    }

                    const uiData = message?.ui || message;
                    if (uiData?.ply_file && uiData.ply_file[0]) {
                        const filename = uiData.ply_file[0];
                        const displayName = uiData.filename?.[0] || filename;
                        const fileSizeMb = uiData.file_size_mb?.[0] || 'N/A';

                        const extrinsics = uiData.extrinsics?.[0] || null;
                        const intrinsics = uiData.intrinsics?.[0] || null;

                        if (intrinsics && intrinsics[0] && intrinsics[1]) {
                            const imageWidth = intrinsics[0][2] * 2;
                            const imageHeight = intrinsics[1][2] * 2;
                            this.resizeToAspectRatio(imageWidth, imageHeight);
                        }

                        infoPanel.innerHTML = `
                            <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 8px;">
                                <span style="color: #888;">File:</span>
                                <span style="color: #6cc;">${displayName}</span>
                                <span style="color: #888;">Size:</span>
                                <span>${fileSizeMb} MB</span>
                            </div>
                        `;

                        this.currentPlyFile = filename;
                        this.currentFilename = uiData.filename?.[0] || filename;
                        window.GEOMPACK_PREVIEW_IFRAMES[this.currentPlyFile] = iframe;
                        window.GEOMPACK_PREVIEW_IFRAMES[this.currentFilename] = iframe;

                        const fetchAndSend = async (meshInfo = null) => {
                            const info = meshInfo || { filename, extrinsics, intrinsics };
                            if (!iframe.contentWindow) {
                                console.error("[GeomPack Gaussian v3] Iframe contentWindow not available");
                                return;
                            }

                            try {
                                const targetFilename = info.filename || filename;
                                const targetExtrinsics = info.extrinsics || extrinsics;
                                const targetIntrinsics = info.intrinsics || intrinsics;
                                const targetPath = `/view?filename=${encodeURIComponent(targetFilename)}&type=output&subfolder=`;

                                markMeshLoading();
                                console.log("[GeomPack Gaussian v3] Fetching PLY file:", targetPath);
                                const response = await fetch(targetPath);
                                if (!response.ok) {
                                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                                }
                                const arrayBuffer = await response.arrayBuffer();
                                console.log("[GeomPack Gaussian v3] Fetched PLY file, size:", arrayBuffer.byteLength);

                                iframe.contentWindow.postMessage({
                                    type: "LOAD_MESH_DATA",
                                    data: arrayBuffer,
                                    filename: targetFilename,
                                    extrinsics: targetExtrinsics,
                                    intrinsics: targetIntrinsics,
                                    timestamp: Date.now()
                                }, "*", [arrayBuffer]);
                            } catch (error) {
                                console.error("[GeomPack Gaussian v3] Error fetching PLY:", error);
                                infoPanel.innerHTML = `<div style="color: #ff6b6b;">Error loading PLY: ${error.message}</div>`;
                            }
                        };

                        this.fetchAndSend = fetchAndSend;

                        const meshInfo = { filename, extrinsics, intrinsics };
                        this.pendingMeshInfo = meshInfo;
                        if (iframeLoaded) {
                            fetchAndSend(meshInfo);
                        } else {
                            setTimeout(() => fetchAndSend(meshInfo), 500);
                        }
                    }
                };

                const pendingRenderRequests = new Map();
                const processedRequestIds = new Set();
                const nodeId = this.id;

                const handleRenderRequest = async (event) => {
                    const message = event?.detail || event;
                    if (!message?.request_id) {
                        return;
                    }

                    const requestId = message.request_id;
                    if (processedRequestIds.has(requestId)) {
                        return;
                    }
                    processedRequestIds.add(requestId);

                    if (message.node_id != null && message.node_id !== undefined && message.node_id !== nodeId) {
                        console.log(`[GeomPack Gaussian v3] Request node_id ${message.node_id} does not match current node ${nodeId}, processing in lenient mode`);
                    }

                    const plyFile = message.ply_file;
                    const filename = message.filename || plyFile;
                    const resolution = message.output_resolution || 2048;
                    const aspectRatio = message.output_aspect_ratio || "source";
                    const extrinsics = message.extrinsics || null;
                    const intrinsics = message.intrinsics || null;
                    const cameraState = message.camera_state || null;

                    pendingRenderRequests.set(requestId, {});

                    const ensureMeshReady = async () => {
                        const needsLoad = !meshLoaded || (filename && this.currentFilename !== filename);
                        if (!needsLoad) {
                            return;
                        }
                        const meshInfo = { filename, extrinsics, intrinsics };
                        this.pendingMeshInfo = meshInfo;
                        if (!iframeLoaded) {
                            return new Promise((resolve) => setTimeout(resolve, 500));
                        }
                        await this.fetchAndSend?.(meshInfo);
                        if (pendingMeshLoad) {
                            await pendingMeshLoad;
                        }
                    };

                    try {
                        await ensureMeshReady();
                        if (!iframe.contentWindow) {
                            throw new Error("iframe not available");
                        }

                        if (cameraState) {
                            iframe.contentWindow.postMessage({
                                type: "APPLY_CAMERA_STATE",
                                camera_state: cameraState
                            }, "*");
                        }

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
                    } catch (error) {
                        console.error("[GeomPack Gaussian v3] Render request failed:", error);
                        pendingRenderRequests.delete(requestId);
                        processedRequestIds.delete(requestId);
                        if (iframe.contentWindow) {
                            iframe.contentWindow.postMessage({
                                type: "RENDER_ERROR",
                                request_id: requestId,
                                error: error.message
                            }, "*");
                        }
                    }
                };

                api.addEventListener("geompack_render_request", handleRenderRequest);

                return r;
            };
        }
    }
});
