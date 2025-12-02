const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*', // Allow all origins (restrict in production if needed)
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve config.js for frontend dynamically
app.get('/config.js', (req, res) => {
    // Generate config.js dynamically with the current server URL from environment
    // Use COOLIFY_URL if set, otherwise construct from request
    const configUrl = process.env.COOLIFY_URL || 
                     process.env.COOLIFY_FQDN ? `http://${process.env.COOLIFY_FQDN}` : 
                     `http://${req.get('host')}`;
    const configContent = `// Auto-generated config from backend
// This file is generated dynamically - do not edit manually
// Set COOLIFY_URL environment variable in Coolify to customize
window.JOYKADO_CONFIG = {
    COOLIFY_API_URL: '${configUrl}'
};`;
    res.setHeader('Content-Type', 'application/javascript');
    res.send(configContent);
});

// Ensure upload directories exist
const categories = ['HipHop', 'Anime', 'JPOP', 'Rock', 'Misc'];
categories.forEach(cat => {
    const songDir = path.join(__dirname, 'uploads', 'songs', cat);
    const beatmapDir = path.join(__dirname, 'uploads', 'beatmaps', cat);
    if (!fs.existsSync(songDir)) {
        fs.mkdirSync(songDir, { recursive: true });
        console.log(`Created directory: ${songDir}`);
    }
    if (!fs.existsSync(beatmapDir)) {
        fs.mkdirSync(beatmapDir, { recursive: true });
        console.log(`Created directory: ${beatmapDir}`);
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = req.body.category || 'Misc';
        if (file.fieldname === 'mp3') {
            const dest = path.join(__dirname, 'uploads', 'songs', category);
            // Ensure directory exists
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
                console.log(`📁 Created MP3 directory: ${dest}`);
            }
            console.log(`📁 MP3 destination: ${dest}`);
            cb(null, dest);
        } else {
            const dest = path.join(__dirname, 'uploads', 'beatmaps', category);
            // Ensure directory exists
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
                console.log(`📁 Created beatmap directory: ${dest}`);
            }
            console.log(`📁 Beatmap destination: ${dest}`);
            cb(null, dest);
        }
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 9); // Short random ID
        
        if (file.fieldname === 'mp3') {
            let filename;
            
            // Use original filename if available, extract first 5 words
            if (req.body.original_filename) {
                const originalName = req.body.original_filename;
                // Remove extension
                const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
                // Get first 5 words
                const words = nameWithoutExt.split(/[\s_-]+/).slice(0, 5);
                const firstWords = words.join('_');
                // Sanitize and add extension
                const sanitized = firstWords.replace(/[^a-zA-Z0-9_-]/g, '_');
                filename = `${sanitized}.mp3`;
            } else {
                // Fallback to song name
                const sanitizedName = (req.body.name || 'song').replace(/[^a-zA-Z0-9_-]/g, '_');
                filename = `${sanitizedName}.mp3`;
            }
            
            console.log(`📝 MP3 filename: ${filename} (from: ${req.body.original_filename || 'song name'})`);
            cb(null, filename);
        } else {
            // Unique beatmap filename: songname_timestamp_randomid_beatmap.json
            const sanitizedName = (req.body.name || 'song').replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `${sanitizedName}_${timestamp}_${randomId}_beatmap.json`;
            console.log(`📝 Beatmap filename: ${filename}`);
            cb(null, filename);
        }
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Database setup (using SQLite for simplicity)
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'joykado.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

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
    )`, (err) => {
        if (err) {
            console.error('Error creating songs table:', err);
        } else {
            console.log('Songs table ready');
        }
    });
    
    db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT NOT NULL,
        song_name TEXT NOT NULL,
        song_category TEXT NOT NULL,
        score INTEGER NOT NULL,
        combo INTEGER DEFAULT 0,
        accuracy REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating leaderboard table:', err);
        } else {
            console.log('Leaderboard table ready');
        }
    });
    
    // Create indexes for faster queries
    db.run(`CREATE INDEX IF NOT EXISTS idx_leaderboard_song ON leaderboard(song_name, song_category)`, (err) => {
        if (err) console.error('Error creating index:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)`, (err) => {
        if (err) console.error('Error creating index:', err);
    });
});

