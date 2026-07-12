import os
import uuid
import re
import urllib.request
import urllib.parse
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp
import imageio_ffmpeg

import imageio_ffmpeg
import shutil

# Use system ffmpeg if available (e.g. on Render), otherwise fallback to imageio_ffmpeg
if shutil.which("ffmpeg"):
    FFMPEG_PATH = "ffmpeg"
else:
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()

app = FastAPI()

# Setup directories
SNIPPETS_DIR = "snippets"
os.makedirs(SNIPPETS_DIR, exist_ok=True)
DB_FILE = "database.json"

# Initialize tiny JSON DB
if not os.path.exists(DB_FILE):
    with open(DB_FILE, "w") as f:
        json.dump({}, f)

def get_db():
    with open(DB_FILE, "r") as f:
        return json.load(f)

def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=4)

def parse_time_to_seconds(time_str: str) -> int:
    try:
        parts = time_str.split(":")
        if len(parts) == 1:
            return int(parts[0])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except Exception:
        raise ValueError(f"Invalid time format: {time_str}")
    raise ValueError(f"Invalid time format: {time_str}")

def get_spotify_metadata(url: str):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        title_match = re.search(r'<title>(.*?)</title>', html)
        if title_match:
            title = title_match.group(1)
            # Example: "Never Gonna Give You Up - song and lyrics by Rick Astley | Spotify"
            if "song and lyrics by" in title:
                song_info = title.split("|")[0].strip()
                return song_info.replace("- song and lyrics by", "")
            elif "song by" in title:
                song_info = title.split("|")[0].strip()
                return song_info.replace("- song by", "")
            else:
                return title.split("|")[0].strip()
        return None
    except Exception as e:
        print(f"Spotify scrape error: {e}")
        return None

def search_lyrics(track_name: str):
    try:
        query = urllib.parse.quote(track_name)
        url = f"https://lrclib.net/api/search?q={query}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        response = urllib.request.urlopen(req, timeout=5)
        data = json.loads(response.read().decode('utf-8'))
        if data:
            # Prefer synced lyrics
            for track in data:
                if track.get('syncedLyrics'):
                    return track['syncedLyrics']
            # Fallback to plain lyrics if absolutely necessary, but synced is preferred
            return data[0].get('plainLyrics')
    except Exception as e:
        print(f"Lyrics fetch error: {e}")
    return None

class SnippetRequest(BaseModel):
    url: str
    start_time: str
    end_time: str

@app.post("/api/create")
def create_snippet(req: SnippetRequest):
    try:
        start_sec = parse_time_to_seconds(req.start_time)
        end_sec = parse_time_to_seconds(req.end_time)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    if start_sec >= end_sec:
        raise HTTPException(status_code=400, detail="Start time must be before end time")

    url = req.url
    song_title = "Unknown Audio"

    # Handle Spotify
    if "spotify.com" in url:
        meta = get_spotify_metadata(url)
        if meta:
            song_title = meta
            search_query = meta
        else:
            raise HTTPException(status_code=400, detail="Could not extract Spotify metadata")
    else:
        # We can extract title directly with yt_dlp for soundcloud/youtube
        ydl_opts = {
            'quiet': True, 
            'skip_download': True,
            'extractor_args': {'youtube': {'player_client': ['android']}}
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if 'entries' in info: # if it's a playlist or search
                    info = info['entries'][0]
                song_title = info.get('title', 'Unknown Audio')
        except Exception:
            pass # Keep default

    snippet_id = str(uuid.uuid4())[:8]
    output_filename = os.path.join(SNIPPETS_DIR, f"{snippet_id}.mp3")

    stream_url = None
    try:
        from pytubefix import YouTube, Search
        if "youtube.com" in url or "youtu.be" in url:
            yt = YouTube(url)
            song_title = yt.title
            stream_url = yt.streams.get_audio_only().url
        elif "spotify.com" in url:
            results = Search(search_query)
            if len(results.videos) > 0:
                yt = results.videos[0]
                # We keep the original Spotify title, but get the stream URL from YouTube
                stream_url = yt.streams.get_audio_only().url
            else:
                raise Exception("Song not found")
        else:
            # Fallback to yt-dlp for soundcloud etc
            ydl_opts = {
                'format': 'bestaudio/best',
                'quiet': True,
                'no_warnings': True,
                'extractor_args': {'youtube': {'player_client': ['android']}}
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if 'entries' in info:
                    info = info['entries'][0]
                stream_url = info['url']
                song_title = info.get('title', song_title)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch audio stream: {str(e)}")

    try:
            
        import subprocess
        # Slice audio using ffmpeg directly
        cmd = [
            FFMPEG_PATH,
            '-y', # overwrite
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', # Bypass 403 blocks
            '-ss', str(start_sec),
            '-i', stream_url,
            '-t', str(end_sec - start_sec),
            '-vn', # no video
            '-c:a', 'libmp3lame',
            '-b:a', '320k', # maximum mp3 quality
            output_filename
        ]
        
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print("FFMPEG ERROR:", result.stderr.decode())
            raise Exception("FFMPEG processing failed")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

    # Fetch Lyrics
    lyrics = search_lyrics(song_title)

    # Save to DB
    db = get_db()
    db[snippet_id] = {
        "title": song_title,
        "original_url": req.url,
        "start_time": req.start_time,
        "end_time": req.end_time,
        "lyrics": lyrics
    }
    save_db(db)

    return {"id": snippet_id, "title": song_title}

@app.get("/api/snippet/{snippet_id}")
def get_snippet_info(snippet_id: str):
    db = get_db()
    if snippet_id not in db:
        raise HTTPException(status_code=404, detail="Snippet not found")
    return db[snippet_id]

# Mount static files and snippets directory
app.mount("/audio", StaticFiles(directory=SNIPPETS_DIR), name="audio")
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
