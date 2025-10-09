document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const sourceVideo = document.getElementById('source-video');
    const quadrantsContainer = document.getElementById('quadrants-container');
    const saveButton = document.getElementById('save-labels-btn');
    const outputContainer = document.getElementById('output-container');
    const jsonOutput = document.getElementById('json-output');
    const cropperContainer = document.getElementById('cropper-container');
    const chromaKeyControls = document.getElementById('chroma-key-controls');
    const chromaKeyToggle = document.getElementById('chroma-key-toggle');
    
    // Chroma Key elements
    const colorControl1 = document.getElementById('color-control-1');
    const chromaKeyColorInput1 = document.getElementById('chroma-key-color-1');
    const colorControl2 = document.getElementById('color-control-2');
    const chromaKeyColorInput2 = document.getElementById('chroma-key-color-2');
    const addColorBtn = document.getElementById('add-color-btn');
    const removeColor2Btn = document.getElementById('remove-color-2-btn');
    const eyedropperBtns = document.querySelectorAll('.eyedropper-btn');
    const mainThresholdInput = document.getElementById('chroma-key-threshold-main');
    const mainThresholdValue = document.getElementById('threshold-value-main');
    const selectRegionBtn = document.getElementById('select-region-btn');
    const regionColorInfo = document.getElementById('region-color-info');
    const regionColorCount = document.getElementById('region-color-count');
    const clearRegionColorsBtn = document.getElementById('clear-region-colors-btn');
    
    // Advanced feature toggles
    const advancedChromaToggle = document.getElementById('advanced-chroma-toggle');
    const outlineDetectionToggle = document.getElementById('outline-detection-toggle');

    // Remove individual threshold controls as we now have one main one
    document.getElementById('chroma-key-threshold')?.parentElement.remove();


    // Main cropper lines
    const verticalLine = document.getElementById('vertical-line');
    const horizontalLine = document.getElementById('horizontal-line');

    let animationFrameId = null;

    let mainSplit = { x: 0.5, y: 0.5 };

    let quadrantsData = [
        { id: 0, name: 'Top-Left', label: '', subCrop: { x: 0, y: 0, w: 1, h: 1 } },
        { id: 1, name: 'Top-Right', label: '', subCrop: { x: 0, y: 0, w: 1, h: 1 } },
        { id: 2, name: 'Bottom-Left', label: '', subCrop: { x: 0, y: 0, w: 1, h: 1 } },
        { id: 3, name: 'Bottom-Right', label: '', subCrop: { x: 0, y: 0, w: 1, h: 1 } }
    ];

    let canvasElements = [];
    let offscreenCanvases = {};
    let cropBoxElements = [];

    let chromaKeyEnabled = false;
    let advancedModeEnabled = false;
    let useOutlineDetection = true;
    let autoDetectedColors = [{}, {}, {}, {}]; // Per-quadrant auto color

    let backgroundModel = null; // New: To store stats about the selected background color

    let chromaKeyColors = [
        { r: 0, g: 255, b: 0, enabled: true },
        { r: 0, g: 0, b: 255, enabled: false }
    ];
    let chromaKeyThreshold = 40;
    
    const blackLineThreshold = 50; // R, G, B values must all be below this to be a "black line"

    function resetChromaKeyColors() {
        chromaKeyColors = [
            { r: 0, g: 255, b: 0, enabled: true },
            { r: 0, g: 0, b: 255, enabled: false }
        ];
        backgroundModel = null; // Reset the advanced model
        chromaKeyColorInput1.value = '#00ff00';
        chromaKeyColorInput2.value = '#0000ff';
        regionColorInfo.style.display = 'none';
        colorControl1.style.display = '';
        const color2Visible = chromaKeyColors[1].enabled && !advancedModeEnabled;
        colorControl2.style.display = color2Visible ? 'flex' : 'none';
        addColorBtn.style.display = (chromaKeyColors[1].enabled || advancedModeEnabled) ? 'none' : 'inline-block';
    }

    clearRegionColorsBtn.addEventListener('click', resetChromaKeyColors);

    // --- Initial UI Setup ---
    advancedChromaToggle.addEventListener('change', (e) => {
        advancedModeEnabled = e.target.checked;
        // Hide manual color pickers in advanced mode to reduce confusion
        const manualControlsVisible = !advancedModeEnabled || !backgroundModel;
        colorControl1.style.display = manualControlsVisible ? 'flex' : 'none';
        const color2Visible = chromaKeyColors[1].enabled && manualControlsVisible;
        colorControl2.style.display = color2Visible ? 'flex' : 'none';
        addColorBtn.style.display = (chromaKeyColors[1].enabled || !manualControlsVisible) ? 'none' : 'inline-block';
        regionColorInfo.style.display = backgroundModel ? 'flex' : 'none';
    });
    outlineDetectionToggle.addEventListener('change', (e) => {
        useOutlineDetection = e.target.checked;
    });

    mainThresholdInput.addEventListener('input', (e) => {
        chromaKeyThreshold = parseInt(e.target.value, 10);
        mainThresholdValue.textContent = chromaKeyThreshold;
    });

    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (sourceVideo.src) URL.revokeObjectURL(sourceVideo.src);
        sourceVideo.src = URL.createObjectURL(file);
        
        sourceVideo.addEventListener('loadedmetadata', () => {
            cropperContainer.style.display = 'block';
            chromaKeyControls.style.display = 'block';
            mainSplit = { x: 0.5, y: 0.5 }; // Reset split on new video
            updateMainLines();
            renderQuadrants();
            saveButton.style.display = 'inline-block';
            outputContainer.style.display = 'none';
            sourceVideo.play().catch(e => console.error("Autoplay failed:", e));
        }, { once: true });
    });

    function getMainCropForQuadrant(index) {
        const { x, y } = mainSplit;
        switch (index) {
            case 0: return { x: 0, y: 0, w: x, h: y }; // Top-Left
            case 1: return { x: x, y: 0, w: 1 - x, h: y }; // Top-Right
            case 2: return { x: 0, y: y, w: x, h: 1 - y }; // Bottom-Left
            case 3: return { x: x, y: y, w: 1 - x, h: 1 - y }; // Bottom-Right
        }
    }

    function renderQuadrants() {
        quadrantsContainer.innerHTML = '';
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        canvasElements = [];
        offscreenCanvases = {};
        cropBoxElements = [];

        quadrantsData.forEach((quadrant, index) => {
            const quadrantElement = document.createElement('div');
            quadrantElement.className = 'quadrant';
            quadrantElement.innerHTML = `
                <div class="quadrant-header">${quadrant.name}</div>
                <div class="quadrant-cropper-wrapper">
                    <canvas class="video-preview-canvas"></canvas>
                </div>
                <input type="text" class="label-input" placeholder="Enter animation label (e.g., 'jump')">
            `;
            
            const cropperWrapper = quadrantElement.querySelector('.quadrant-cropper-wrapper');
            const canvas = quadrantElement.querySelector('canvas');
            const labelInput = quadrantElement.querySelector('input');
            
            const mainCrop = getMainCropForQuadrant(index);
            const videoWidth = sourceVideo.videoWidth;
            const videoHeight = sourceVideo.videoHeight;
            const sWidth = mainCrop.w * videoWidth;
            const sHeight = mainCrop.h * videoHeight;

            canvas.width = sWidth > 0 ? sWidth : 1; // prevent 0 width/height
            canvas.height = sHeight > 0 ? sHeight : 1;
            canvas.style.aspectRatio = `${sWidth} / ${sHeight}`;

            canvasElements.push(canvas);

            // Create an offscreen canvas for this quadrant for pixel manipulation
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;
            offscreenCanvases[index] = offscreenCanvas;

            const box = document.createElement('div');
            box.className = 'crop-box';
            box.dataset.index = index;
            box.innerHTML = `
                <div class="crop-handle top-left"></div>
                <div class="crop-handle top-right"></div>
                <div class="crop-handle bottom-left"></div>
                <div class="crop-handle bottom-right"></div>
            `;
            cropperWrapper.appendChild(box);
            cropBoxElements.push(box);
            updateSubCropBoxFromData(index);
            makeSubCropInteractive(box, index);

            labelInput.addEventListener('input', (event) => {
                quadrantsData[index].label = event.target.value;
            });

            quadrantsContainer.appendChild(quadrantElement);
        });
        
        drawQuadrants();
    }

    function updateSubCropBoxFromData(index) {
        if (!cropBoxElements[index]) return;
        const box = cropBoxElements[index];
        const crop = quadrantsData[index].subCrop;
        box.style.left = `${crop.x * 100}%`;
        box.style.top = `${crop.y * 100}%`;
        box.style.width = `${crop.w * 100}%`;
        box.style.height = `${crop.h * 100}%`;
    }

    // --- Advanced Background Removal Pipeline ---

    function sobelEdgeDetection(imageData) {
        const { data, width, height } = imageData;
        const grayscale = new Uint8ClampedArray(width * height);
        for (let i = 0; i < data.length; i += 4) {
            grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        }

        const sobelData = new Uint8ClampedArray(width * height);
        const Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        const Gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const pixelVal = grayscale[(y + ky) * width + (x + kx)];
                        gx += pixelVal * Gx[ky + 1][kx + 1];
                        gy += pixelVal * Gy[ky + 1][kx + 1];
                    }
                }
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                sobelData[y * width + x] = magnitude > 255 ? 255 : magnitude;
            }
        }
        return sobelData;
    }
    
    function createCharacterMask(edgeData, width, height) {
        // 1. Threshold the edge data to find the black outline
        const outlineMask = new Uint8Array(width * height);
        for(let i = 0; i < edgeData.length; i++) {
            if (edgeData[i] < blackLineThreshold) { // This assumes sobel was run on a non-inverted grayscale
                 outlineMask[i] = 1; // 1 represents a potential outline pixel
            }
        }

        // 2. Flood-fill from the borders to find everything "outside" the character
        const outsideMask = new Uint8Array(width * height);
        const queue = [];
        // Add border pixels to queue
        for(let x = 0; x < width; x++) {
            if(outlineMask[x] === 0) { queue.push([x,0]); outsideMask[x] = 1; }
            if(outlineMask[(height-1)*width+x] === 0) { queue.push([x,height-1]); outsideMask[(height-1)*width+x] = 1; }
        }
        for(let y = 0; y < height; y++) {
            if(outlineMask[y*width] === 0) { queue.push([0,y]); outsideMask[y*width] = 1; }
            if(outlineMask[y*width+width-1] === 0) { queue.push([width-1,y]); outsideMask[y*width+width-1] = 1; }
        }
        
        let head = 0;
        while(head < queue.length) {
            const [x, y] = queue[head++];
            const neighbors = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = ny * width + nx;
                    if (outsideMask[nIdx] === 0 && outlineMask[nIdx] === 0) {
                        outsideMask[nIdx] = 1;
                        queue.push([nx, ny]);
                    }
                }
            }
        }
        
        // The character mask is the inverse of the outside mask
        const characterMask = new Uint8Array(width * height);
        for(let i=0; i<outsideMask.length; i++) {
            characterMask[i] = 1 - outsideMask[i];
        }
        
        return characterMask;
    }


    function advancedChromaKeyRemove(imageData, characterMask) {
        if (!backgroundModel) return;

        const { data, width, height } = imageData;
        const { mean, stdDev } = backgroundModel;
        
        const thresholdMultiplier = chromaKeyThreshold / 25; // Map slider value to a multiplier

        const lowerBound = {
            r: mean.r - stdDev.r * thresholdMultiplier,
            g: mean.g - stdDev.g * thresholdMultiplier,
            b: mean.b - stdDev.b * thresholdMultiplier
        };
        const upperBound = {
            r: mean.r + stdDev.r * thresholdMultiplier,
            g: mean.g + stdDev.g * thresholdMultiplier,
            b: mean.b + stdDev.b * thresholdMultiplier
        };

        for (let i = 0; i < data.length; i += 4) {
            const idx = i / 4;
            // Remove if outside the character AND it matches the background color profile
            if (characterMask[idx] === 0) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                if (r >= lowerBound.r && r <= upperBound.r &&
                    g >= lowerBound.g && g <= upperBound.g &&
                    b >= lowerBound.b && b <= upperBound.b) {
                    data[i + 3] = 0;
                }
            }
        }
    }


    // --- Flood Fill Background Removal ---
    function floodFillRemoveBackground(imageData, backgroundColor) {
        const { data, width, height } = imageData;
        if (width === 0 || height === 0 || !backgroundColor) return;

        const visited = new Uint8Array(width * height);
        const isOutline = new Uint8Array(width * height);
        const { r: bgR, g: bgG, b: bgB } = backgroundColor;

        // 1. Identify outline pixels
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                if (data[i] < blackLineThreshold && data[i + 1] < blackLineThreshold && data[i + 2] < blackLineThreshold) {
                    isOutline[y * width + x] = 1;
                }
            }
        }
        
        // 2. Flood fill from corners if they match the background color
        const queue = [];
        const startPoints = [
            [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
            [Math.floor(width/2), 0], [Math.floor(width/2), height-1],
            [0, Math.floor(height/2)], [width-1, Math.floor(height/2)]
        ];

        startPoints.forEach(([x, y]) => {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const distance = Math.sqrt((r - bgR)**2 + (g - bgG)**2 + (b - bgB)**2);

            const idx = y * width + x;
            if (!visited[idx] && !isOutline[idx] && distance < chromaKeyThreshold) {
                queue.push([x, y]);
                visited[idx] = 1;
            }
        });

        let head = 0;
        while(head < queue.length) {
            const [x, y] = queue[head++];
            const idx = y * width + x;
            
            // Mark for removal
            data[idx * 4 + 3] = 0;

            const neighbors = [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
            for (const [nx, ny] of neighbors) {
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = ny * width + nx;
                    if (!visited[nIdx] && !isOutline[nIdx]) {
                        visited[nIdx] = 1;
                        queue.push([nx, ny]);
                    }
                }
            }
        }
    }

    // --- Simpler Chroma Key for uniform backgrounds ---
    function simpleChromaKeyRemove(imageData, colors) {
        const { data, width, height } = imageData;
        if (width === 0 || height === 0) return;
        
        const activeColors = colors.filter(c => c.enabled && c.r !== undefined);
        if (activeColors.length === 0) return;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            for (const color of activeColors) {
                const distance = Math.sqrt((r - color.r)**2 + (g - color.g)**2 + (b - color.b)**2);
                if (distance < chromaKeyThreshold) {
                    data[i + 3] = 0; // Make transparent
                    break;
                }
            }
        }
    }

    function detectBackgroundColor(imageData, quadrantIndex) {
        const { data, width, height } = imageData;
        if (width < 2 || height < 2) return null;
        
        const samplePoints = [
            [1, 1], [width - 2, 1], // Top-left, top-right
            [1, height - 2], [width - 2, height - 2] // Bottom-left, bottom-right
        ];

        let r_sum = 0, g_sum = 0, b_sum = 0, count = 0;

        for (const [x, y] of samplePoints) {
            const i = (y * width + x) * 4;
            // Avoid black/outline colors in samples
            if (data[i] > blackLineThreshold || data[i+1] > blackLineThreshold || data[i+2] > blackLineThreshold) {
                r_sum += data[i];
                g_sum += data[i+1];
                b_sum += data[i+2];
                count++;
            }
        }

        if (count === 0) return autoDetectedColors[quadrantIndex] || null;

        const avgColor = {
            r: Math.round(r_sum / count),
            g: Math.round(g_sum / count),
            b: Math.round(b_sum / count),
            enabled: true
        };

        // Smooth the color change over time
        const prevColor = autoDetectedColors[quadrantIndex];
        if (prevColor && prevColor.r !== undefined) {
            const smoothing = 0.9;
            avgColor.r = Math.round(prevColor.r * smoothing + avgColor.r * (1 - smoothing));
            avgColor.g = Math.round(prevColor.g * smoothing + avgColor.g * (1 - smoothing));
            avgColor.b = Math.round(prevColor.b * smoothing + avgColor.b * (1 - smoothing));
        }
        
        autoDetectedColors[quadrantIndex] = avgColor;
        return avgColor;
    }


    function drawQuadrants() {
        const contexts = canvasElements.map(c => c.getContext('2d'));
        
        function drawFrame() {
            if (sourceVideo.paused || sourceVideo.ended) {
                animationFrameId = requestAnimationFrame(drawFrame);
                return;
            }

            const videoWidth = sourceVideo.videoWidth;
            const videoHeight = sourceVideo.videoHeight;

            contexts.forEach((ctx, i) => {
                if (!canvasElements[i] || canvasElements[i].width === 0 || canvasElements[i].height === 0) return;

                const mainCrop = getMainCropForQuadrant(i);
                
                const mainSx = mainCrop.x * videoWidth;
                const mainSy = mainCrop.y * videoHeight;
                const mainSWidth = mainCrop.w * videoWidth;
                const mainSHeight = mainCrop.h * videoHeight;

                const canvas = canvasElements[i];
                const destWidth = canvas.width;
                const destHeight = canvas.height;
                
                ctx.clearRect(0, 0, destWidth, destHeight);

                if (mainSWidth > 0 && mainSHeight > 0) {
                     if (chromaKeyEnabled) {
                        const offscreenCanvas = offscreenCanvases[i];
                        const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
                        
                        // Ensure offscreen canvas is the correct size for the main crop
                        const targetW = Math.max(1, Math.round(mainSWidth));
                        const targetH = Math.max(1, Math.round(mainSHeight));
                        if (offscreenCanvas.width !== targetW || offscreenCanvas.height !== targetH) {
                            offscreenCanvas.width = targetW;
                            offscreenCanvas.height = targetH;
                        }

                        offscreenCtx.drawImage(sourceVideo, mainSx, mainSy, mainSWidth, mainSHeight, 0, 0, targetW, targetH);
                        const frame = offscreenCtx.getImageData(0, 0, targetW, targetH);
                         
                        if (advancedModeEnabled && backgroundModel) {
                            if (useOutlineDetection) {
                                // New advanced pipeline
                                const grayscaleFrame = new ImageData(new Uint8ClampedArray(frame.data), targetW, targetH);
                                for(let j=0; j < grayscaleFrame.data.length; j+=4) {
                                    const L = grayscaleFrame.data[j]*0.2126 + grayscaleFrame.data[j+1]*0.7152 + grayscaleFrame.data[j+2]*0.0722;
                                    grayscaleFrame.data[j] = grayscaleFrame.data[j+1] = grayscaleFrame.data[j+2] = L;
                                }
                                const edgeData = sobelEdgeDetection(grayscaleFrame);
                                const charMask = createCharacterMask(edgeData, targetW, targetH);
                                advancedChromaKeyRemove(frame, charMask);
                            } else {
                                // Advanced mode without outline detection (just color range)
                                const emptyMask = new Uint8Array(targetW * targetH).fill(0); // Treat everything as "outside"
                                advancedChromaKeyRemove(frame, emptyMask);
                            }
                        } else { // Fallback to original simple methods
                             if (useOutlineDetection) {
                                let activeColor = chromaKeyColors.find(c => c.enabled);
                                if (advancedModeEnabled) { // but no background model selected
                                    activeColor = detectBackgroundColor(frame, i);
                                }
                                if(activeColor) floodFillRemoveBackground(frame, activeColor);
                            } else {
                                simpleChromaKeyRemove(frame, chromaKeyColors);
                            }
                        }
                        
                        offscreenCtx.putImageData(frame, 0, 0);
                        ctx.drawImage(offscreenCanvas, 0, 0, destWidth, destHeight);
                     } else {
                        ctx.drawImage(sourceVideo, mainSx, mainSy, mainSWidth, mainSHeight, 0, 0, destWidth, destHeight);
                     }
                }
            });
            
            animationFrameId = requestAnimationFrame(drawFrame);
        }

        drawFrame();
    }
    
    // --- Chroma Key Logic ---
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    chromaKeyToggle.addEventListener('change', (e) => {
        chromaKeyEnabled = e.target.checked;
    });

    chromaKeyColorInput1.addEventListener('input', (e) => {
        const rgb = hexToRgb(e.target.value);
        if (rgb) {
            chromaKeyColors[0] = { ...chromaKeyColors[0], ...rgb };
        }
        backgroundModel = null; // Invalidate advanced model if manual color is changed
        regionColorInfo.style.display = 'none';
    });

    chromaKeyColorInput2.addEventListener('input', (e) => {
        const rgb = hexToRgb(e.target.value);
        if (rgb) {
            chromaKeyColors[1] = { ...chromaKeyColors[1], ...rgb };
        }
    });

    addColorBtn.addEventListener('click', () => {
        colorControl2.style.display = 'flex';
        chromaKeyColors[1].enabled = true;
        addColorBtn.style.display = 'none';
    });

    removeColor2Btn.addEventListener('click', () => {
        colorControl2.style.display = 'none';
        chromaKeyColors[1].enabled = false;
        addColorBtn.style.display = 'inline-block';
    });


    eyedropperBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const colorIndex = parseInt(btn.dataset.colorIndex, 10);
            const overlay = document.getElementById('cropper-overlay');
            overlay.style.cursor = 'crosshair';
            
            const pickColor = (e) => {
                e.preventDefault(); // Prevent unwanted side-effects on touch
                const overlay = e.currentTarget;
                const rect = sourceVideo.getBoundingClientRect();

                let touch;
                if (e.changedTouches && e.changedTouches.length > 0) {
                    touch = e.changedTouches[0];
                }

                const clientX = touch ? touch.clientX : e.clientX;
                const clientY = touch ? touch.clientY : e.clientY;

                if (typeof clientX === 'undefined' || typeof clientY === 'undefined') {
                    overlay.style.cursor = '';
                    overlay.removeEventListener('click', pickColor);
                    overlay.removeEventListener('touchend', pickColor);
                    return;
                }

                const x = clientX - rect.left;
                const y = clientY - rect.top;

                const videoX = (x / rect.width) * sourceVideo.videoWidth;
                const videoY = (y / rect.height) * sourceVideo.videoHeight;

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 1;
                tempCanvas.height = 1;
                const tempCtx = tempCanvas.getContext('2d');

                tempCtx.drawImage(sourceVideo, videoX, videoY, 1, 1, 0, 0, 1, 1);
                const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
                
                const newColor = { r: pixel[0], g: pixel[1], b: pixel[2] };
                chromaKeyColors[colorIndex - 1] = { ...chromaKeyColors[colorIndex - 1], ...newColor };
                
                const hexColor = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
                
                if (colorIndex === 1) {
                    chromaKeyColorInput1.value = hexColor;
                } else {
                    chromaKeyColorInput2.value = hexColor;
                }

                // Invalidate advanced model if a manual color is picked
                backgroundModel = null;
                regionColorInfo.style.display = 'none';
                colorControl1.style.display = advancedModeEnabled ? 'none' : 'flex';

                overlay.style.cursor = '';
                overlay.removeEventListener('click', pickColor);
                // For touch, we might need a different event
                overlay.removeEventListener('touchend', pickColor);
            };
            
            overlay.addEventListener('click', pickColor, { once: true });
            overlay.addEventListener('touchend', pickColor, { once: true });
        });
    });

    // --- New: Select Region Logic ---
    selectRegionBtn.addEventListener('click', () => {
        const overlay = document.getElementById('cropper-overlay');
        overlay.style.cursor = 'crosshair';

        let startX, startY;
        let selectionBox = document.createElement('div');
        selectionBox.id = 'selection-box';
        overlay.appendChild(selectionBox);

        const onMove = (e) => {
            e.preventDefault();
            const rect = overlay.getBoundingClientRect();
            let currentX = e.touches ? e.touches[0].clientX : e.clientX;
            let currentY = e.touches ? e.touches[0].clientY : e.clientY;

            const x = Math.min(startX, currentX) - rect.left;
            const y = Math.min(startY, currentY) - rect.top;
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            selectionBox.style.left = `${x}px`;
            selectionBox.style.top = `${y}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;
        };

        const onUp = (e) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchend', onUp);
            
            overlay.style.cursor = '';

            const overlayRect = overlay.getBoundingClientRect();
            const boxRect = selectionBox.getBoundingClientRect();
            selectionBox.remove();
            
            if (boxRect.width < 2 || boxRect.height < 2) return; // Ignore tiny selections

            const videoX = ((boxRect.left - overlayRect.left) / overlayRect.width) * sourceVideo.videoWidth;
            const videoY = ((boxRect.top - overlayRect.top) / overlayRect.height) * sourceVideo.videoHeight;
            const videoW = (boxRect.width / overlayRect.width) * sourceVideo.videoWidth;
            const videoH = (boxRect.height / overlayRect.height) * sourceVideo.videoHeight;

            const tempCanvas = document.createElement('canvas');
            const canvasWidth = Math.max(1, Math.round(videoW));
            const canvasHeight = Math.max(1, Math.round(videoH));
            tempCanvas.width = canvasWidth;
            tempCanvas.height = canvasHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            tempCtx.drawImage(sourceVideo, videoX, videoY, videoW, videoH, 0, 0, canvasWidth, canvasHeight);
            
            try {
                const imageData = tempCtx.getImageData(0, 0, canvasWidth, canvasHeight);
                const data = imageData.data;
                
                let sumR = 0, sumG = 0, sumB = 0;
                let sumSqR = 0, sumSqG = 0, sumSqB = 0;
                const pixelCount = data.length / 4;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i+1], b = data[i+2];
                    sumR += r; sumG += g; sumB += b;
                    sumSqR += r*r; sumSqG += g*g; sumSqB += b*b;
                }
                
                const meanR = sumR / pixelCount;
                const meanG = sumG / pixelCount;
                const meanB = sumB / pixelCount;

                const stdDevR = Math.sqrt(sumSqR / pixelCount - meanR * meanR);
                const stdDevG = Math.sqrt(sumSqG / pixelCount - meanG * meanG);
                const stdDevB = Math.sqrt(sumSqB / pixelCount - meanB * meanB);

                backgroundModel = {
                    mean: { r: meanR, g: meanG, b: meanB },
                    stdDev: { r: stdDevR, g: stdDevG, b: stdDevB }
                };

                // Update UI
                colorControl1.style.display = 'none';
                colorControl2.style.display = 'none';
                addColorBtn.style.display = 'none';
                regionColorInfo.style.display = 'flex';
                regionColorCount.textContent = `Background calibrated from region.`;
                
            } catch (err) {
                console.error("Error processing selected region:", err);
                backgroundModel = null;
            }
        };

        const onDown = (e) => {
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;

            const rect = overlay.getBoundingClientRect();
            selectionBox.style.left = `${startX - rect.left}px`;
            selectionBox.style.top = `${startY - rect.top}px`;
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            selectionBox.style.display = 'block';

            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchend', onUp);
            
            // Remove this listener after it's been used once.
            overlay.removeEventListener('mousedown', onDown);
            overlay.removeEventListener('touchstart', onDown);
        };

        overlay.addEventListener('mousedown', onDown);
        overlay.addEventListener('touchstart', onDown);
    });


    // --- Main Cropper Logic ---
    function makeDraggable(element, onDrag) {
        let isDragging = false;
        
        function onDown(e) {
            e.preventDefault();
            isDragging = true;
            element.classList.add('dragging');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchend', onUp);
        }
        
        function onMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            const rect = cropperContainer.querySelector('.video-wrapper').getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            onDrag(clientX, clientY, rect);
        }
        
        function onUp() {
            isDragging = false;
            element.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchend', onUp);
            renderQuadrants(); // Re-render everything after dragging is done
        }
        
        element.addEventListener('mousedown', onDown);
        element.addEventListener('touchstart', onDown);
    }
    
    makeDraggable(verticalLine, (clientX, clientY, rect) => {
        let newX = (clientX - rect.left) / rect.width;
        mainSplit.x = Math.max(0.05, Math.min(0.95, newX)); // Clamp between 5% and 95%
        updateMainLines();
    });

    makeDraggable(horizontalLine, (clientX, clientY, rect) => {
        let newY = (clientY - rect.top) / rect.height;
        mainSplit.y = Math.max(0.05, Math.min(0.95, newY)); // Clamp
        updateMainLines();
    });

    function updateMainLines() {
        verticalLine.style.left = `${mainSplit.x * 100}%`;
        horizontalLine.style.top = `${mainSplit.y * 100}%`;
    }

    // --- Sub-Cropper Logic ---
    function makeSubCropInteractive(box, index) {
        let mode = '';
        let startX, startY, startLeft, startTop, startWidth, startHeight;
        
        const getParentRect = () => box.parentElement.getBoundingClientRect();
        
        function onDown(e) {
            e.preventDefault();
            e.stopPropagation();

            cropBoxElements.forEach(b => b.classList.remove('active'));
            box.classList.add('active');

            const target = e.target;
            mode = target.classList.contains('crop-handle') ? 'resize' : 'move';
            if (target.classList.contains('crop-handle')) {
                mode += ' ' + Array.from(target.classList).filter(c => c !== 'crop-handle').join(' ');
            }

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            startX = clientX;
            startY = clientY;
            
            const boxRect = box.getBoundingClientRect();
            const parentRect = getParentRect();
            startLeft = (boxRect.left - parentRect.left) / parentRect.width;
            startTop = (boxRect.top - parentRect.top) / parentRect.height;
            startWidth = boxRect.width / parentRect.width;
            startHeight = boxRect.height / parentRect.height;
            
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchend', onUp);
        }

        function onMove(e) {
            e.preventDefault();
            if (!mode) return;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const parentRect = getParentRect();
            if (parentRect.width === 0 || parentRect.height === 0) return;

            const dx = (clientX - startX) / parentRect.width;
            const dy = (clientY - startY) / parentRect.height;

            let { x, y, w, h } = quadrantsData[index].subCrop;
            
            if (mode.startsWith('move')) {
                x = Math.max(0, Math.min(1 - w, startLeft + dx));
                y = Math.max(0, Math.min(1 - h, startTop + dy));
            } else if (mode.startsWith('resize')) {
                const minSize = 0.05; // 5% minimum size
                if (mode.includes('left')) {
                    const newW = startWidth - dx;
                    if (newW > minSize && startLeft + dx >= 0) {
                        x = startLeft + dx;
                        w = newW;
                    }
                }
                if (mode.includes('top')) {
                    const newH = startHeight - dy;
                    if (newH > minSize && startTop + dy >= 0) {
                        y = startTop + dy;
                        h = newH;
                    }
                }
                if (mode.includes('right')) {
                    w = Math.max(minSize, startWidth + dx);
                }
                if (mode.includes('bottom')) {
                    h = Math.max(minSize, startHeight + dy);
                }
                if (x < 0) { w += x; x = 0; }
                if (y < 0) { h += y; y = 0; }
                if (x + w > 1) w = 1 - x;
                if (y + h > 1) h = 1 - y;
            }

            quadrantsData[index].subCrop = { x, y, w, h };
            updateSubCropBoxFromData(index);
        }
        
        function onUp() {
            mode = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchend', onUp);
        }
        
        box.addEventListener('mousedown', onDown);
        box.addEventListener('touchstart', onDown);
    }

    saveButton.addEventListener('click', () => {
        const outputData = quadrantsData.map((q, i) => {
            const mainCrop = getMainCropForQuadrant(i);
            const subCrop = q.subCrop;
            const finalCrop = {
                x: mainCrop.x + subCrop.x * mainCrop.w,
                y: mainCrop.y + subCrop.y * mainCrop.h,
                w: mainCrop.w * subCrop.w,
                h: mainCrop.h * subCrop.h,
            };
            // Round to 4 decimal places
            Object.keys(finalCrop).forEach(key => finalCrop[key] = Math.round(finalCrop[key] * 10000) / 10000);

            return {
                label: q.label,
                quadrant: q.name.toLowerCase().replace('-', '_'),
                crop: finalCrop
            };
        });
        
        jsonOutput.textContent = JSON.stringify(outputData, null, 2);
        outputContainer.style.display = 'block';
        outputContainer.scrollIntoView({ behavior: 'smooth' });
    });
});