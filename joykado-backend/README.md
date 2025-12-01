# Joykado Backend API

Backend server for the Joykado arcade machine. Handles song and beatmap uploads, storage, and retrieval.

## Features

- Upload MP3 files and beatmap JSON files
- Organize songs by category (HipHop, Anime, JPOP, Rock, Misc)
- SQLite database for metadata storage
- RESTful API endpoints
- CORS enabled for frontend integration

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration (optional)

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Health Check
- `GET /health` - Check if server is running

### Upload Song
- `POST /api/songs/upload`
  - Form data:
    - `mp3`: MP3 audio file (required)
    - `beatmap`: JSON beatmap file (optional, can also be sent as JSON string)
    - `name`: Song name (required)
    - `category`: Category name (required: HipHop, Anime, JPOP, Rock, Misc)
    - `difficulty`: Difficulty level (optional: Easy, Medium, Hard)

### Get Songs
- `GET /api/songs` - Get all songs
- `GET /api/songs?category=HipHop` - Get songs by category
- `GET /api/songs/:id` - Get single song by ID

## File Structure

```
joykado-backend/
├── server.js           # Main server file
├── package.json        # Dependencies
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules
├── uploads/            # Uploaded files
│   ├── songs/          # MP3 files organized by category
│   └── beatmaps/      # JSON beatmap files organized by category
└── joykado.db         # SQLite database (created automatically)
```

## Deployment to Coolify

1. Push this directory to a GitHub repository
2. In Coolify, create a new application
3. Choose "Git Repository" and select your repository
4. Coolify will automatically detect Node.js from `package.json`
5. Set environment variables in Coolify dashboard (optional)
6. Deploy!

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Notes

- Files are stored in `uploads/` directory organized by category
- Database is SQLite (can be upgraded to PostgreSQL if needed)
- Maximum file size: 50MB
- CORS is enabled for all origins (restrict in production if needed)

