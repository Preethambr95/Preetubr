// ==================== VOICE RECORDER & KARAOKE APPLICATION ====================

// Audio Context
let audioContext;
let mediaStream;
let mediaRecorder;
let analyser;
let audioChunks = [];
let isRecording = false;
let isPaused = false;
let recordingStartTime = 0;
let pausedTime = 0;
let recordingIntervalId = null;

// Audio Processing Nodes
let sourceNode;
let gainNode;
let compressorNode;
let biquadFilterNode;
let dryGainNode;
let wetGainNode;

// Karaoke Variables
let karaokeAudio = null;
let isKaraokeRecording = false;
let karaokeRecordingStartTime = 0;
let karaokeRecordingIntervalId = null;

// Recording Storage
let recordingsStorage = [];

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    initializeAudioContext();
    setupEventListeners();
    loadRecordingsFromStorage();
    updateRecordingsList();
});

// ==================== AUDIO CONTEXT SETUP WITH PROCESSING ====================

async function initializeAudioContext() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create analyser for visualization
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        
        // Create audio processing nodes
        sourceNode = null; // Will be set during recording
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1;
        
        // Compressor for vocal clarity and consistency
        compressorNode = audioContext.createDynamicsCompressor();
        compressorNode.threshold.value = -24;
        compressorNode.knee.value = 30;
        compressorNode.ratio.value = 4;
        compressorNode.attack.value = 0.003;
        compressorNode.release.value = 0.25;
        
        // High-pass filter to remove rumble and background noise
        biquadFilterNode = audioContext.createBiquadFilter();
        biquadFilterNode.type = 'highpass';
        biquadFilterNode.frequency.value = 80;
        
        // Wet/Dry mix for enhancement
        dryGainNode = audioContext.createGain();
        dryGainNode.gain.value = 0.6;
        
        wetGainNode = audioContext.createGain();
        wetGainNode.gain.value = 0.4;
        
        showToast('Audio processing initialized', 'success');
    } catch (error) {
        showToast('Error initializing audio context: ' + error.message, 'error');
    }
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    // Recorder Controls
    document.getElementById('startBtn').addEventListener('click', startRecording);
    document.getElementById('stopBtn').addEventListener('click', stopRecording);
    document.getElementById('pauseBtn').addEventListener('click', pauseRecording);
    document.getElementById('resumeBtn').addEventListener('click', resumeRecording);
    document.getElementById('discardBtn').addEventListener('click', discardRecording);
    document.getElementById('saveBtn').addEventListener('click', saveRecording);
    document.getElementById('retakeBtn').addEventListener('click', retakeRecording);

    // Microphone Level
    document.getElementById('micLevel').addEventListener('input', (e) => {
        if (gainNode) {
            gainNode.gain.value = parseInt(e.target.value) / 100;
        }
    });

    // Karaoke Events
    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('karaokeFile').click();
    });

    document.getElementById('uploadArea').addEventListener('dragover', (e) => {
        e.preventDefault();
        document.getElementById('uploadArea').style.borderColor = '#00D4FF';
    });

    document.getElementById('uploadArea').addEventListener('dragleave', () => {
        document.getElementById('uploadArea').style.borderColor = '';
    });

    document.getElementById('uploadArea').addEventListener('drop', handleFileDropped);
    document.getElementById('karaokeFile').addEventListener('change', handleFileSelected);

    // Karaoke Controls
    document.getElementById('bgVolume').addEventListener('input', updateKaraokeVolume);
    document.getElementById('vocalVolume').addEventListener('input', updateKaraokeVolume);
    document.getElementById('pitchControl').addEventListener('input', updatePitchValue);

    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', changePlaybackSpeed);
    });

    // Karaoke Recording
    document.getElementById('startKaraokeRecordBtn').addEventListener('click', startKaraokeRecording);
    document.getElementById('stopKaraokeRecordBtn').addEventListener('click', stopKaraokeRecording);

    // Library
    document.getElementById('searchRecordings').addEventListener('input', filterRecordings);
    document.getElementById('clearLibraryBtn').addEventListener('click', clearLibrary);
}

// ==================== TAB SWITCHING ====================

