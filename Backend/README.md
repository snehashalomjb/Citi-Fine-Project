# 🛡️ Cityfine - AI Traffic Violation Detection System

Cityfine is a full-stack web application that uses Artificial Intelligence to automatically detect traffic violations from images and videos. It empowers citizens to report violations like helmetless riding, triple riding, and overspeeding, complete with GPS tracking and an automated trust-score verification system.

---

## 🚀 Features

* **AI-Powered Detection:** Automatically identifies:
    * Helmetless Riding (Single/Double/Triple)
    * Triple Riding
    * Overloaded Vehicles
* **Automatic Number Plate Recognition (ANPR):** Reads Indian number plates and corrects common OCR errors (e.g., 'O' -> '0').
* **Smart Evidence Collection:**
    * Crops the **Number Plate** for clarity.
    * Crops the **Rider's Face** for identification.
* **Trust Score System:** Auto-approves reports from high-trust users (Score > 85) and flags others for manual review.
* **Real-Time GPS Tracking:** Captures the exact latitude and longitude of the violation.
* **Live Camera Support:** Record violations directly from the browser.
* **Reward System:** Users earn points and cash rewards for verified reports.

---

## 🛠️ Tech Stack

### **Frontend**
* **React.js (Vite):** Fast, modern UI.
* **CSS3:** Custom styling for a clean, responsive dashboard.
* **Axios:** API communication.

### **Backend**
* **Node.js & Express:** REST API server.
* **MongoDB (Mongoose):** Database for storing violations, user stats, and metadata.
* **Multer:** Handling file uploads.

### **AI Engine**
* **Python:** Core AI logic.
* **YOLOv8:** Object detection (Person, Motorcycle).
* **EasyOCR:** Optical Character Recognition for number plates.
* **OpenCV:** Image processing (cropping, resizing).

---

## 📋 Prerequisites

Before running the project, ensure you have the following installed:

1.  **Node.js** (v14 or higher)
2.  **Python** (v3.8 or higher)
3.  **MongoDB** (Local or Atlas URL)

---

## ⚙️ Installation & Setup

### 1. Clone the Repository
```bash
git clone [https://github.com/yourusername/cityfine.git](https://github.com/yourusername/cityfine.git)
cd cityfine

2. Backend Setup
Navigate to the backend folder and install dependencies.

cd Backend
npm install

Install Python Dependencies: Make sure you are in the Backend directory.
pip install opencv-python numpy easyocr ultralytics

Create Uploads Folder:
mkdir uploads

3. Frontend Setup
Navigate to the frontend folder and install dependencies.
cd ../Frontend
npm install

🏃‍♂️ Running the Application
You need to run the Backend and Frontend in two separate terminals.

Terminal 1: Start Backend
cd Backend
node server.js
You should see: ✅ MongoDB Connected and Backend running on port 5000.

Terminal 2: Start Frontend
cd Frontend
npm run dev
Open the link provided (usually http://localhost:5173) in your browser.

Cityfine/
├── Backend/
│   ├── uploads/             # Stores uploaded/cropped images
│   ├── ai_engine.py         # Python AI Script (YOLO + OCR)
│   ├── best.pt              # Custom YOLO model (Optional)
│   ├── server.js            # Node.js Express Server
│   └── package.json
│
├── Frontend/
│   ├── src/
│   │   ├── App.jsx          # Main React Component
│   │   ├── App.css          # Styling
│   │   └── main.jsx
│   └── package.json
│
└── README.md


🔌 API Endpoints

Method,Endpoint,Description
POST,/detect,"Uploads media, runs AI analysis, returns preview data (No DB save)."
POST,/api/submit-report,Saves the violation to MongoDB with Trust Score logic.
GET,/api/complaints,Fetches all submitted violation reports.
GET,/api/dashboard-stats,"Returns stats (Approved/Pending counts, Rewards)."

🛡️ License
This project is licensed under the MIT License.