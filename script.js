document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const sourceVideo = document.getElementById('source-video');
    const quadrantsContainer = document.getElementById('quadrants-container');
    const saveButton = document.getElementById('save-labels-btn');
    const outputContainer = document.getElementById('output-container');
    const jsonOutput = document.getElementById('json-output');
    const cropperContainer = document.getElementById('cropper-container');

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
    let cropBoxElements = [];

    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (sourceVideo.src) URL.revokeObjectURL(sourceVideo.src);
        sourceVideo.src = URL.createObjectURL(file);
        
        sourceVideo.addEventListener('loadedmetadata', () => {
            cropperContainer.style.display = 'block';
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
                const subCrop = quadrantsData[i].subCrop;
                
                const finalCrop = {
                    x: mainCrop.x + subCrop.x * mainCrop.w,
                    y: mainCrop.y + subCrop.y * mainCrop.h,
                    w: mainCrop.w * subCrop.w,
                    h: mainCrop.h * subCrop.h,
                };
                
                const sx = finalCrop.x * videoWidth;
                const sy = finalCrop.y * videoHeight;
                const sWidth = finalCrop.w * videoWidth;
                const sHeight = finalCrop.h * videoHeight;

                const canvas = canvasElements[i];
                const destWidth = canvas.width;
                const destHeight = canvas.height;
                
                ctx.clearRect(0, 0, destWidth, destHeight);
                if (sWidth > 0 && sHeight > 0) {
                     // The sub-crop box is relative to the canvas. So we draw the *main* crop into the canvas,
                     // and the sub-crop box overlays it. The final output will combine them, but for visual
                     // editing, the canvas should show the whole quadrant.
                    const mainSx = mainCrop.x * videoWidth;
                    const mainSy = mainCrop.y * videoHeight;
                    const mainSWidth = mainCrop.w * videoWidth;
                    const mainSHeight = mainCrop.h * videoHeight;
                    ctx.drawImage(sourceVideo, mainSx, mainSy, mainSWidth, mainSHeight, 0, 0, destWidth, destHeight);
                }
            });
            
            animationFrameId = requestAnimationFrame(drawFrame);
        }

        drawFrame();
    }
    
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