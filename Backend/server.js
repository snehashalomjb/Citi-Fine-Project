const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// --- CONNECT TO DATABASE ---
mongoose.connect('mongodb://127.0.0.1:27017/cityfine')
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

// --- DEFINE SCHEMA ---
const violationSchema = new mongoose.Schema({
    type: [String],
    plate: String,
    image: String,
    plate_image: String,
    face_image: String,
    fine: Number,               // This stores the Challan Amount
    reward_points: { type: Number, default: 0 }, // <--- ADDED: Stores Reward Points
    status: { type: String, default: 'Under Review' },
    trust_score: Number,
    date: String,
    location: String,
    createdAt: { type: Date, default: Date.now }
});

const Violation = mongoose.model('Violation', violationSchema);

// --- FILE STORAGE SETUP ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- ROUTE 1: UPLOAD & DETECT ---
app.post('/detect', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    // 1. HARDCODE LOCATION FOR DEMO (Fixes the 0.0, 0.0 issue)
    const lat = "26.9124"; 
    const long = "75.7873";

    // 2. SPAWN PYTHON PROCESS WITH COORDS
    const pythonProcess = spawn('python', ['ai_engine.py', req.file.path, lat, long]);
    
    let dataString = '';

    pythonProcess.stdout.on('data', (data) => { 
        dataString += data.toString(); 
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        try {
            console.log("Raw Python Output:", dataString); // Debug print

            const aiResult = JSON.parse(dataString);
            
            // Add full URLs to images
            if (aiResult.plate_image) aiResult.plate_image = `http://localhost:${PORT}/uploads/${aiResult.plate_image}`;
            if (aiResult.face_image) aiResult.face_image = `http://localhost:${PORT}/uploads/${aiResult.face_image}`;
            
            // Keep original path for saving later
            aiResult.original_image_path = req.file.path;
            
            res.json(aiResult);

        } catch (e) { 
            console.error("JSON Parse Error:", e);
            res.status(500).json({ error: "Analysis failed", details: dataString }); 
        }
    });
});

// --- ROUTE 2: SUBMIT REPORT TO DB ---
app.post('/api/submit-report', async (req, res) => {
    try {
        const data = req.body;
        
        // Logic to Auto-Approve high confidence
        let status = data.confidence > 85 && data.anpr_number !== "NOT DETECTED" ? "Approved" : "Under Review";
        
        // Clean up filenames
        const cleanPlateImg = data.plate_image ? data.plate_image.split('/').pop() : "";
        const cleanFaceImg = data.face_image ? data.face_image.split('/').pop() : "";
        
        // Handle original image path safely
        const cleanMainImg = data.original_image_path ? data.original_image_path.split(path.sep).pop() : "";

        const newViolation = new Violation({
            type: data.violations,
            plate: data.anpr_number || data.plate, // Handle both key names
            image: cleanMainImg,
            plate_image: cleanPlateImg,
            face_image: cleanFaceImg,
            
            // --- FIX IS HERE: READ 'challan' FROM PYTHON OUTPUT ---
            fine: data.challan || 0,  
            
            // --- ADDED: Save Reward Points ---
            reward_points: data.reward_points || 0,
            
            status: status,
            trust_score: data.confidence,
            
            // Ensure metadata exists before reading
            date: data.metadata ? data.metadata.date : new Date().toLocaleDateString(),
            location: data.metadata ? data.metadata.location : "Unknown"
        });

        await newViolation.save();
        res.json({ success: true, message: status === "Approved" ? "Challan Generated! (+Points Added)" : "Submitted for Review", status });
    } catch (err) { 
        console.error("Submission Error:", err);
        res.status(500).json({ error: "Submission Error" }); 
    }
});

// --- ROUTE 3: DASHBOARD STATS (Calculates Total Points for Dashboard) ---
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const allViolations = await Violation.find();
        
        // Calculate Totals
        const totalPoints = allViolations.reduce((sum, v) => sum + (v.reward_points || 0), 0);
        const approvedCount = allViolations.filter(v => v.status === 'Approved').length;
        const pendingCount = allViolations.filter(v => v.status === 'Under Review').length;
        
        // Calculate Cash Value (1 Point = ₹10 for example)
        const cashValue = totalPoints * 10; 

        // Average Trust Score
        const totalTrust = allViolations.reduce((sum, v) => sum + (v.trust_score || 0), 0);
        const avgTrust = allViolations.length > 0 ? Math.round(totalTrust / allViolations.length) : 85;

        res.json({
            points: totalPoints,
            cash: cashValue,
            approved: approvedCount,
            pending: pendingCount,
            trust_score: avgTrust
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ROUTE 4: GET COMPLAINTS ---
app.get('/api/complaints', async (req, res) => {
    try {
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations.map(v => ({
            violation_type: v.type.join(", "),
            plate: v.plate,
            media: `http://localhost:${PORT}/uploads/${v.image}`,
            status: v.status,
            fine_amount: v.fine,
            reward_points: v.reward_points, // Added to response
            datetime: v.date,
            location: v.location
        })));
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// --- ROUTE 5: CLAIM REWARD (Placeholder) ---
app.post('/api/claim-reward', async (req, res) => {
    try {
        // Here you would typically reset points or create a payout transaction
        res.json({ success: true, message: "Reward Claim Request Sent! Money will be credited in 24hrs." });
    } catch (err) {
        res.status(500).json({ error: "Claim Failed" });
    }
});

app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));