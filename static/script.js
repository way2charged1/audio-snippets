document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const snippetId = urlParams.get('id');

    const creatorView = document.getElementById('creator-view');
    const listenerView = document.getElementById('listener-view');
    
    // Creator Form Elements
    const form = document.getElementById('snippet-form');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = generateBtn.querySelector('.spinner');
    const resultContainer = document.getElementById('result-container');
    const shareLinkInput = document.getElementById('share-link');
    const copyBtn = document.getElementById('copy-btn');
    const viewSnippetBtn = document.getElementById('view-snippet-btn');

    // Listener Elements
    const listenerTitle = document.getElementById('listener-title');
    const listenerTimes = document.getElementById('listener-times');
    const audioPlayer = document.getElementById('audio-player');
    const downloadBtn = document.getElementById('download-btn');
    const vinylRecord = document.querySelector('.vinyl-record');

    if (snippetId) {
        // We are in listener mode
        creatorView.classList.add('hidden');
        listenerView.classList.remove('hidden');
        loadSnippet(snippetId);
    } else {
        // We are in creator mode
        creatorView.classList.remove('hidden');
        listenerView.classList.add('hidden');
    }

    // --- CREATOR LOGIC ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = document.getElementById('url').value;
        const startTime = document.getElementById('start-time').value;
        const endTime = document.getElementById('end-time').value;

        // UI Loading state
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        generateBtn.disabled = true;
        resultContainer.classList.add('hidden');

        try {
            const response = await fetch('/api/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, start_time: startTime, end_time: endTime })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to generate snippet');
            }

            // Success
            const shareUrl = `${window.location.origin}/?id=${data.id}`;
            shareLinkInput.value = shareUrl;
            viewSnippetBtn.href = shareUrl;
            resultContainer.classList.remove('hidden');

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            // Reset UI Loading state
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
            generateBtn.disabled = false;
        }
    });

    copyBtn.addEventListener('click', () => {
        shareLinkInput.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = 'Copy', 2000);
    });

    // --- LISTENER LOGIC ---
    async function loadSnippet(id) {
        try {
            const response = await fetch(`/api/snippet/${id}`);
            if (!response.ok) {
                throw new Error('Snippet not found');
            }
            const data = await response.json();
            
            listenerTitle.textContent = data.title;
            listenerTimes.textContent = `${data.start_time} - ${data.end_time}`;
            
            const audioUrl = `/audio/${id}.mp3`;
            audioPlayer.src = audioUrl;
            downloadBtn.href = audioUrl;
            downloadBtn.download = `${data.title} Snippet.mp3`;

            // Vinyl animation logic
            audioPlayer.addEventListener('play', () => {
                vinylRecord.classList.add('playing');
            });
            audioPlayer.addEventListener('pause', () => {
                vinylRecord.classList.remove('playing');
            });
            audioPlayer.addEventListener('ended', () => {
                vinylRecord.classList.remove('playing');
            });

            // Lyrics Logic
            function parseTime(timeStr) {
                if (!timeStr) return 0;
                const parts = timeStr.split(':').map(Number);
                if (parts.length === 1) return parts[0];
                if (parts.length === 2) return parts[0] * 60 + parts[1];
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                return 0;
            }

            function parseLRC(lrcText) {
                if (!lrcText) return [];
                const lines = lrcText.split('\n');
                const lyrics = [];
                const regex = /\[(\d+):(\d+\.\d+)\](.*)/;
                for (const line of lines) {
                    const match = line.match(regex);
                    if (match) {
                        const min = parseInt(match[1]);
                        const sec = parseFloat(match[2]);
                        const text = match[3].trim();
                        if (text) {
                            lyrics.push({ time: min * 60 + sec, text: text });
                        }
                    }
                }
                return lyrics;
            }

            const lyricsContainer = document.getElementById('lyrics-container');
            const startSec = parseTime(data.start_time);
            const parsedLyrics = parseLRC(data.lyrics);
            
            if (parsedLyrics.length > 0) {
                lyricsContainer.classList.remove('hidden');
                lyricsContainer.innerHTML = '<div class="lyrics-padding"></div>'; // Empty padding
                
                parsedLyrics.forEach((lyric, index) => {
                    const el = document.createElement('div');
                    el.className = 'lyric-line';
                    el.textContent = lyric.text;
                    lyricsContainer.appendChild(el);
                });
                
                lyricsContainer.innerHTML += '<div class="lyrics-padding"></div>';

                audioPlayer.addEventListener('timeupdate', () => {
                    const currentAbsoluteTime = audioPlayer.currentTime + startSec;
                    
                    let activeIndex = -1;
                    for (let i = 0; i < parsedLyrics.length; i++) {
                        if (currentAbsoluteTime >= parsedLyrics[i].time - 0.3) { // Slight lead time
                            activeIndex = i;
                        } else {
                            break;
                        }
                    }

                    const lines = lyricsContainer.querySelectorAll('.lyric-line');
                    lines.forEach((line, index) => {
                        if (index === activeIndex) {
                            if (!line.classList.contains('active')) {
                                line.classList.add('active');
                                const containerHeight = lyricsContainer.clientHeight;
                                const lineTop = line.offsetTop;
                                const lineHeight = line.clientHeight;
                                lyricsContainer.scrollTo({
                                    top: lineTop - (containerHeight / 2) + (lineHeight / 2),
                                    behavior: 'smooth'
                                });
                            }
                        } else {
                            line.classList.remove('active');
                        }
                    });
                });
            }

        } catch (error) {
            listenerTitle.textContent = "Snippet Not Found";
            listenerTimes.textContent = "The link might be invalid or expired.";
            audioPlayer.style.display = 'none';
            downloadBtn.style.display = 'none';
        }
    }
});