function switchTab(e) {
    const tabName = e.currentTarget.dataset.tab;

    // Remove active class from all tabs and contents
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Add active class to clicked tab and corresponding content
    e.currentTarget.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

// ==================== RECORDER FUNCTIONS WITH AUDIO ENHANCEMENT ====================

async function startRecording() {
    try {
        if (!mediaStream) {
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false // We'll handle gain manually for better control
                }
            });
        }

        audioChunks = [];
        
        // Create a custom media recorder with audio processing
        const audioTracks = mediaStream.getAudioTracks();
        
        // Create audio source from media stream
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        
        // Create destination for processing chain
        const processingDestination = audioContext.createMediaStreamDestination();
        
        // Audio processing chain for vocal enhancement:
        // Input -> High-pass filter -> Compressor -> Gain -> Analyser -> Destination
        
        sourceNode.connect(biquadFilterNode);
        biquadFilterNode.connect(compressorNode);
        compressorNode.connect(gainNode);
        gainNode.connect(analyser);
        gainNode.connect(processingDestination);
        
        // Create recorder with processed audio
        mediaRecorder = new MediaRecorder(processingDestination.stream);
        
        recordingStartTime = Date.now() - pausedTime;
        isRecording = true;
        isPaused = false;

        // Start recording
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = handleRecordingStop;
        mediaRecorder.start();

        // Update UI
        updateRecorderUI();
        startVisualization();
        startRecordingTimer();

        showToast('🎤 Recording started with vocal enhancement', 'success');
    } catch (error) {
        showToast('Microphone access denied: ' + error.message, 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        isPaused = false;
        clearInterval(recordingIntervalId);
        stopVisualization();
        updateRecorderUI();
        
        // Disconnect audio nodes
        if (sourceNode) {
            sourceNode.disconnect();
        }
        
        showToast('Recording stopped', 'success');
    }
}

function pauseRecording() {
    if (mediaRecorder && isRecording && !isPaused) {
        mediaRecorder.pause();
        isPaused = true;
        clearInterval(recordingIntervalId);
        updateRecorderUI();
        showToast('Recording paused', 'info');
    }
}

function resumeRecording() {
    if (mediaRecorder && isPaused) {
        pausedTime = Date.now() - recordingStartTime;
        mediaRecorder.resume();
        isPaused = false;
        startRecordingTimer();
        updateRecorderUI();
        showToast('Recording resumed', 'info');
    }
}

function discardRecording() {
    if (mediaRecorder && (isRecording || isPaused)) {
        mediaRecorder.stop();
        isRecording = false;
        isPaused = false;
        audioChunks = [];
        pausedTime = 0;
        clearInterval(recordingIntervalId);
        document.getElementById('recordingTime').textContent = '00:00';
        document.getElementById('playbackSection').style.display = 'none';
        updateRecorderUI();
        stopVisualization();
        document.getElementById('visualizerStatus').textContent = 'Ready to Record';
        
        // Disconnect audio nodes
        if (sourceNode) {
            sourceNode.disconnect();
        }
        
        showToast('Recording discarded', 'warning');
    }
}

function handleRecordingStop() {
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    const audioElement = document.getElementById('recordedAudio');
    audioElement.src = url;

    document.getElementById('playbackSection').style.display = 'block';
    document.getElementById('visualizerStatus').textContent = 'Ready to Play';
}

