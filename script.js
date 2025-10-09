document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const segmentsContainer = document.getElementById('segments-container');
    const saveButton = document.getElementById('save-labels-btn');
    const outputContainer = document.getElementById('output-container');
    const jsonOutput = document.getElementById('json-output');

    let videoUrl = null;
    let segmentsData = [];

    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
        }
        videoUrl = URL.createObjectURL(file);

        const video = document.createElement('video');
        video.src = videoUrl;
        video.preload = 'metadata';

        video.addEventListener('loadedmetadata', () => {
            const duration = video.duration;
            const segmentDuration = duration / 4;
            segmentsData = [];
            
            for (let i = 0; i < 4; i++) {
                segmentsData.push({
                    id: i,
                    start: i * segmentDuration,
                    end: (i + 1) * segmentDuration,
                    label: ''
                });
            }
            
            // Adjust the last segment to end exactly at the video's duration
            if (segmentsData.length > 0) {
                segmentsData[segmentsData.length - 1].end = duration;
            }

            renderSegments();
            saveButton.style.display = 'inline-block';
            outputContainer.style.display = 'none';
        });
    });

    function renderSegments() {
        segmentsContainer.innerHTML = '';
        segmentsData.forEach((segment, index) => {
            const segmentElement = document.createElement('div');
            segmentElement.className = 'segment';
            segmentElement.innerHTML = `
                <div class="segment-header">Section ${index + 1}</div>
                <div class="segment-time">
                    Time: ${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s
                </div>
                <video muted loop playsinline></video>
                <input type="text" class="label-input" placeholder="Enter animation label (e.g., 'jump', 'attack')">
            `;
            
            const videoPlayer = segmentElement.querySelector('video');
            const labelInput = segmentElement.querySelector('.label-input');
            
            videoPlayer.src = videoUrl;

            // This is the core logic for looping a segment
            videoPlayer.addEventListener('timeupdate', () => {
                if (videoPlayer.currentTime < segment.start || videoPlayer.currentTime >= segment.end) {
                    videoPlayer.currentTime = segment.start;
                }
            });

            // Start playing when the video is ready
            videoPlayer.addEventListener('loadeddata', () => {
                videoPlayer.currentTime = segment.start;
                videoPlayer.play().catch(e => console.error("Autoplay failed:", e));
            });

            // Save label on input change
            labelInput.addEventListener('input', (event) => {
                segmentsData[index].label = event.target.value;
            });

            segmentsContainer.appendChild(segmentElement);
        });
    }

    saveButton.addEventListener('click', () => {
        const outputData = segmentsData.map(s => ({
            label: s.label,
            startTime: s.start.toFixed(2),
            endTime: s.end.toFixed(2)
        }));
        
        jsonOutput.textContent = JSON.stringify(outputData, null, 2);
        outputContainer.style.display = 'block';
        outputContainer.scrollIntoView({ behavior: 'smooth' });
    });
});

