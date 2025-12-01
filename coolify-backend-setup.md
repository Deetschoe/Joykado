# Coolify Backend Setup Guide

This guide explains how to set up a backend API on Coolify to automatically receive beatmaps and songs from your Joykado arcade machine.

## Prerequisites

- Coolify instance running
- Node.js or Python backend (examples provided for both)
- Database (PostgreSQL recommended, but SQLite works for small scale)

## Option 1: Node.js/Express Backend (Recommended)

### 1. Create Backend Project Structure

```
joykado-backend/
├── package.json
├── server.js
├── routes/
│   └── songs.js
├── models/
│   └── Song.js
├── uploads/
│   ├── songs/
│   │   ├── HipHop/
│   │   ├── Anime/
│   │   ├── JPOP/
│   │   ├── Rock/
│   │   └── Misc/
│   └── beatmaps/
└── .env
```

### 2. Install Dependencies

```bash
npm init -y
npm install express multer cors dotenv pg
# or for SQLite:
npm install express multer cors dotenv sqlite3
```

### 3. Create `server.js`

```javascript
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure upload directories exist
const categories = ['HipHop', 'Anime', 'JPOP', 'Rock', 'Misc'];
categories.forEach(cat => {
    const songDir = path.join(__dirname, 'uploads', 'songs', cat);
    const beatmapDir = path.join(__dirname, 'uploads', 'beatmaps', cat);
    if (!fs.existsSync(songDir)) fs.mkdirSync(songDir, { recursive: true });
    if (!fs.existsSync(beatmapDir)) fs.mkdirSync(beatmapDir, { recursive: true });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = req.body.category || 'Misc';
        if (file.fieldname === 'mp3') {
            cb(null, path.join(__dirname, 'uploads', 'songs', category));
        } else {
            cb(null, path.join(__dirname, 'uploads', 'beatmaps', category));
        }
    },
    filename: (req, file, cb) => {
        const sanitizedName = req.body.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (file.fieldname === 'mp3') {
            cb(null, `${sanitizedName}.mp3`);
        } else {
            cb(null, `${sanitizedName}_beatmap.json`);
        }
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Database setup (using SQLite for simplicity, replace with PostgreSQL if needed)
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('joykado.db');

// Initialize database
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty TEXT DEFAULT 'Medium',
        mp3_path TEXT NOT NULL,
        beatmap_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Routes
app.post('/api/songs/upload', upload.fields([
    { name: 'mp3', maxCount: 1 },
    { name: 'beatmap', maxCount: 1 }
]), async (req, res) => {
    try {
        const { name, category, difficulty } = req.body;
        
        if (!name || !category) {
            return res.status(400).json({ error: 'Name and category are required' });
        }
        
        if (!req.files || !req.files.mp3) {
            return res.status(400).json({ error: 'MP3 file is required' });
        }
        
        const mp3File = req.files.mp3[0];
        const beatmapFile = req.files.beatmap ? req.files.beatmap[0] : null;
        
        // Save beatmap JSON if provided
        let beatmapPath = null;
        if (beatmapFile) {
            beatmapPath = beatmapFile.path;
        } else if (req.body.beatmap) {
            // Beatmap sent as JSON string in form data
            const beatmapData = JSON.parse(req.body.beatmap);
            const beatmapPath = path.join(
                __dirname, 
                'uploads', 
                'beatmaps', 
                category, 
                `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}_beatmap.json`
            );
            fs.writeFileSync(beatmapPath, JSON.stringify(beatmapData, null, 2));
        }
        
        // Save to database
        const stmt = db.prepare(`INSERT INTO songs (name, category, difficulty, mp3_path, beatmap_path) 
                                 VALUES (?, ?, ?, ?, ?)`);
        stmt.run(name, category, difficulty || 'Medium', mp3File.path, beatmapPath, (err) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to save to database' });
            }
            
            res.json({ 
                success: true, 
                message: 'Song uploaded successfully',
                song: {
                    id: this.lastID,
                    name,
                    category,
                    difficulty,
                    mp3_path: mp3File.path,
                    beatmap_path: beatmapPath
                }
            });
        });
        stmt.finalize();
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get songs by category
app.get('/api/songs', (req, res) => {
    const { category } = req.query;
    
    let query = 'SELECT * FROM songs';
    let params = [];
    
    if (category) {
        query += ' WHERE category = ?';
        params.push(category);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Convert file paths to URLs
        const songs = rows.map(song => ({
            id: song.id,
            name: song.name,
            category: song.category,
            difficulty: song.difficulty,
            mp3_url: `/uploads/songs/${song.category}/${path.basename(song.mp3_path)}`,
            beatmap_url: song.beatmap_path ? `/uploads/beatmaps/${song.category}/${path.basename(song.beatmap_path)}` : null,
            created_at: song.created_at
        }));
        
        res.json(songs);
    });
});

// Get single song
app.get('/api/songs/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM songs WHERE id = ?', [id], (err, song) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }
        
        res.json({
            id: song.id,
            name: song.name,
            category: song.category,
            difficulty: song.difficulty,
            mp3_url: `/uploads/songs/${song.category}/${path.basename(song.mp3_path)}`,
            beatmap_url: song.beatmap_path ? `/uploads/beatmaps/${song.category}/${path.basename(song.beatmap_path)}` : null
        });
    });
});

app.listen(PORT, () => {
    console.log(`Joykado API server running on port ${PORT}`);
    console.log(`Upload endpoint: http://localhost:${PORT}/api/songs/upload`);
});
```

### 4. Create `.env` file

```
PORT=3000
NODE_ENV=production
```

### 5. Deploy to Coolify

1. Create a new application in Coolify
2. Connect your Git repository or upload the backend folder
3. Set environment variables in Coolify dashboard
4. Deploy!

## Option 2: Python/Flask Backend

### 1. Install Dependencies

```bash
pip install flask flask-cors python-dotenv
# For PostgreSQL:
pip install psycopg2-binary
# For SQLite (built-in):
# No additional package needed
```

### 2. Create `app.py`

```python
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import os
import json
from datetime import datetime
import sqlite3

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp3', 'json'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Ensure directories exist
categories = ['HipHop', 'Anime', 'JPOP', 'Rock', 'Misc']
for cat in categories:
    os.makedirs(f'{UPLOAD_FOLDER}/songs/{cat}', exist_ok=True)
    os.makedirs(f'{UPLOAD_FOLDER}/beatmaps/{cat}', exist_ok=True)