function saveRecording() {
    if (audioChunks.length === 0) {
        showToast('No recording to save', 'error');
        return;
    }

    const timestamp = new Date().toLocaleString();
    const duration = calculateDuration();

    const recording = {
        id: Date.now(),
        name: `Recording ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        date: timestamp,
        duration: duration,
        blob: new Blob(audioChunks, { type: 'audio/wav' }),
        url: URL.createObjectURL(new Blob(audioChunks, { type: 'audio/wav' }))
    };

    recordingsStorage.push(recording);
    saveRecordingsToStorage();
    updateRecordingsList();

    // Download the file
    downloadRecording(recording);

    showToast('✅ Recording saved with enhanced audio quality!', 'success');
}

function retakeRecording() {
    audioChunks = [];
    pausedTime = 0;
    document.getElementById('recordingTime').textContent = '00:00';
    document.getElementById('playbackSection').style.display = 'none';
    document.getElementById('visualizerStatus').textContent = 'Ready to Record';
    updateRecorderUI();
}

function downloadRecording(recording) {
    const a = document.createElement('a');
    a.href = recording.url;
    a.download = `${recording.name}.wav`;
    a.click();
}

// ==================== VISUALIZATION ====================

function startVisualization() {
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    function draw() {
        if (!isRecording && !isPaused) return;

        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = 'rgba(15, 15, 30, 0.1)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        // Gradient for bars
        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#00D4FF');
        gradient.addColorStop(0.5, '#FF006E');
        gradient.addColorStop(1, '#00D4FF');

        canvasCtx.fillStyle = gradient;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }

        // Update microphone level
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        document.getElementById('levelBar').style.width = average + '%';
    }

    draw();
}

function stopVisualization() {
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('levelBar').style.width = '0%';
}

// ==================== RECORDING TIMER ====================

function startRecordingTimer() {
    recordingIntervalId = setInterval(() => {
        const elapsed = Date.now() - recordingStartTime;
        const totalSeconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        document.getElementById('recordingTime').textContent =
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        document.getElementById('visualizerStatus').textContent = isRecording ? 'Recording...' : 'Paused';
    }, 100);
}

function calculateDuration() {
    const elapsed = Date.now() - recordingStartTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ==================== UI UPDATES ====================

function updateRecorderUI() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const discardBtn = document.getElementById('discardBtn');

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        discardBtn.disabled = false;
    } else if (isPaused) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
        discardBtn.disabled = false;
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        discardBtn.disabled = true;
    }
}

// ==================== KARAOKE FUNCTIONS ====================

function handleFileDropped(e) {
    e.preventDefault();
    document.getElementById('uploadArea').style.borderColor = '';
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        loadKaraokeFile(files[0]);
    }
}

function handleFileSelected(e) {
    const files = e.target.files;
    if (files.length > 0) {
        loadKaraokeFile(files[0]);
    }
}

function loadKaraokeFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            karaokeAudio = new Audio();
            karaokeAudio.src = e.target.result;

            document.getElementById('karaokeAudio').src = e.target.result;
            document.getElementById('trackName').textContent = file.name;
            document.getElementById('uploadArea').style.display = 'none';
            document.getElementById('karaokePlayer').style.display = 'block';

            showToast('🎵 Karaoke track loaded!', 'success');
        } catch (error) {
            showToast('Error loading karaoke file: ' + error.message, 'error');
        }
    };
    reader.readAsDataURL(file);
}

function updateKaraokeVolume() {
    const bgVolume = parseInt(document.getElementById('bgVolume').value) / 100;
    const vocalVolume = parseInt(document.getElementById('vocalVolume').value) / 100;

    document.getElementById('bgVolumeValue').textContent = bgVolume * 100 + '%';
    document.getElementById('vocalVolumeValue').textContent = vocalVolume * 100 + '%';

    // Apply volume to audio element
    const audio = document.getElementById('karaokeAudio');
    audio.volume = Math.min(bgVolume + vocalVolume, 1);
}

function updatePitchValue() {
    const pitch = document.getElementById('pitchControl').value;
    document.getElementById('pitchValue').textContent = pitch + ' semitones';
}

function changePlaybackSpeed(e) {
    document.querySelectorAll('.speed-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');

    const speed = parseFloat(e.target.dataset.speed);
    document.getElementById('karaokeAudio').playbackRate = speed;
}

async function startKaraokeRecording() {
    try {
        if (!mediaStream) {
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            });
        }

        audioChunks = [];
        
        // Create audio source from media stream with processing
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const processingDestination = audioContext.createMediaStreamDestination();
        
        // Apply audio processing chain
        sourceNode.connect(biquadFilterNode);
        biquadFilterNode.connect(compressorNode);
        compressorNode.connect(gainNode);
        gainNode.connect(processingDestination);
        
        mediaRecorder = new MediaRecorder(processingDestination.stream);
        karaokeRecordingStartTime = Date.now();
        isKaraokeRecording = true;

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = handleKaraokeRecordingStop;
        mediaRecorder.start();

        document.getElementById('startKaraokeRecordBtn').disabled = true;
        document.getElementById('stopKaraokeRecordBtn').disabled = false;
        document.getElementById('karaokeAudio').play();

        startKaraokeRecordingTimer();
        showToast('🎤 Karaoke recording started with vocal enhancement!', 'success');
    } catch (error) {
        showToast('Microphone access denied: ' + error.message, 'error');
    }
}

function stopKaraokeRecording() {
    if (mediaRecorder && isKaraokeRecording) {
        mediaRecorder.stop();
        isKaraokeRecording = false;
        document.getElementById('karaokeAudio').pause();
        document.getElementById('karaokeAudio').currentTime = 0;
        clearInterval(karaokeRecordingIntervalId);

        // Disconnect audio nodes
        if (sourceNode) {
            sourceNode.disconnect();
        }

        document.getElementById('startKaraokeRecordBtn').disabled = false;
        document.getElementById('stopKaraokeRecordBtn').disabled = true;

        showToast('✅ Karaoke recording stopped!', 'success');
    }
}

function handleKaraokeRecordingStop() {
    const blob = new Blob(audioChunks, { type: 'audio/wav' });
    const recording = {
        id: Date.now(),
        name: `Karaoke ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        date: new Date().toLocaleString(),
        duration: formatDuration(Date.now() - karaokeRecordingStartTime),
        blob: blob,
        url: URL.createObjectURL(blob)
    };

    recordingsStorage.push(recording);
    saveRecordingsToStorage();
    updateRecordingsList();

    downloadRecording(recording);
    showToast('✅ Karaoke recording saved with enhanced vocals!', 'success');
}

