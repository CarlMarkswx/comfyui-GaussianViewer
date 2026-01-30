/**
 * ComfyUI GeomPack - Gaussian Splat Render Widget
 * Handles rendering requests and returns results to Python backend.
 */

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Auto-detect extension folder name
const EXTENSION_FOLDER = (() => {
    const url = import.meta.url;
    const match = url.match(/\/extensions\/([^/]+)\//);
    return match ? match[1] : "ComfyUI-GeometryPack";
})();

console.log("[GeomPack Render Gaussian] Loading extension...");

app.registerExtension({
    name: "geompack.rendergaussian",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "GeomPackRenderGaussian") {
            console.log("[GeomPack Render Gaussian] Registering Render Gaussian node");

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // Create container for iframe + info panel
                const container = document.createElement("div");
                container.style.width = "100%";
                container.style.height = "100%";
                container.style.display = "flex";
                container.style.flexDirection = "column";
                container.style.backgroundColor = "#1a1a1a";
                container.style.overflow = "hidden";

                // Create iframe for rendering
                const iframe = document.createElement("iframe");
                iframe.style.width = "100%";
                iframe.style.flex = "1 1 0";
                iframe.style.minHeight = "0";
                iframe.style.border = "none";
                iframe.style.backgroundColor = "#1a1a1a";
                iframe.src = `/extensions/${EXTENSION_FOLDER}/viewer_render_gaussian.html?v=` + Date.now();
                iframe.style.display = "none";

                // Create info panel with render preview and resolution
                const infoPanel = document.createElement("div");
                infoPanel.style.backgroundColor = "#1a1a1a";
                infoPanel.style.borderTop = "1px solid #444";
                infoPanel.style.padding = "6px 10px";
                infoPanel.style.fontSize = "10px";
                infoPanel.style.fontFamily = "monospace";
                infoPanel.style.color = "#ccc";
                infoPanel.style.lineHeight = "1.3";
                infoPanel.style.flex = "1 1 0";
                infoPanel.style.overflow = "hidden";
                infoPanel.style.display = "flex";
                infoPanel.style.flexDirection = "column";

                const previewWrapper = document.createElement("div");
                previewWrapper.style.position = "relative";
                previewWrapper.style.width = "100%";
                previewWrapper.style.flex = "1 1 0";
                previewWrapper.style.backgroundColor = "#111";
                previewWrapper.style.border = "1px solid #333";
                previewWrapper.style.borderRadius = "4px";
                previewWrapper.style.overflow = "hidden";

                const previewImage = document.createElement("img");
                previewImage.style.width = "100%";
                previewImage.style.height = "100%";
                previewImage.style.objectFit = "contain";
                previewImage.style.display = "block";
                previewImage.alt = "Render preview";

                const previewPlaceholder = document.createElement("div");
                previewPlaceholder.style.position = "absolute";
                previewPlaceholder.style.inset = "0";
                previewPlaceholder.style.display = "flex";
                previewPlaceholder.style.alignItems = "center";
                previewPlaceholder.style.justifyContent = "center";
                previewPlaceholder.style.color = "#666";
                previewPlaceholder.textContent = "请点击SetCamera确定相机视角";

                const statusRow = document.createElement("div");
                statusRow.style.display = "flex";
                statusRow.style.justifyContent = "space-between";
                statusRow.style.alignItems = "center";
                statusRow.style.marginTop = "6px";

                const statusLabel = document.createElement("span");
                statusLabel.style.color = "#888";
                statusLabel.textContent = "";

                const resolutionLabel = document.createElement("span");
                resolutionLabel.style.color = "#aaa";
                resolutionLabel.textContent = "Resolution: -";

                statusRow.appendChild(statusLabel);
                statusRow.appendChild(resolutionLabel);

                previewWrapper.appendChild(previewImage);
                previewWrapper.appendChild(previewPlaceholder);
                infoPanel.appendChild(previewWrapper);
                infoPanel.appendChild(statusRow);

                const setStatus = (text, color) => {
                    statusLabel.textContent = text;
                    statusLabel.style.color = color || "#888";
                };

                const setPreviewImage = (dataUrl) => {
                    if (dataUrl) {
                        previewPlaceholder.style.display = "none";
                        previewImage.src = dataUrl;
                    } else {
                        previewImage.removeAttribute("src");
                        previewPlaceholder.style.display = "flex";
                        resolutionLabel.textContent = "Resolution: -";
                    }
                };

                previewImage.addEventListener("load", () => {
                    if (previewImage.naturalWidth && previewImage.naturalHeight) {
                        resolutionLabel.textContent = `Resolution: ${previewImage.naturalWidth} x ${previewImage.naturalHeight}`;
                    }
                });

                // Add iframe (hidden) and info panel to container
                container.appendChild(iframe);
                container.appendChild(infoPanel);

                // Add widget
                const widget = this.addDOMWidget("render_gaussian", "RENDER_GAUSSIAN", container, {
                    getValue() { return ""; },
                    setValue(v) { }
                });

                // Store reference to node for dynamic resizing
                const node = this;

                // computeSize should return the current node size to allow the widget to fill the node
                widget.computeSize = function(width) {
                    return [width, node.size[1] - 30]; // Subtract title bar height approx
                };

                // Store references
                this.renderGaussianIframe = iframe;
                this.renderInfoPanel = infoPanel;

                // Store pending render requests
                this.pendingRenderRequests = new Map();
                const nodeId = this.id;

                // Track iframe load state
                let iframeLoaded = false;
                iframe.addEventListener('load', () => {
                    iframeLoaded = true;
                    console.log("[GeomPack Render Gaussian] Iframe loaded");
                });

                // Listen for messages from iframe or Preview node
                window.addEventListener('message', async (event) => {
                    const isRenderResult = event.data?.type === 'RENDER_RESULT' && event.data.request_id;
                    const isRenderError = event.data?.type === 'RENDER_ERROR' && event.data.request_id;
                    const fromPreview = event.data?.source === 'preview_gaussian_v2';
                    const fromRenderIframe = event.source === iframe.contentWindow;

                    if (!fromRenderIframe && !fromPreview) {
                        return;
                    }

                    // Handle render result from iframe
                    if (isRenderResult) {
                        const { request_id, image } = event.data;
                        console.log(`[GeomPack Render Gaussian] Received render result for ${request_id}`);

                        // Store result for Python to retrieve
                        if (this.pendingRenderRequests.has(request_id)) {
                            const request = this.pendingRenderRequests.get(request_id);
                            
                            // Store image data in node instance
                            // Python will retrieve this via render_results dict
                            const node = this;
                            if (!node.renderResults) {
                                node.renderResults = {};
                            }
                            node.renderResults[request_id] = image;

                            // Resolve the promise
                            if (request.resolve) {
                                request.resolve(image);
                            }

                            this.pendingRenderRequests.delete(request_id);

                            // Update info panel
                            setStatus("Render complete", "#6cc");
                            setTimeout(() => {
                                setStatus("");
                            }, 2000);

                            setPreviewImage(image);
                        } else {
                            console.warn("[GeomPack Render Gaussian] Render result received with no pending request:", request_id);
                        }

                        // Forward result to backend for IMAGE output
                        try {
                            const response = await fetch("/geompack/render_result", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ request_id, image })
                            });
                            if (!response.ok) {
                                console.error("[GeomPack Render Gaussian] Failed to send render result:", response.status);
                            } else {
                                console.log("[GeomPack Render Gaussian] Render result forwarded to backend");
                            }
                        } catch (error) {
                            console.error("[GeomPack Render Gaussian] Error sending render result:", error);
                        }
                    }
                    // Handle error messages
                    else if (isRenderError) {
                        const { request_id, error } = event.data;
                        console.error(`[GeomPack Render Gaussian] Render error for ${request_id}:`, error);

                        if (this.pendingRenderRequests.has(request_id)) {
                            const request = this.pendingRenderRequests.get(request_id);
                            if (request.reject) {
                                request.reject(new Error(error));
                            }
                            this.pendingRenderRequests.delete(request_id);
                        }

                        setStatus(`Error: ${error}`, "#ff6b6b");
                    }
                });

                // Keep track of processed request IDs to avoid duplicates
                const processedRequestIds = new Set();
                
                // Listen for backend render request events
                const handleRenderRequest = async (event) => {
                    const startTime = Date.now();
                    console.log("[GeomPack Render Gaussian] ============================================");
                    console.log("[GeomPack Render Gaussian] ===== RENDER REQUEST RECEIVED =====");
                    console.log("[GeomPack Render Gaussian] ============================================");
                    
                    const message = event?.detail || event;
                    console.log("[GeomPack Render Gaussian] Raw message:", message);
                    
                    if (!message?.request_id) {
                        console.log("[GeomPack Render Gaussian] ERROR: Received message without request_id");
                        console.log("[GeomPack Render Gaussian] Message keys:", message ? Object.keys(message) : "null");
                        return;
                    }
                    
                    const requestId = message.request_id;
                    console.log("[GeomPack Render Gaussian] Request ID:", requestId);
                    
                    // Skip if already processed by another node
                    if (processedRequestIds.has(requestId)) {
                        console.log(`[GeomPack Render Gaussian] WARNING: Request ${requestId} already processed, skipping`);
                        console.log("[GeomPack Render Gaussian] Processed IDs:", Array.from(processedRequestIds));
                        return;
                    }
                    
                    // Check node_id matching (more lenient - allow null/undefined)
                    console.log("[GeomPack Render Gaussian] Node ID check:");
                    console.log(`  Message node_id: ${message.node_id} (type: ${typeof message.node_id})`);
                    console.log(`  Current node ID: ${nodeId} (type: ${typeof nodeId})`);
                    
                    if (message.node_id != null && message.node_id !== undefined && message.node_id !== nodeId) {
                        console.log(`[GeomPack Render Gaussian] INFO: Request node_id ${message.node_id} does not match current node ${nodeId}`);
                        console.log("[GeomPack Render Gaussian] Processing anyway as fallback (lenient mode)");
                    } else {
                        console.log(`[GeomPack Render Gaussian] INFO: Request node_id matches current node ${nodeId}`);
                    }

                    const plyFile = message.ply_file;
                    const filename = message.filename || plyFile;
                    const resolution = message.output_resolution || 2048;
                    const aspectRatio = message.output_aspect_ratio || "source";
                    const extrinsics = message.extrinsics || null;
                    const intrinsics = message.intrinsics || null;
                    const cameraState = message.camera_state || null;

                    console.log("[GeomPack Render Gaussian] ===== RENDER PARAMETERS ANALYSIS =====");
                    console.log("[GeomPack Render Gaussian] Basic parameters:");
                    console.log(`  PLY file: ${plyFile}`);
                    console.log(`  Filename: ${filename}`);
                    console.log(`  Resolution: ${resolution}`);
                    console.log(`  Aspect ratio: ${aspectRatio}`);
                    console.log(`  Has extrinsics: ${extrinsics !== null}`);
                    console.log(`  Has intrinsics: ${intrinsics !== null}`);
                    console.log(`  Has camera_state: ${cameraState !== null}`);
                    
                    if (extrinsics) {
                        console.log("[GeomPack Render Gaussian] Extrinsics matrix:");
                        console.log(JSON.stringify(extrinsics, null, 2));
                        // Calculate camera position from extrinsics
                        if (extrinsics.length === 4) {
                            const R = [
                                [extrinsics[0][0], extrinsics[0][1], extrinsics[0][2]],
                                [extrinsics[1][0], extrinsics[1][1], extrinsics[1][2]],
                                [extrinsics[2][0], extrinsics[2][1], extrinsics[2][2]]
                            ];
                            const t = [extrinsics[0][3], extrinsics[1][3], extrinsics[2][3]];
                            const camPosX = -(R[0][0] * t[0] + R[1][0] * t[1] + R[2][0] * t[2]);
                            const camPosY = -(R[0][1] * t[0] + R[1][1] * t[1] + R[2][1] * t[2]);
                            const camPosZ = -(R[0][2] * t[0] + R[1][2] * t[1] + R[2][2] * t[2]);
                            console.log(`  Calculated camera position: x=${camPosX.toFixed(4)}, y=${camPosY.toFixed(4)}, z=${camPosZ.toFixed(4)}`);
                        }
                    }
                    
                    if (intrinsics) {
                        console.log("[GeomPack Render Gaussian] Intrinsics matrix:");
                        console.log(JSON.stringify(intrinsics, null, 2));
                        if (intrinsics.length >= 2) {
                            const fx = intrinsics[0][0];
                            const fy = intrinsics[1][1];
                            const cx = intrinsics[0][2];
                            const cy = intrinsics[1][2];
                            const imageWidth = cx * 2;
                            const imageHeight = cy * 2;
                            const fovY = 2 * Math.atan(imageHeight / (2 * fy));
                            const fovYDeg = fovY * 180 / Math.PI;
                            console.log(`  Focal length: fx=${fx}, fy=${fy}`);
                            console.log(`  Principal point: cx=${cx}, cy=${cy}`);
                            console.log(`  Image dimensions: ${imageWidth}x${imageHeight}`);
                            console.log(`  Calculated FOV Y: ${fovYDeg.toFixed(2)} degrees`);
                            console.log(`  Aspect ratio: ${(imageWidth / imageHeight).toFixed(4)}`);
                        }
                    }
                    
                    if (cameraState) {
                        console.log("[GeomPack Render Gaussian] Camera state details:");
                        console.log(`  Position:`, cameraState.position);
                        console.log(`  Target:`, cameraState.target);
                        console.log(`  Image size: ${cameraState.image_width}x${cameraState.image_height}`);
                        console.log(`  Focal length: fx=${cameraState.fx}, fy=${cameraState.fy}`);
                        console.log(`  Scale:`, cameraState.scale);
                        console.log(`  Scale compensation:`, cameraState.scale_compensation);
                        
                        // Calculate FOV from camera state
                        if (cameraState.fy && cameraState.image_height) {
                            const fovY = 2 * Math.atan(cameraState.image_height / (2 * cameraState.fy));
                            const fovYDeg = fovY * 180 / Math.PI;
                            console.log(`  FOV Y from camera_state: ${fovYDeg.toFixed(2)} degrees`);
                        }
                    }
                    
                    // Priority analysis
                    console.log("[GeomPack Render Gaussian] Parameter priority analysis:");
                    if (cameraState) {
                        console.log("  Using camera_state (highest priority)");
                    } else if (extrinsics && intrinsics) {
                        console.log("  Using extrinsics + intrinsics");
                    } else if (intrinsics) {
                        console.log("  Using intrinsics only");
                    } else {
                        console.log("  No camera parameters, using defaults");
                    }
                    console.log("[GeomPack Render Gaussian] =====================================");

                    console.log(`[GeomPack Render Gaussian] Processing render request ${requestId}, node_id: ${nodeId}`);
                    setStatus("Loading PLY...", "#ffcc00");
                    this.pendingRenderRequests.set(requestId, {});
                    processedRequestIds.add(requestId);
                    console.log("[GeomPack Render Gaussian] Pending requests:", this.pendingRenderRequests.size);

                    try {
                        const previewRegistry = window.GEOMPACK_PREVIEW_IFRAMES || {};
                        const previewIframe = previewRegistry[plyFile] || previewRegistry[filename];

                        if (previewIframe && previewIframe.contentWindow) {
                            setStatus("Rendering via Preview...", "#ffcc00");
                            this.pendingRenderRequests.set(requestId, {});
                            processedRequestIds.add(requestId);

                            previewIframe.contentWindow.postMessage({
                                type: "OUTPUT_SETTINGS",
                                output_resolution: resolution,
                                output_aspect_ratio: aspectRatio
                            }, "*");

                            previewIframe.contentWindow.postMessage({
                                type: "RENDER_REQUEST",
                                request_id: requestId,
                                output_resolution: resolution,
                                output_aspect_ratio: aspectRatio
                            }, "*");

                            console.log("[GeomPack Render Gaussian] Sent render request to Preview iframe");
                            console.log(`[GeomPack Render Gaussian] Total handleRenderRequest time: ${Date.now() - startTime}ms`);
                            return;
                        }

                        // Fetch PLY file from ComfyUI /view endpoint (authenticated)
                        const filepath = `/view?filename=${encodeURIComponent(filename)}&type=output&subfolder=`;
                        console.log("[GeomPack Render Gaussian] Fetching PLY file...");
                        console.log(`[GeomPack Render Gaussian] URL: ${filepath}`);
                        
                        const fetchStart = Date.now();
                        const response = await fetch(filepath);
                        const fetchEnd = Date.now();
                        console.log(`[GeomPack Render Gaussian] Fetch took ${fetchEnd - fetchStart}ms`);
                        console.log(`[GeomPack Render Gaussian] Response status: ${response.status} ${response.statusText}`);

                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }

                        const arrayBuffer = await response.arrayBuffer();
                        const arrayBufferEnd = Date.now();
                        console.log(`[GeomPack Render Gaussian] ArrayBuffer took ${arrayBufferEnd - fetchEnd}ms`);
                        console.log("[GeomPack Render Gaussian] PLY file size:", arrayBuffer.byteLength, "bytes", 
                                    `(${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

                        setStatus("Rendering...", "#ffcc00");

                        // Send render request to iframe with PLY data
                        if (iframe.contentWindow) {
                            console.log("[GeomPack Render Gaussian] Sending RENDER_REQUEST to iframe...");
                            console.log("[GeomPack Render Gaussian] Payload:", {
                                type: "RENDER_REQUEST",
                                request_id: requestId,
                                filename: filename,
                                output_resolution: resolution,
                                output_aspect_ratio: aspectRatio,
                                has_extrinsics: extrinsics !== null,
                                has_intrinsics: intrinsics !== null,
                                has_camera_state: cameraState !== null
                            });
                            
                            iframe.contentWindow.postMessage({
                                type: "RENDER_REQUEST",
                                request_id: requestId,
                                ply_data: arrayBuffer,
                                filename: filename,
                                output_resolution: resolution,
                                output_aspect_ratio: aspectRatio,
                                extrinsics: extrinsics,
                                intrinsics: intrinsics,
                                camera_state: cameraState
                            }, "*", [arrayBuffer]);
                            
                            console.log("[GeomPack Render Gaussian] RENDER_REQUEST sent to iframe");
                        } else {
                            console.error("[GeomPack Render Gaussian] ERROR: iframe.contentWindow not available");
                            throw new Error("iframe not available");
                        }
                        
                        console.log(`[GeomPack Render Gaussian] Total handleRenderRequest time: ${Date.now() - startTime}ms`);
                    } catch (error) {
                        console.error("[GeomPack Render Gaussian] ERROR: Failed to process render request");
                        console.error("[GeomPack Render Gaussian] Error:", error);
                        console.error("[GeomPack Render Gaussian] Error stack:", error.stack);
                        console.log(`[GeomPack Render Gaussian] Total handleRenderRequest time (failed): ${Date.now() - startTime}ms`);
                        
                        setStatus(`Error: ${error.message}`, "#ff6b6b");
                        this.pendingRenderRequests.delete(requestId);
                        processedRequestIds.delete(requestId);

                        // Send error to iframe
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
