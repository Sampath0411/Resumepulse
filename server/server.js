const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const xss = require('xss');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Table name for resume submissions
const SUBMISSIONS_TABLE = 'resume_submissions';

// In-memory storage fallback (if Supabase not configured)
const resumeSubmissions = [];

// Generate CSP nonce per request
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});

// Security Middleware - Enhanced Helmet configuration
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: {
        features: {
            geolocation: ["'none'"],
            microphone: ["'none'"],
            camera: ["'none'"],
            notifications: ["'none'"],
        },
    },
}));

// CORS - Allow all origins in development
const corsOptions = {
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        callback(null, true); // Allow all origins in development
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate Limiting - Stricter for production
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        // Use a combination of IP and User-Agent for better tracking
        return req.ip || req.connection.remoteAddress;
    }
});

// Stricter rate limit for submissions
const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 submissions per hour
    message: { error: 'Submission limit reached. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);
app.use('/api/submit-resume', submitLimiter);

// Body parsing with size limits and validation
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch(e) {
            res.status(400).json({ error: 'Invalid JSON payload' });
            throw new Error('Invalid JSON');
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Additional security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
});

// Serve index.html for root route with CSP nonce injected (must be before static)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace('<script>', `<script nonce="${res.locals.nonce}">`);
    res.send(html);
});

// Serve static files from root directory
app.use(express.static('./'));

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: true,
    },
});

// Verify email configuration on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('SMTP Configuration Error:', error);
        console.log('Email notifications will be disabled.');
    } else {
        console.log('SMTP Server is ready to send emails');
    }
});

