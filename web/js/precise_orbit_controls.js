(function() {
    const SPLAT = window.GSPLAT;

    /**
     * PreciseOrbitControls
     * Custom orbit controls for GSPLAT.js with precision mode and roll support.
     */
    class PreciseOrbitControls {
        constructor(camera, canvas, alpha = 0.5, beta = 0.5, radius = 5, inputEnabled = true, target = new SPLAT.Vector3()) {
            this.camera = camera;
            this.canvas = canvas;

            this.target = target.clone();
            this.currentAlpha = alpha;
            this.currentBeta = beta;
            this.currentRadius = radius;
            this.currentRoll = 0;

            this.targetAlpha = alpha;
            this.targetBeta = beta;
            this.targetRadius = radius;
            this.targetRoll = 0;
            this.targetTarget = target.clone();

            this.minAngle = -90;
            this.maxAngle = 90;
            this.minZoom = 0.001;
            this.maxZoom = 100;

            this.orbitSpeed = 1.0;
            this.panSpeed = 1.0;
            this.zoomSpeed = 1.0;
            this.keySpeed = 1.0;
            this.dampening = 0.15;

            this.keys = {};
            this.isMouseDown = false;
            this.isRightMouseDown = false;
            this.lastMouseX = 0;
            this.lastMouseY = 0;

            const onKeyDown = (e) => {
                this.keys[e.code] = true;
                // Special aliasing like gsplat
                if (e.code === "ArrowUp") this.keys.KeyW = true;
                if (e.code === "ArrowDown") this.keys.KeyS = true;
                if (e.code === "ArrowLeft") this.keys.KeyA = true;
                if (e.code === "ArrowRight") this.keys.KeyD = true;
            };
            const onKeyUp = (e) => {
                this.keys[e.code] = false;
                // Handle Arrow keys aliasing for WASD like original gsplat OrbitControls
                if (e.code === "ArrowUp") this.keys.KeyW = false;
                if (e.code === "ArrowDown") this.keys.KeyS = false;
                if (e.code === "ArrowLeft") this.keys.KeyA = false;
                if (e.code === "ArrowRight") this.keys.KeyD = false;
            };
            const onMouseDown = (e) => {
                this.isMouseDown = true;
                this.isRightMouseDown = e.button === 2;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                window.addEventListener('mouseup', onMouseUp);
            };
            const onMouseUp = () => {
                this.isMouseDown = false;
                this.isRightMouseDown = false;
                window.removeEventListener('mouseup', onMouseUp);
            };
            const onMouseMove = (e) => {
                if (!this.isMouseDown) return;
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;

                const shift = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
                const speedMult = shift ? 0.1 : 1.0;

                if (this.isRightMouseDown) {
                    // Panning
                    const zoomFactor = 0.1 + 0.9 * (this.currentRadius - this.minZoom) / (this.maxZoom - this.minZoom);
                    const panX = -dx * this.panSpeed * 0.01 * zoomFactor * speedMult;
                    const panY = -dy * this.panSpeed * 0.01 * zoomFactor * speedMult;

                    const rotationMatrix = SPLAT.Matrix3.RotationFromQuaternion(this.camera.rotation).buffer;
                    const right = new SPLAT.Vector3(rotationMatrix[0], rotationMatrix[3], rotationMatrix[6]);
                    const up = new SPLAT.Vector3(rotationMatrix[1], rotationMatrix[4], rotationMatrix[7]);

                    this.targetTarget = this.targetTarget.add(right.multiply(panX)).add(up.multiply(panY));
                } else {
                    // Orbiting
                    this.targetAlpha -= dx * this.orbitSpeed * 0.003 * speedMult;
                    this.targetBeta += dy * this.orbitSpeed * 0.003 * speedMult;
                    this.targetBeta = Math.min(Math.max(this.targetBeta, this.minAngle * Math.PI / 180), this.maxAngle * Math.PI / 180);
                }
            };
            const onWheel = (e) => {
                const shift = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
                const speedMult = shift ? 0.1 : 1.0;
                this.targetRadius += e.deltaY * 0.001 * this.targetRadius * this.zoomSpeed * speedMult;
                this.targetRadius = Math.min(Math.max(this.targetRadius, this.minZoom), this.maxZoom);
            };

            if (inputEnabled) {
                window.addEventListener('keydown', onKeyDown);
                window.addEventListener('keyup', onKeyUp);
                canvas.addEventListener('mousedown', onMouseDown);
                canvas.addEventListener('mousemove', onMouseMove);
                canvas.addEventListener('wheel', onWheel, { passive: true });
                canvas.addEventListener('contextmenu', (e) => e.preventDefault());
            }

            this.update = () => {
                // Keyboard controls
                const shift = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
                const speedMult = shift ? 0.1 : 1.0;
                const moveSpeed = 0.025 * this.keySpeed * speedMult;
                const rotSpeed = 0.01 * this.keySpeed * speedMult;

                const rotationMatrix = SPLAT.Matrix3.RotationFromQuaternion(this.camera.rotation).buffer;
                const right = new SPLAT.Vector3(rotationMatrix[0], rotationMatrix[3], rotationMatrix[6]);
                const forward = new SPLAT.Vector3(rotationMatrix[2], rotationMatrix[5], rotationMatrix[8]);

                if (this.keys['KeyW']) this.targetTarget = this.targetTarget.subtract(forward.multiply(moveSpeed));
                if (this.keys['KeyS']) this.targetTarget = this.targetTarget.add(forward.multiply(moveSpeed));
                if (this.keys['KeyA']) this.targetTarget = this.targetTarget.subtract(right.multiply(moveSpeed));
                if (this.keys['KeyD']) this.targetTarget = this.targetTarget.add(right.multiply(moveSpeed));

                if (this.keys['KeyQ']) this.targetAlpha -= rotSpeed;
                if (this.keys['KeyE']) this.targetAlpha += rotSpeed;
                if (this.keys['KeyR']) this.targetBeta += rotSpeed;
                if (this.keys['KeyF']) this.targetBeta -= rotSpeed;
                if (this.keys['KeyZ']) this.targetRoll += rotSpeed;
                if (this.keys['KeyX']) this.targetRoll -= rotSpeed;

                // Smoothing
                const lerp = (a, b, t) => (1 - t) * a + t * b;
                this.currentAlpha = lerp(this.currentAlpha, this.targetAlpha, this.dampening);
                this.currentBeta = lerp(this.currentBeta, this.targetBeta, this.dampening);
                this.currentRadius = lerp(this.currentRadius, this.targetRadius, this.dampening);
                this.currentRoll = lerp(this.currentRoll, this.targetRoll, this.dampening);

                // Manually implement Vector3 lerp to avoid potential compatibility issues
                this.target = new SPLAT.Vector3(
                    lerp(this.target.x, this.targetTarget.x, this.dampening),
                    lerp(this.target.y, this.targetTarget.y, this.dampening),
                    lerp(this.target.z, this.targetTarget.z, this.dampening)
                );

                // Update camera
                const x = this.target.x + this.currentRadius * Math.sin(this.currentAlpha) * Math.cos(this.currentBeta);
                const y = this.target.y - this.currentRadius * Math.sin(this.currentBeta);
                const z = this.target.z - this.currentRadius * Math.cos(this.currentAlpha) * Math.cos(this.currentBeta);

                this.camera.position = new SPLAT.Vector3(x, y, z);

                const lookDir = this.target.subtract(this.camera.position).normalize();
                const pitch = Math.asin(-lookDir.y);
                const yaw = Math.atan2(lookDir.x, lookDir.z);

                this.camera.rotation = SPLAT.Quaternion.FromEuler(new SPLAT.Vector3(pitch, yaw, this.currentRoll));
            };

            this.setCameraTarget = (t) => {
                const dx = t.x - this.camera.position.x;
                const dy = t.y - this.camera.position.y;
                const dz = t.z - this.camera.position.z;
                this.targetRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);
                this.targetBeta = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
                this.targetAlpha = -Math.atan2(dx, dz);
                this.targetTarget = t.clone();
                this.currentAlpha = this.targetAlpha;
                this.currentBeta = this.targetBeta;
                this.currentRadius = this.targetRadius;
                this.target = this.targetTarget.clone();
            };

            this.getCameraTarget = () => this.targetTarget;

            this.dispose = () => {
                window.removeEventListener('keydown', onKeyDown);
                window.removeEventListener('keyup', onKeyUp);
                canvas.removeEventListener('mousedown', onMouseDown);
                canvas.removeEventListener('mousemove', onMouseMove);
                canvas.removeEventListener('wheel', onWheel);
            };
        }
    }

    window.PreciseOrbitControls = PreciseOrbitControls;
})();
