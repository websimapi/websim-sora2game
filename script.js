document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const sourceVideo = document.getElementById('source-video');
    const quadrantsContainer = document.getElementById('quadrants-container');
    const saveButton = document.getElementById('save-labels-btn');
    const outputContainer = document.getElementById('output-container');
    const jsonOutput = document.getElementById('json-output');

    // New cropper elements
    const cropperContainer = document.getElementById('cropper-container');

    let animationFrameId = null;
    let quadrantsData = [
        { id: 0, name: 'Top-Left', label: '', crop: { x: 0, y: 0, w: 0.5, h: 0.5 } },
        { id: 1, name: 'Top-Right', label: '', crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
        { id: 2, name: 'Bottom-Left', label: '', crop: { x: 0, y: 0.5, w: 0.5, h: 0.5 } },
        { id: 3, name: 'Bottom-Right', label: '', crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }
    ];
    let canvasElements = [];
    let cropBoxElements = [];

    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        if (sourceVideo.src) {
            URL.revokeObjectURL(sourceVideo.src);
        }
        const videoUrl = URL.createObjectURL(file);
        sourceVideo.src = videoUrl;
        
        sourceVideo.addEventListener('loadedmetadata', () => {
            cropperContainer.style.display = 'block';
            renderQuadrants();
            saveButton.style.display = 'inline-block';
            outputContainer.style.display = 'none';
            sourceVideo.play().catch(e => console.error("Autoplay failed:", e));
        });
    });

    function initializeCropBoxes() {
        // This function is now part of renderQuadrants
    }

    function updateBoxFromData(index) {
        if (!cropBoxElements[index]) return;
        const box = cropBoxElements[index];
        const crop = quadrantsData[index].crop;
        box.style.left = `${crop.x * 100}%`;
        box.style.top = `${crop.y * 100}%`;
        box.style.width = `${crop.w * 100}%`;
        box.style.height = `${crop.h * 100}%`;
    }

    function renderQuadrants() {
        quadrantsContainer.innerHTML = '';
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

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
            const labelInput = quadrantElement.querySelector('.label-input');
            
            // Set canvas dimensions based on video aspect ratio
            const videoWidth = sourceVideo.videoWidth;
            const videoHeight = sourceVideo.videoHeight;
            canvas.width = videoWidth;
            canvas.height = videoHeight;
            canvas.style.aspectRatio = `${videoWidth} / ${videoHeight}`;

            canvasElements.push(canvas);

            // Create and append crop box
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
            updateBoxFromData(index);
            makeInteractive(box, index);

            labelInput.addEventListener('input', (event) => {
                quadrantsData[index].label = event.target.value;
            });

            quadrantsContainer.appendChild(quadrantElement);
        });
        
        drawQuadrants();
    }

    function drawQuadrants() {
        const contexts = canvasElements.map(c => c.getContext('2d'));
        
        function drawFrame() {
            if (sourceVideo.paused || sourceVideo.ended) {
                animationFrameId = requestAnimationFrame(drawFrame);
                return;
            }

            contexts.forEach((ctx, i) => {
                if (canvasElements[i].width > 0 && canvasElements[i].height > 0) {
                    // Draw the full video frame onto each canvas
                    ctx.drawImage(sourceVideo, 0, 0, canvasElements[i].width, canvasElements[i].height);
                }
            });
            
            animationFrameId = requestAnimationFrame(drawFrame);
        }

        drawFrame();
    }

    function updateCropData(index, newCrop) {
        quadrantsData[index].crop = newCrop;
    }
    
    function makeInteractive(box, index) {
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

            let { x, y, w, h } = quadrantsData[index].crop;
            
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
                // Boundary checks
                if (x < 0) { w += x; x = 0; }
                if (y < 0) { h += y; y = 0; }
                if (x + w > 1) w = 1 - x;
                if (y + h > 1) h = 1 - y;
            }

            const newCrop = { x, y, w, h };
            updateCropData(index, newCrop);
            updateBoxFromData(index);
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
        const outputData = quadrantsData.map(q => ({
            label: q.label,
            quadrant: q.name.toLowerCase().replace('-', '_'),
            crop: q.crop
        }));
        
        jsonOutput.textContent = JSON.stringify(outputData, null, 2);
        outputContainer.style.display = 'block';
        outputContainer.scrollIntoView({ behavior: 'smooth' });
    });
});