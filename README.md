# ResumePulse 🚀

A secure, ATS-friendly resume builder web application with a beautiful black and navy theme.

## Features

- **Home Page** with animated floating feature cards and Get Started CTA
- **Privacy Policy** acceptance before form access
- **Multi-step Resume Form** with sections for:
  - Personal Information (Name, Email, Phone, LinkedIn)
  - Education (multiple entries supported)
  - Technical Skills
  - Projects (with GitHub/demo links)
  - Experience (optional)
  - Achievements (optional)
- **ATS-Friendly Indicator** showing resume format compatibility
- **Live Preview** with edit capability before submission
- **Loading State** during submission
- **Success Confirmation** page
- **Responsive Design** - Works on desktop and mobile

## Tech Stack

### Frontend
- HTML5, CSS3, Vanilla JavaScript (all bundled in `index.html`)
- Modern fonts: Inter
- Responsive design with CSS Grid/Flexbox
- XSS protection and input sanitization
- Animated floating cards with CSS animations

### Backend
- Node.js with Express
- Security: Helmet, CORS, Rate Limiting
- Input validation with express-validator
- XSS protection

### Data Storage
- In-memory storage (data resets on server restart)
- Optional: Email notifications via SMTP

## Project Structure

```
resumeplus/
├── index.html              # Main frontend (all-in-one HTML file)
├── server/
│   └── server.js           # Express backend API
├── package.json            # Node dependencies
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
├── logo.svg                # Logo asset
└── README.md               # This file
```

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/resumeplus.git
cd resumeplus
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment (Optional)

Copy `.env.example` to `.env` and configure email settings if you want email notifications:

```bash
cp .env.example .env
```

**For testing without email:** Leave SMTP and ADMIN_EMAIL fields blank.

**For Gmail (if you want email notifications):**
1. Enable 2-Factor Authentication
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Use that password in `SMTP_PASS`

### 4. Start the Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

### 5. Open the Application

Open `index.html` in a browser or use Live Server extension.

**Note:** The server must be running on port 3000 for form submissions to work.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/submit-resume` | Submit resume |
| GET | `/api/submissions` | List all submissions (testing) |

## GitHub Deployment Options

### Option 1: Deploy Frontend Only (GitHub Pages)

Since `index.html` is self-contained (HTML + CSS + JS bundled):

1. Push code to GitHub
2. Go to Repository Settings → Pages
3. Select source: "Deploy from a branch"
4. Choose branch: `main`, folder: `/ (root)`
5. Your site will be at `https://yourusername.github.io/resumeplus/`

**Note:** Form submissions won't work without a backend server.

### Option 2: Deploy Full Stack (Recommended)

#### Backend Deployment (Render/Railway)

1. **Create a new Web Service** on [Render](https://render.com) or [Railway](https://railway.app)
2. **Connect your GitHub repository**
3. **Configure Environment Variables** in the dashboard:
   ```
   PORT=3000
   NODE_ENV=production
   ADMIN_EMAIL=your-email@gmail.com
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_SECURE=false
   ```
4. **Start Command:** `node server/server.js`
5. **Get the deployed URL** (e.g., `https://resumeplus-api.onrender.com`)

#### Frontend Deployment (Netlify/Vercel)

1. **Update CORS** in `server/server.js` to allow your frontend domain:
   ```javascript
   corsOptions.origin = ['https://your-site.netlify.app', 'http://localhost:3000']
   ```

2. **Deploy `index.html` to Netlify/Vercel**

3. **Update API URL** in `index.html`:
   - Find: `http://localhost:3000/api/submit-resume`
   - Replace with: `https://resumeplus-api.onrender.com/api/submit-resume`

### Option 3: Single-Platform Deployment (Heroku)

```bash
# Install Heroku CLI and login
heroku login

# Create Heroku app
heroku create resumeplus-app

# Set environment variables
heroku config:set ADMIN_EMAIL=your-email@gmail.com
heroku config:set SMTP_HOST=smtp.gmail.com
heroku config:set SMTP_PORT=587
heroku config:set SMTP_USER=your-email@gmail.com
heroku config:set SMTP_PASS=your-app-password

# Deploy
git push heroku main
```

## Security Features

- Helmet.js for security headers
- CORS protection
- Rate limiting (10 requests per 15 minutes per IP)
- Input validation and sanitization
- XSS protection
- Environment variables for sensitive data
- Email validation
- Phone number validation

## Data Storage

This version uses **in-memory storage** for testing purposes:

- Data is stored in an array in the server's memory
- Data is lost when the server restarts
- No database setup required
- Submissions are logged to console

**To view submissions:**
- Check the server console for submission logs
- Or visit `GET http://localhost:3000/api/submissions`

## Customization

### Changing Colors
Edit CSS variables in `index.html`:
```css
:root {
    --accent-blue: #0066FF;
    --accent-blue-light: #3B82F6;
    /* ... */
}
```

### Adding Database
Replace in-memory storage with MongoDB/PostgreSQL in `server/server.js`:
1. Install database driver: `npm install mongodb`
2. Replace `resumeSubmissions.push()` with database insert

## License

MIT License - Created by Sampath

## Support

For issues or questions, please contact the admin email configured in your `.env` file.