// Validation Rules
const validateResume = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
        .matches(/^[\p{L}\s\-\.']+$/u).withMessage('Name contains invalid characters')
        .customSanitizer(value => xss(value)),

    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format')
        .normalizeEmail()
        .isLength({ max: 100 }).withMessage('Email too long')
        .customSanitizer(value => xss(value)),

    body('phone')
        .trim()
        .notEmpty().withMessage('Phone is required')
        .matches(/^[\d\s\+\-\(\)]{10,20}$/).withMessage('Invalid phone number')
        .isLength({ max: 20 }).withMessage('Phone number too long')
        .customSanitizer(value => xss(value)),

    body('linkedin')
        .optional({ checkFalsy: true })
        .trim()
        .isURL().withMessage('Invalid LinkedIn URL')
        .isLength({ max: 200 }).withMessage('LinkedIn URL too long')
        .customSanitizer(value => xss(value)),

    body('education')
        .optional()
        .isLength({ max: 5000 }).withMessage('Education data too long')
        .customSanitizer(value => xss(value)),

    body('skills')
        .trim()
        .notEmpty().withMessage('Skills are required')
        .isLength({ max: 500 }).withMessage('Skills too long')
        .customSanitizer(value => xss(value)),

    body('projects')
        .optional()
        .isLength({ max: 10000 }).withMessage('Projects data too long')
        .customSanitizer(value => xss(value)),

    body('experience')
        .optional()
        .isLength({ max: 10000 }).withMessage('Experience data too long')
        .customSanitizer(value => xss(value)),

    body('achievements')
        .optional({ checkFalsy: true })
        .isLength({ max: 1000 }).withMessage('Achievements too long')
        .customSanitizer(value => xss(value)),

    body('timestamp')
        .optional()
        .isISO8601().withMessage('Invalid timestamp'),
];

// Helper Functions
function sanitizeJsonString(str) {
    try {
        const parsed = JSON.parse(str);
        return JSON.stringify(parsed);
    } catch {
        return '[]';
    }
}

async function sendAdminEmail(data) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        console.error('ADMIN_EMAIL not configured');
        return false;
    }

    const skillsList = data.skills.split(',').map(s => s.trim()).filter(s => s);
    let educationList = [];
    let projectsList = [];
    let experienceList = [];

    try {
        educationList = JSON.parse(data.education || '[]');
    } catch { educationList = []; }

    try {
        projectsList = JSON.parse(data.projects || '[]');
    } catch { projectsList = []; }

    try {
        experienceList = JSON.parse(data.experience || '[]');
    } catch { experienceList = []; }

    const achievementsList = data.achievements ? data.achievements.split('\n').filter(a => a.trim()) : [];

    const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
            .header { background: #1e3a5f; color: white; padding: 20px; text-align: center; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; }
            .section h2 { color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }
            .field { margin: 10px 0; }
            .label { font-weight: bold; color: #555; }
            .value { margin-left: 10px; }
            .item { background: white; padding: 10px; margin: 10px 0; border-left: 4px solid #3b82f6; border-radius: 4px; }
            .skills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
            .skill-tag { background: #e5e7eb; padding: 5px 12px; border-radius: 20px; font-size: 14px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>New Resume Submission</h1>
            <p>ResumePulse - ${new Date(data.timestamp).toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>Personal Information</h2>
            <div class="field"><span class="label">Full Name:</span><span class="value">${data.name}</span></div>
            <div class="field"><span class="label">Email:</span><span class="value">${data.email}</span></div>
            <div class="field"><span class="label">Phone:</span><span class="value">${data.phone}</span></div>
            ${data.linkedin ? `<div class="field"><span class="label">LinkedIn:</span><span class="value"><a href="${data.linkedin}">${data.linkedin}</a></span></div>` : ''}
        </div>

        ${educationList.length > 0 ? `
        <div class="section">
            <h2>Education</h2>
            ${educationList.map(edu => `
                <div class="item">
                    <strong>${edu.institution}</strong><br>
                    ${edu.degree}${edu.field ? ` in ${edu.field}` : ''}
                    ${edu.year ? ` (${edu.year})` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="section">
            <h2>Technical Skills</h2>
            <div class="skills">
                ${skillsList.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
            </div>
        </div>

        ${projectsList.length > 0 ? `
        <div class="section">
            <h2>Projects</h2>
            ${projectsList.map(proj => `
                <div class="item">
                    <strong>${proj.name}</strong>
                    ${proj.link ? `<br><a href="${proj.link}">${proj.link}</a>` : ''}
                    <p>${proj.description}</p>
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${experienceList.length > 0 ? `
        <div class="section">
            <h2>Experience</h2>
            ${experienceList.map(exp => `
                <div class="item">
                    <strong>${exp.position}</strong> at ${exp.company}
                    ${exp.duration ? `<br><em>${exp.duration}</em>` : ''}
                    ${exp.description ? `<p>${exp.description}</p>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}

        ${achievementsList.length > 0 ? `
        <div class="section">
            <h2>Achievements</h2>
            <ul>
                ${achievementsList.map(ach => `<li>${ach}</li>`).join('')}
            </ul>
        </div>
        ` : ''}

        <div class="footer">
            <p>This email was sent automatically from ResumePulse</p>
        </div>
    </body>
    </html>
    `;

    const mailOptions = {
        from: `"ResumePulse" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: `New Resume Submission: ${data.name}`,
        html: emailHTML,
        text: `
New Resume Submission

Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone}
${data.linkedin ? `LinkedIn: ${data.linkedin}` : ''}

Skills: ${skillsList.join(', ')}

This email was sent from ResumePulse.
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return true;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}

// Routes
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: 'no-database (in-memory only)',
        submissionsCount: resumeSubmissions.length
    });
});

// Get all submissions (for testing/verification)
app.get('/api/submissions', async (req, res) => {
    try {
        if (supabase) {
            // Use Supabase
            const { data, error } = await supabase
                .from(SUBMISSIONS_TABLE)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            res.json({
                count: data.length,
                submissions: data.map(sub => ({
                    id: sub.id,
                    name: sub.name,
                    email: sub.email,
                    timestamp: sub.created_at
                }))
            });
        } else {
            // Fallback to in-memory
            res.json({
                count: resumeSubmissions.length,
                submissions: resumeSubmissions.map((sub, index) => ({
                    id: index + 1,
                    name: sub.name,
                    email: sub.email,
                    timestamp: sub.timestamp
                }))
            });
        }
    } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Failed to fetch submissions' });
    }
});

app.post('/api/submit-resume', validateResume, async (req, res) => {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(e => ({
                field: e.path,
                message: e.msg
            }))
        });
    }

    const data = req.body;

    try {
        // Store in memory (no database)
        const submission = {
            id: resumeSubmissions.length + 1,
            name: data.name,
            email: data.email,
            phone: data.phone,
            linkedin: data.linkedin || null,
            education: sanitizeJsonString(data.education),
            skills: data.skills,
            projects: sanitizeJsonString(data.projects),
            experience: sanitizeJsonString(data.experience),
            achievements: data.achievements || null,
            timestamp: data.timestamp || new Date().toISOString(),
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        };

        resumeSubmissions.push(submission);

        console.log(`Resume submitted: ${data.name} (${data.email})`);
        console.log(`Total submissions in memory: ${resumeSubmissions.length}`);

        // Send email notification (optional)
        let emailSent = false;
        if (process.env.ADMIN_EMAIL && process.env.SMTP_USER) {
            emailSent = await sendAdminEmail(data);
        }

        res.status(201).json({
            success: true,
            message: 'Resume submitted successfully',
            id: submission.id,
            emailSent,
            note: 'Data stored in memory only (no database configured)'
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error Handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║           ResumePulse Server Running                    ║
║                                                        ║
║   Port: ${PORT.toString().padEnd(43)}║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(36)}║
║   Database: None (in-memory storage)                     ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