# Database setup
def init_db():
    conn = sqlite3.connect('joykado.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS songs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL,
                  category TEXT NOT NULL,
                  difficulty TEXT DEFAULT 'Medium',
                  mp3_path TEXT NOT NULL,
                  beatmap_path TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

init_db()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/api/songs/upload', methods=['POST'])
def upload_song():
    try:
        if 'mp3' not in request.files:
            return jsonify({'error': 'MP3 file is required'}), 400
        
        mp3_file = request.files['mp3']
        name = request.form.get('name')
        category = request.form.get('category', 'Misc')
        difficulty = request.form.get('difficulty', 'Medium')
        
        if not name:
            return jsonify({'error': 'Song name is required'}), 400
        
        if mp3_file and allowed_file(mp3_file.filename):
            # Save MP3
            sanitized_name = secure_filename(name).replace(' ', '_')
            mp3_filename = f'{sanitized_name}.mp3'
            mp3_path = os.path.join(UPLOAD_FOLDER, 'songs', category, mp3_filename)
            mp3_file.save(mp3_path)
            
            # Save beatmap if provided
            beatmap_path = None
            if 'beatmap' in request.form:
                beatmap_data = json.loads(request.form['beatmap'])
                beatmap_filename = f'{sanitized_name}_beatmap.json'
                beatmap_path = os.path.join(UPLOAD_FOLDER, 'beatmaps', category, beatmap_filename)
                with open(beatmap_path, 'w') as f:
                    json.dump(beatmap_data, f, indent=2)
            
            # Save to database
            conn = sqlite3.connect('joykado.db')
            c = conn.cursor()
            c.execute('''INSERT INTO songs (name, category, difficulty, mp3_path, beatmap_path)
                         VALUES (?, ?, ?, ?, ?)''',
                      (name, category, difficulty, mp3_path, beatmap_path))
            song_id = c.lastrowid
            conn.commit()
            conn.close()
            
            return jsonify({
                'success': True,
                'message': 'Song uploaded successfully',
                'song': {
                    'id': song_id,
                    'name': name,
                    'category': category,
                    'difficulty': difficulty
                }
            }), 200
        
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/songs', methods=['GET'])
def get_songs():
    category = request.args.get('category')
    
    conn = sqlite3.connect('joykado.db')
    c = conn.cursor()
    
    if category:
        c.execute('SELECT * FROM songs WHERE category = ? ORDER BY created_at DESC', (category,))
    else:
        c.execute('SELECT * FROM songs ORDER BY created_at DESC')
    
    songs = c.fetchall()
    conn.close()
    
    result = []
    for song in songs:
        result.append({
            'id': song[0],
            'name': song[1],
            'category': song[2],
            'difficulty': song[3],
            'mp3_url': f'/uploads/songs/{song[2]}/{os.path.basename(song[4])}',
            'beatmap_url': f'/uploads/beatmaps/{song[2]}/{os.path.basename(song[5])}' if song[5] else None
        })
    
    return jsonify(result)

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
```

## Configuration in beatkami.html

Update the `COOLIFY_API_URL` constant in `beatkami.html`:

```javascript
// Change this to your Coolify backend URL
const COOLIFY_API_URL = 'https://your-app.coolify.io'; // Your Coolify app URL
// Or if running locally:
// const COOLIFY_API_URL = 'http://your-pi-ip:3000';
```

## Testing

1. Start your backend server
2. Create a beatmap in the game
3. When you finish, it should automatically upload to Coolify
4. Check the `uploads/songs/{category}/` folder for the MP3
5. Check the `uploads/beatmaps/{category}/` folder for the JSON

## Troubleshooting

- **CORS errors**: Make sure CORS is enabled in your backend
- **Upload fails**: Check file size limits (default 50MB)
- **Database errors**: Ensure database file is writable
- **Network errors**: Verify the API URL is correct and accessible from your Pi

## Security Notes

- Add authentication if exposing to the internet
- Validate file types and sizes
- Sanitize filenames to prevent path traversal
- Use HTTPS in production
- Consider rate limiting for uploads

