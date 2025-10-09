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

    // Remove global threshold elements as they will be per-color
    document.getElementById('chroma-key-threshold').parentElement.remove();

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
    let chromaKeyColors = [
        { r: 0, g: 255, b: 0, enabled: true, threshold: 40 },
        { r: 0, g: 0, b: 255, enabled: false, threshold: 40 }
    ];
    
    const blackLineThreshold = 50; // R, G, B values must all be below this to be a "black line"

    // --- Initial UI Setup ---
    function setupColorControls() {
        [colorControl1, colorControl2].forEach((control, index) => {
            const existingControls = control.querySelector('label, input[type=color], button');
            if(control.querySelector('.threshold-control')) return; // Already setup

            const thresholdDiv = document.createElement('div');
            thresholdDiv.className = 'threshold-control';
            thresholdDiv.style.width = '100%';
            thresholdDiv.style.display = 'flex';
            thresholdDiv.style.alignItems = 'center';
            thresholdDiv.style.gap = '10px';
            thresholdDiv.innerHTML = `
                <label for="chroma-key-threshold-${index + 1}">Threshold:</label>
                <input type="range" id="chroma-key-threshold-${index + 1}" min="0" max="200" value="${chromaKeyColors[index].threshold}">
                <span id="threshold-value-${index + 1}">${chromaKeyColors[index].threshold}</span>
            `;
            control.appendChild(thresholdDiv);

            const thresholdInput = thresholdDiv.querySelector('input');
            const thresholdSpan = thresholdDiv.querySelector('span');

            thresholdInput.addEventListener('input', (e) => {
                const newThreshold = parseInt(e.target.value, 10);
                chromaKeyColors[index].threshold = newThreshold;
                thresholdSpan.textContent = newThreshold;
            });
        });
    }
    setupColorControls();

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
            offscreenCanvas.width = sWidth;
            offscreenCanvas.height = sHeight;
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
                        const offscreenCtx = offscreenCanvas.getContext('2d');
                        
                        // Resize offscreen canvas if needed
                        if (offscreenCanvas.width !== mainSWidth || offscreenCanvas.height !== mainSHeight) {
                            offscreenCanvas.width = mainSWidth;
                            offscreenCanvas.height = mainSHeight;
                        }

                        offscreenCtx.drawImage(sourceVideo, mainSx, mainSy, mainSWidth, mainSHeight, 0, 0, mainSWidth, mainSHeight);
                        const frame = offscreenCtx.getImageData(0, 0, mainSWidth, mainSHeight);
                        const data = frame.data;
                        const width = frame.width;
                        const activeColors = chromaKeyColors.filter(c => c.enabled);

                        for (let j = 0; j < data.length; j += 4) {
                            const red = data[j];
                            const green = data[j + 1];
                            const blue = data[j + 2];
                            
                            let removePixel = false;
                            for (const color of activeColors) {
                                const distance = Math.sqrt(
                                    Math.pow(red - color.r, 2) +
                                    Math.pow(green - color.g, 2) +
                                    Math.pow(blue - color.b, 2)
                                );

                                if (distance < color.threshold) {
                                    removePixel = true;
                                    break;
                                }
                            }
                            
                            if (removePixel) {
                                // Smart outline detection: check neighbors
                                const x = (j / 4) % width;
                                const y = Math.floor((j / 4) / width);
                                let isNearBlackLine = false;

                                // Check 8 neighbors
                                for (let dy = -1; dy <= 1; dy++) {
                                    for (let dx = -1; dx <= 1; dx++) {
                                        if (dx === 0 && dy === 0) continue;
                                        const nx = x + dx;
                                        const ny = y + dy;

                                        if (nx >= 0 && nx < width && ny >= 0 && ny < frame.height) {
                                            const ni = (ny * width + nx) * 4;
                                            const nr = data[ni];
                                            const ng = data[ni + 1];
                                            const nb = data[ni + 2];
                                            if (nr < blackLineThreshold && ng < blackLineThreshold && nb < blackLineThreshold) {
                                                isNearBlackLine = true;
                                                break;
                                            }
                                        }
                                    }
                                    if (isNearBlackLine) break;
                                }

                                if (!isNearBlackLine) {
                                    data[j + 3] = 0; // Set alpha to 0 only if not near a black line
                                }
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

                overlay.style.cursor = '';
                overlay.removeEventListener('click', pickColor);
                // For touch, we might need a different event
                overlay.removeEventListener('touchend', pickColor);
            };
            
            overlay.addEventListener('click', pickColor, { once: true });
            overlay.addEventListener('touchend', pickColor, { once: true });
        });
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