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

        } catch (error) {
            listenerTitle.textContent = "Snippet Not Found";
            listenerTimes.textContent = "The link might be invalid or expired.";
            audioPlayer.style.display = 'none';
            downloadBtn.style.display = 'none';
        }
    }
});
