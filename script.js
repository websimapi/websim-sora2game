document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const sourceVideo = document.getElementById('source-video');
    const quadrantsContainer = document.getElementById('quadrants-container');
    const saveButton = document.getElementById('save-labels-btn');
    const outputContainer = document.getElementById('output-container');
    const jsonOutput = document.getElementById('json-output');

    // New cropper elements
    const cropperContainer = document.getElementById('cropper-container');
    const verticalLine = document.getElementById('vertical-line');
    const horizontalLine = document.getElementById('horizontal-line');

    let animationFrameId = null;
    let quadrantsData = [
        { id: 0, name: 'Top-Left', label: '', crop: { x: 0, y: 0, w: 0.5, h: 0.5 } },
        { id: 1, name: 'Top-Right', label: '', crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
        { id: 2, name: 'Bottom-Left', label: '', crop: { x: 0, y: 0.5, w: 0.5, h: 0.5 } },
        { id: 3, name: 'Bottom-Right', label: '', crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } }
    ];
    let canvasElements = [];
    let splitX = 0.5; // 0 to 1
    let splitY = 0.5; // 0 to 1

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
            resetCropLines();
            renderQuadrants();
            saveButton.style.display = 'inline-block';
            outputContainer.style.display = 'none';
            sourceVideo.play().catch(e => console.error("Autoplay failed:", e));
        });
    });

    function renderQuadrants() {
        quadrantsContainer.innerHTML = '';
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        canvasElements = [];

        quadrantsData.forEach((quadrant, index) => {
            const quadrantElement = document.createElement('div');
            quadrantElement.className = 'quadrant';
            quadrantElement.innerHTML = `
                <div class="quadrant-header">${quadrant.name}</div>
                <canvas></canvas>
                <input type="text" class="label-input" placeholder="Enter animation label (e.g., 'jump')">
            `;
            
            const canvas = quadrantElement.querySelector('canvas');
            const labelInput = quadrantElement.querySelector('.label-input');
            
            // Set canvas dimensions based on video crop
            const videoWidth = sourceVideo.videoWidth;
            const videoHeight = sourceVideo.videoHeight;
            canvas.width = videoWidth * quadrant.crop.w;
            canvas.height = videoHeight * quadrant.crop.h;
            canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;

            canvasElements.push(canvas);

            labelInput.addEventListener('input', (event) => {
                quadrantsData[index].label = event.target.value;
            });

            quadrantsContainer.appendChild(quadrantElement);
        });
        
        drawQuadrants();
    }

    function drawQuadrants() {
        const contexts = canvasElements.map(c => c.getContext('2d'));
        const vW = sourceVideo.videoWidth;
        const vH = sourceVideo.videoHeight;
        
        function drawFrame() {
            if (sourceVideo.paused || sourceVideo.ended) {
                animationFrameId = requestAnimationFrame(drawFrame);
                return;
            }

            contexts.forEach((ctx, i) => {
                const q = quadrantsData[i];
                const crop = q.crop;
                ctx.drawImage(
                    sourceVideo,
                    crop.x * vW, crop.y * vH, crop.w * vW, crop.h * vH,
                    0, 0, canvasElements[i].width, canvasElements[i].height
                );
            });
            
            animationFrameId = requestAnimationFrame(drawFrame);
        }

        drawFrame();
    }

    function updateCropData() {
        // Top-Left
        quadrantsData[0].crop = { x: 0, y: 0, w: splitX, h: splitY };
        // Top-Right
        quadrantsData[1].crop = { x: splitX, y: 0, w: 1 - splitX, h: splitY };
        // Bottom-Left
        quadrantsData[2].crop = { x: 0, y: splitY, w: splitX, h: 1 - splitY };
        // Bottom-Right
        quadrantsData[3].crop = { x: splitX, y: splitY, w: 1 - splitX, h: 1 - splitY };

        // Update canvas sizes
        canvasElements.forEach((canvas, i) => {
            const q = quadrantsData[i];
            const videoWidth = sourceVideo.videoWidth;
            const videoHeight = sourceVideo.videoHeight;
            canvas.width = videoWidth * q.crop.w;
            canvas.height = videoHeight * q.crop.h;
            canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
        });
    }
    
    function makeDraggable(line, orientation) {
        let isDragging = false;

        function onDown(e) {
            isDragging = true;
            line.classList.add('dragging');
            document.body.style.cursor = orientation === 'vertical' ? 'ew-resize' : 'ns-resize';
            e.preventDefault();
        }

        function onUp() {
            if (!isDragging) return;
            isDragging = false;
            line.classList.remove('dragging');
            document.body.style.cursor = 'default';
        }
        
        function onMove(e) {
            if (!isDragging) return;
            e.preventDefault();
            const rect = sourceVideo.getBoundingClientRect();
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            if (orientation === 'vertical') {
                let newX = (clientX - rect.left) / rect.width;
                splitX = Math.max(0.05, Math.min(0.95, newX)); // Clamp between 5% and 95%
                line.style.left = `${splitX * 100}%`;
            } else {
                let newY = (clientY - rect.top) / rect.height;
                splitY = Math.max(0.05, Math.min(0.95, newY));
                line.style.top = `${splitY * 100}%`;
            }
            updateCropData();
        }

        line.addEventListener('mousedown', onDown);
        line.addEventListener('touchstart', onDown);

        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);

        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
    }

    makeDraggable(verticalLine, 'vertical');
    makeDraggable(horizontalLine, 'horizontal');

    function resetCropLines() {
        splitX = 0.5;
        splitY = 0.5;
        verticalLine.style.left = '50%';
        horizontalLine.style.top = '50%';
        updateCropData();
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