// Upload endpoint
app.post('/api/songs/upload', upload.fields([
    { name: 'mp3', maxCount: 1 },
    { name: 'beatmap', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('📥 Upload request received');
        console.log('📋 Body:', req.body);
        console.log('📁 Files:', req.files ? Object.keys(req.files) : 'No files');
        
        const { name, category, difficulty } = req.body;
        
        if (!name || !category) {
            console.error('❌ Missing name or category');
            return res.status(400).json({ error: 'Name and category are required' });
        }
        
        if (!req.files || !req.files.mp3 || !req.files.mp3[0]) {
            console.error('❌ MP3 file missing. Files received:', req.files);
            return res.status(400).json({ error: 'MP3 file is required' });
        }
        
        const mp3File = req.files.mp3[0];
        console.log('✅ MP3 file received:', {
            originalname: mp3File.originalname,
            filename: mp3File.filename,
            path: mp3File.path,
            size: mp3File.size,
            mimetype: mp3File.mimetype
        });
        
        // Verify the file was actually written to disk
        if (!fs.existsSync(mp3File.path)) {
            console.error('❌ CRITICAL: MP3 file path does not exist:', mp3File.path);
            return res.status(500).json({ error: 'MP3 file was not saved to disk' });
        }
        
        const fileStats = fs.statSync(mp3File.path);
        console.log('✅ MP3 file verified on disk:', {
            path: mp3File.path,
            size: fileStats.size,
            created: fileStats.birthtime
        });
        
        let beatmapPath = null;
        
        // Handle beatmap if provided
        if (req.files.beatmap && req.files.beatmap[0]) {
            beatmapPath = req.files.beatmap[0].path;
        } else if (req.body.beatmap) {
            // Beatmap sent as JSON string in form data
            try {
                const beatmapData = typeof req.body.beatmap === 'string' 
                    ? JSON.parse(req.body.beatmap) 
                    : req.body.beatmap;
                
                const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 9); // Short random ID
                // Unique beatmap filename: songname_timestamp_randomid_beatmap.json
                beatmapPath = path.join(
                    __dirname, 
                    'uploads', 
                    'beatmaps', 
                    category, 
                    `${sanitizedName}_${timestamp}_${randomId}_beatmap.json`
                );
                
                fs.writeFileSync(beatmapPath, JSON.stringify(beatmapData, null, 2));
                console.log(`Saved beatmap to: ${beatmapPath}`);
            } catch (parseError) {
                console.error('Error parsing beatmap JSON:', parseError);
            }
        }
        
        // Save to database
        const stmt = db.prepare(`INSERT INTO songs (name, category, difficulty, mp3_path, beatmap_path) 
                                 VALUES (?, ?, ?, ?, ?)`);
        
        stmt.run(name, category, difficulty || 'Medium', mp3File.path, beatmapPath, function(err) {
            if (err) {
                console.error('❌ Database error:', err);
                return res.status(500).json({ error: 'Failed to save to database' });
            }
            
            // Verify file actually exists on disk
            if (fs.existsSync(mp3File.path)) {
                const stats = fs.statSync(mp3File.path);
                console.log('✅ MP3 file verified on disk:', {
                    path: mp3File.path,
                    size: stats.size,
                    exists: true
                });
            } else {
                console.error('❌ MP3 file NOT found on disk after upload:', mp3File.path);
            }
            
            console.log('✅ Song saved to database with ID:', this.lastID);
            
            res.json({ 
                success: true, 
                message: 'Song uploaded successfully',
                song: {
                    id: this.lastID,
                    name,
                    category,
                    difficulty: difficulty || 'Medium',
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
            console.error('Database query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Convert file paths to URLs
        const songs = rows.map(song => {
            const mp3Filename = path.basename(song.mp3_path);
            const beatmapFilename = song.beatmap_path ? path.basename(song.beatmap_path) : null;
            
            return {
                id: song.id,
                name: song.name,
                category: song.category,
                difficulty: song.difficulty,
                mp3_url: `/uploads/songs/${song.category}/${mp3Filename}`,
                beatmap_url: beatmapFilename ? `/uploads/beatmaps/${song.category}/${beatmapFilename}` : null,
                created_at: song.created_at
            };
        });
        
        res.json(songs);
    });
});

// Get single song by ID
app.get('/api/songs/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM songs WHERE id = ?', [id], (err, song) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }
        
        const mp3Filename = path.basename(song.mp3_path);
        const beatmapFilename = song.beatmap_path ? path.basename(song.beatmap_path) : null;
        
        res.json({
            id: song.id,
            name: song.name,
            category: song.category,
            difficulty: song.difficulty,
            mp3_url: `/uploads/songs/${song.category}/${mp3Filename}`,
            beatmap_url: beatmapFilename ? `/uploads/beatmaps/${song.category}/${beatmapFilename}` : null,
            created_at: song.created_at
        });
    });
});

// Submit score to leaderboard
app.post('/api/leaderboard', (req, res) => {
    try {
        const { player_name, song_name, song_category, score, combo, accuracy } = req.body;
        
        if (!player_name || !song_name || !song_category || score === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const stmt = db.prepare(`INSERT INTO leaderboard (player_name, song_name, song_category, score, combo, accuracy) 
                                 VALUES (?, ?, ?, ?, ?, ?)`);
        
        stmt.run(player_name, song_name, song_category, score, combo || 0, accuracy || 0, function(err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to save score' });
            }
            
            res.json({ 
                success: true, 
                message: 'Score saved successfully',
                id: this.lastID
            });
        });
        stmt.finalize();
    } catch (error) {
        console.error('Score submission error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
    const { song_name, song_category, limit } = req.query;
    
    let query = 'SELECT * FROM leaderboard';
    let params = [];
    
    if (song_name && song_category) {
        query += ' WHERE song_name = ? AND song_category = ?';
        params.push(song_name, song_category);
    } else if (song_category) {
        query += ' WHERE song_category = ?';
        params.push(song_category);
    }
    
    query += ' ORDER BY score DESC, combo DESC, accuracy DESC';
    
    const limitNum = parseInt(limit) || 50;
    query += ` LIMIT ${limitNum}`;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json(rows);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Joykado API is running',
        endpoints: {
            health: '/health',
            upload: '/api/songs/upload',
            getSongs: '/api/songs',
            getSongById: '/api/songs/:id'
        },
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Joykado API is running',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Joykado API server running on port ${PORT}`);
    console.log(`📤 Upload endpoint: http://localhost:${PORT}/api/songs/upload`);
    console.log(`📥 Get songs endpoint: http://localhost:${PORT}/api/songs`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 CORS enabled for all origins`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing database connection');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});

