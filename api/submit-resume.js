const { body, validationResult } = require('express-validator');
const xss = require('xss');
const nodemailer = require('nodemailer');

// In-memory storage for serverless function (resets on cold start)
const resumeSubmissions = [];

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
        .matches(/^[\d\s\+\-\(\)\.]{7,30}$/).withMessage('Invalid phone number format')
        .isLength({ max: 30 }).withMessage('Phone number too long')
        .customSanitizer(value => xss(value)),

    body('linkedin')
        .optional({ checkFalsy: true })
        .trim()
        .isURL().withMessage('Invalid LinkedIn URL')
        .isLength({ max: 200 }).withMessage('LinkedIn URL too long')
        .customSanitizer(value => xss(value)),

    body('education')
        .optional({ checkFalsy: true })
        .isLength({ max: 5000 }).withMessage('Education data too long')
        .customSanitizer(value => xss(value)),

    body('skills')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 2000 }).withMessage('Skills too long')
        .customSanitizer(value => xss(value)),

    body('projects')
        .optional({ checkFalsy: true })
        .isLength({ max: 5000 }).withMessage('Projects data too long')
        .customSanitizer(value => xss(value)),

    body('experience')
        .optional({ checkFalsy: true })
        .isLength({ max: 5000 }).withMessage('Experience data too long')
        .customSanitizer(value => xss(value)),

    body('achievements')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 2000 }).withMessage('Achievements too long')
        .customSanitizer(value => xss(value)),
];

function sanitizeJsonString(str) {
    if (!str || typeof str !== 'string') return null;
    try {
        const parsed = JSON.parse(str);
        return JSON.stringify(parsed);
    } catch (e) {
        return xss(str);
    }
}

async function sendAdminEmail(data) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.ADMIN_EMAIL) {
        return false;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: `"ResumePulse" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `New Resume Submission: ${data.name}`,
            html: `
                <h2>New Resume Submission</h2>
                <p><strong>Name:</strong> ${data.name}</p>
                <p><strong>Email:</strong> ${data.email}</p>
                <p><strong>Phone:</strong> ${data.phone}</p>
                <p><strong>LinkedIn:</strong> ${data.linkedin || 'N/A'}</p>
                <p><strong>Timestamp:</strong> ${data.timestamp}</p>
            `,
        });
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
}

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        // Run validation manually (without Express middleware chain)
        const validations = validateResume.map(validation => validation.run(req));
        await Promise.all(validations);

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                error: 'Validation failed',
                details: errors.array().map(e => ({
                    field: e.path,
                    message: e.msg
                }))
            });
            return;
        }

        const data = req.body;

        // Store in memory
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
            ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
            user_agent: req.headers['user-agent'] || null
        };

        resumeSubmissions.push(submission);

        console.log(`Resume submitted: ${data.name} (${data.email})`);

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
            note: 'Data stored in memory only (serverless function)'
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
