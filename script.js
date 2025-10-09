document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const sourceVideo = document.getElementById('source-video');
    const quadrantsContainer = document.getElementById('quadrants-container');
    const saveButton = document.getElementById('save-labels-btn');
    const outputContainer = document.getElementById('output-container');
    const jsonOutput = document.getElementById('json-output');

    let animationFrameId = null;
    let quadrantsData = [
        { id: 0, name: 'Top-Left', label: '' },
        { id: 1, name: 'Top-Right', label: '' },
        { id: 2, name: 'Bottom-Left', label: '' },
        { id: 3, name: 'Bottom-Right', label: '' }
    ];

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

        const canvasElements = [];

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
            
            // Set canvas dimensions based on video
            const videoWidth = sourceVideo.videoWidth;
            const videoHeight = sourceVideo.videoHeight;
            canvas.width = videoWidth / 2;
            canvas.height = videoHeight / 2;
            canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;

            canvasElements.push(canvas);

            labelInput.addEventListener('input', (event) => {
                quadrantsData[index].label = event.target.value;
            });

            quadrantsContainer.appendChild(quadrantElement);
        });
        
        drawQuadrants(canvasElements);
    }

    function drawQuadrants(canvases) {
        const contexts = canvases.map(c => c.getContext('2d'));
        const vW = sourceVideo.videoWidth;
        const vH = sourceVideo.videoHeight;
        const halfVW = vW / 2;
        const halfVH = vH / 2;
        
        function drawFrame() {
            if (sourceVideo.paused || sourceVideo.ended) {
                animationFrameId = requestAnimationFrame(drawFrame);
                return;
            }

            // Top-Left
            contexts[0].drawImage(sourceVideo, 0, 0, halfVW, halfVH, 0, 0, canvases[0].width, canvases[0].height);
            // Top-Right
            contexts[1].drawImage(sourceVideo, halfVW, 0, halfVW, halfVH, 0, 0, canvases[1].width, canvases[1].height);
            // Bottom-Left
            contexts[2].drawImage(sourceVideo, 0, halfVH, halfVW, halfVH, 0, 0, canvases[2].width, canvases[2].height);
            // Bottom-Right
            contexts[3].drawImage(sourceVideo, halfVW, halfVH, halfVW, halfVH, 0, 0, canvases[3].width, canvases[3].height);
            
            animationFrameId = requestAnimationFrame(drawFrame);
        }

        drawFrame();
    }

    saveButton.addEventListener('click', () => {
        const outputData = quadrantsData.map(q => ({
            label: q.label,
            quadrant: q.name.toLowerCase().replace('-', '_')
        }));
        
        jsonOutput.textContent = JSON.stringify(outputData, null, 2);
        outputContainer.style.display = 'block';
        outputContainer.scrollIntoView({ behavior: 'smooth' });
    });
});