function startKaraokeRecordingTimer() {
    karaokeRecordingIntervalId = setInterval(() => {
        const elapsed = Date.now() - karaokeRecordingStartTime;
        const totalSeconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        document.getElementById('karaokeRecordingTime').textContent =
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 100);
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ==================== LIBRARY FUNCTIONS ====================

function updateRecordingsList() {
    const listContainer = document.getElementById('recordingsList');

    if (recordingsStorage.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">No recordings yet. Start recording to build your library!</p>';
        return;
    }

    listContainer.innerHTML = recordingsStorage.map(recording => `
        <div class="recording-item">
            <div class="recording-header">
                <div>
                    <div class="recording-title">${recording.name}</div>
                    <div class="recording-date">${recording.date}</div>
                </div>
                <div class="recording-duration">${recording.duration}</div>
            </div>
            <audio class="recording-audio" src="${recording.url}" controls></audio>
            <div class="recording-actions">
                <button onclick="downloadRecording({name: '${recording.name}', url: '${recording.url}'})">
                    ⬇️ Download
                </button>
                <button class="delete" onclick="deleteRecording(${recording.id})">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `).join('');
}

function filterRecordings() {
    const searchTerm = document.getElementById('searchRecordings').value.toLowerCase();
    const items = document.querySelectorAll('.recording-item');

    items.forEach(item => {
        const title = item.querySelector('.recording-title').textContent.toLowerCase();
        item.style.display = title.includes(searchTerm) ? 'block' : 'none';
    });
}

function deleteRecording(id) {
    if (confirm('Are you sure you want to delete this recording?')) {
        recordingsStorage = recordingsStorage.filter(r => r.id !== id);
        saveRecordingsToStorage();
        updateRecordingsList();
        showToast('Recording deleted', 'warning');
    }
}

function clearLibrary() {
    if (confirm('Are you sure you want to delete all recordings? This cannot be undone!')) {
        recordingsStorage = [];
        saveRecordingsToStorage();
        updateRecordingsList();
        showToast('Library cleared', 'warning');
    }
}

// ==================== STORAGE FUNCTIONS ====================

function saveRecordingsToStorage() {
    const recordingsToSave = recordingsStorage.map(r => ({
        id: r.id,
        name: r.name,
        date: r.date,
        duration: r.duration
    }));
    localStorage.setItem('recordings', JSON.stringify(recordingsToSave));
}

function loadRecordingsFromStorage() {
    const saved = localStorage.getItem('recordings');
    if (saved) {
        const parsedRecordings = JSON.parse(saved);
        recordingsStorage = parsedRecordings.map(r => ({
            ...r,
            blob: null,
            url: ''
        }));
    }
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ==================== CLEANUP ====================

window.addEventListener('beforeunload', () => {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
    if (isRecording || isPaused) {
        stopRecording();
    }
});
