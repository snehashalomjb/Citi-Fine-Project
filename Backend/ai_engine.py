import sys
import json
import traceback
import cv2
import easyocr
import numpy as np
import os
import uuid
import datetime
import math
import re
from ultralytics import YOLO

# GLOBAL ERROR HANDLER
def crash_handler(type, value, tb):
    print(json.dumps({"error": f"Script Crash: {str(value)}"}))
sys.excepthook = crash_handler

try:
    # --- LOAD MODELS ---
    violation_model = YOLO("yolov8n.pt") 
    reader = easyocr.Reader(['en'], gpu=False)

    plate_model_path = os.path.join(os.path.dirname(__file__), "best.pt")
    if os.path.exists(plate_model_path):
        plate_model = YOLO(plate_model_path)
        USING_CUSTOM_MODEL = True
    else:
        plate_model = None
        USING_CUSTOM_MODEL = False

    VALID_STATES = {"AP","AR","AS","BR","CG","GA","GJ","HR","HP","JK","JH","KA","KL",
                    "MP","MH","MN","ML","MZ","NL","OD","PB","RJ","SK","TN","TS","TR",
                    "UP","UK","WB","AN","CH","DN","DD","DL","LD","PY"}

    def apply_clahe(img):
        # Intelligent Contrast Enhancement
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        return clahe.apply(gray)

    def preprocess_plate_variants(img):
        """Generates multiple versions of the plate for better OCR chance"""
        h, w = img.shape[:2]
        variants = []
        
        # 1. Upscale if small (Super Resolution)
        if w < 250:
            scale = 400 / w
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        
        # Variant A: CLAHE Grayscale (Best for natural lighting)
        gray_clahe = apply_clahe(img)
        variants.append(gray_clahe)
        
        # Variant B: Binary Threshold (Best for high contrast)
        _, thresh = cv2.threshold(gray_clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(thresh)

        # Variant C: Denoised (Best for grainy far plates)
        denoised = cv2.fastNlMeansDenoising(gray_clahe, None, 10, 7, 21)
        variants.append(denoised)
        
        return variants

    def fix_common_ocr_errors(text):
        """Fixes common look-alike errors in specific positions"""
        # Dictionary of common digit confusions: { 'WrongChar': 'CorrectDigit' }
        digit_map = {'O': '0', 'Q': '0', 'D': '0', 'Z': '2', 'B': '8', 'S': '5', 'I': '1', 'L': '4'}
        
        # Dictionary of common letter confusions
        char_map = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '4': 'A'}
        
        clean = list(text)
        
        # HEURISTIC: Indian Plates usually follow LL NN LL NNNN (L=Letter, N=Number)
        # We can try to force this if the length is standard (10 chars)
        if len(clean) == 10:
            # First 2 should be Letters (State)
            if clean[0] in char_map: clean[0] = char_map[clean[0]]
            if clean[1] in char_map: clean[1] = char_map[clean[1]]
            
            # Next 2 should be Numbers (District)
            if clean[2] in digit_map: clean[2] = digit_map[clean[2]]
            if clean[3] in digit_map: clean[3] = digit_map[clean[3]]
            
            # Last 4 should be Numbers (Unique ID)
            for i in range(6, 10):
                if clean[i] in digit_map: clean[i] = digit_map[clean[i]]
                
        return "".join(clean)

    def force_indian_format(text):
        text = text.upper().replace("IND", "").replace("INC", "").replace("1NC", "").replace(".", "").replace(" ", "").replace("-","")
        clean = ''.join(c for c in text if c.isalnum())
        
        # Fix Typos BEFORE formatting
        clean = fix_common_ocr_errors(clean)

        if len(clean) > 10: clean = clean[:10]
        
        # Formatting
        if len(clean) == 10:
            return f"{clean[0:2]} {clean[2:4]} {clean[4:6]} {clean[6:10]}"
        elif len(clean) == 9:
            return f"{clean[0:2]} {clean[2:4]} {clean[4:5]} {clean[5:9]}"
        elif len(clean) == 8:
            return f"{clean[0:2]} {clean[2:4]} {clean[4:8]}"
        
        return clean

    def validate_indian_plate(text):
        clean = text.replace(" ", "")
        if len(clean) < 6: return False
        if clean[:2] not in VALID_STATES: return False
        if not clean[2].isdigit(): return False
        return True

    def smart_plate_reader(image):
        if image is None: return "NOT DETECTED", None
        h, w = image.shape[:2]
        candidates = []
        
        # 1. Zone Scan (Original + Zoomed)
        zones = [
            (0, 0, w, h), # Full
            (int(w*0.1), int(h*0.35), int(w*0.9), int(h*0.95)), # Mid Zoom
            (int(w*0.25), int(h*0.5), int(w*0.75), h) # Deep Zoom
        ]

        if USING_CUSTOM_MODEL:
            for (zx1, zy1, zx2, zy2) in zones:
                zone_img = image[zy1:zy2, zx1:zx2]
                if zone_img.size == 0: continue
                results = plate_model(zone_img, conf=0.05, verbose=False) 
                
                for r in results:
                    for box in r.boxes:
                        bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                        crop = zone_img[by1:by2, bx1:bx2]
                        if crop.size > 0: candidates.append(crop)

        # 2. Manual Fallback
        candidates.append(image[int(h*0.6):h, int(w*0.25):int(w*0.75)]) 

        best_text = "NOT DETECTED"
        best_crop = None
        
        # Allow only alphanumeric
        allowed = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        
        for crop in candidates:
            if crop.size == 0: continue
            if crop.shape[0] > crop.shape[1]: continue
            
            # --- TRY MULTIPLE PREPROCESSING VARIANTS ---
            variants = preprocess_plate_variants(crop)
            
            for p_img in variants:
                try:
                    ocr_results = reader.readtext(p_img, detail=0, paragraph=False, allowlist=allowed)
                    raw_text = "".join(ocr_results)
                    formatted_text = force_indian_format(raw_text)
                    clean_check = formatted_text.replace(" ", "")

                    if validate_indian_plate(clean_check): 
                        # Return immediately if perfect match found
                        return formatted_text, crop 
                    
                    # Score-based fallback
                    if len(clean_check) >= 8 and clean_check[:2] in VALID_STATES:
                        if best_text == "NOT DETECTED" or len(clean_check) > len(best_text.replace(" ","")):
                             best_text = formatted_text
                             best_crop = crop
                except: continue
            
        return best_text, best_crop

    def analyze(file_path, lat, long):
        violations = []
        try:
            final_img = None
            if file_path.lower().endswith(('.mp4', '.avi', '.mov', '.mkv')):
                cap = cv2.VideoCapture(file_path)
                cap.set(cv2.CAP_PROP_POS_FRAMES, 15)
                ret, frame = cap.read()
                if ret: final_img = frame
                cap.release()
            else:
                final_img = cv2.imread(file_path)

            if final_img is None:
                print(json.dumps({"error": "Could not read media file"}))
                return

            h_img, w_img = final_img.shape[:2]
            total_area = h_img * w_img

            # --- 1. DETECT RIDERS ---
            res = violation_model(final_img, conf=0.25, iou=0.45, classes=[0], verbose=False)
            detected_persons = []
            
            for r in res:
                for box in r.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    box_area = (x2 - x1) * (y2 - y1)
                    if (box_area / total_area) > 0.02: 
                        detected_persons.append([x1,y1,x2,y2,box_area])

            detected_persons.sort(key=lambda x: x[4], reverse=True)
            N = len(detected_persons)

            # Face Crop
            face_img_file = ""
            if detected_persons:
                x1,y1,x2,y2,_ = detected_persons[0]
                face_h = int((y2 - y1) * 0.45)
                face_crop = final_img[max(0,y1):min(h_img, y1+face_h), max(0,x1):min(w_img, x2)]
                if face_crop.size > 0:
                    face_img_file = f"face_{uuid.uuid4().hex[:8]}.jpg"
                    cv2.imwrite(os.path.join(os.path.dirname(file_path), face_img_file), face_crop)
            
            # --- 2. VIOLATION LOGIC (MULTI-VIOLATION SUPPORT) ---
            
            # Rule A: Triple Riding (Count Based)
            if N >= 3:
                violations.append("TRIPLE_RIDING")

            # Rule B: Helmet Violations (Based on count)
            # This logic allows stacking: e.g., Triple Riding + Helmetless
            if N >= 3:
                 violations.append("HELMETLESS_RIDING") # General label for group
            elif N == 2:
                 violations.append("HELMETLESS_DOUBLE")
            elif N == 1:
                 violations.append("HELMETLESS_SINGLE")
            
            if not violations:
                 violations.append("No Violation")

            # --- 3. CHALLAN MAPPING (SUMMATION) ---
            fine_map = {
                "HELMETLESS_SINGLE": 1000,
                "HELMETLESS_DOUBLE": 1000, 
                "HELMETLESS_RIDING": 1000, # Fine for helmetless group
                "TRIPLE_RIDING": 2000,     # Fine for triple riding
                "No Violation": 0
            }
            
            # Sum up fines for ALL detected violations
            # Example: Triple (2000) + Helmetless (1000) = 3000
            challan_amount = sum(fine_map.get(v, 0) for v in violations)

            # --- 4. ANPR ---
            plate_text, plate_img = smart_plate_reader(final_img)
            
            plate_filename = ""
            if plate_img is not None:
                plate_filename = f"plate_{uuid.uuid4().hex[:8]}.jpg"
                cv2.imwrite(os.path.join(os.path.dirname(file_path), plate_filename), plate_img)
            else:
                fallback_crop = final_img[int(h_img*0.6):h_img, int(w_img*0.2):int(w_img*0.8)]
                plate_filename = f"plate_failed_{uuid.uuid4().hex[:8]}.jpg"
                cv2.imwrite(os.path.join(os.path.dirname(file_path), plate_filename), fallback_crop)

            # --- 5. OUTPUT ---
            timestamp = os.path.getmtime(file_path)
            dt = datetime.datetime.fromtimestamp(timestamp)
            confidence = 88 if plate_text != "NOT DETECTED" else 0
            if "No Violation" in violations: confidence = 0

            # --- REWARD CALCULATION ---
            reward_points = 0
            if "No Violation" not in violations:
                if confidence >= 85:
                    reward_points = 20  # High Trust = Auto-Approve
                else:
                    reward_points = 10  # Medium Trust = Manual Review
            else:
                reward_points = 0      # No Violation

            response = {
                "vehicle_type": "two_wheeler",
                "rider_count": N,
                "violations": violations,
                "violation": violations[0], # Main violation title
                "challan": challan_amount,
                "reward_points": reward_points, # <--- Added Here
                "anpr_number": plate_text,
                "plate": plate_text,
                "plate_image": plate_filename,
                "face_image": face_img_file, 
                "timestamp": dt.isoformat(),
                "gps": { "lat": lat, "lon": long },
                "confidence": confidence,    
                "metadata": {
                    "date": dt.strftime("%d-%m-%Y"),
                    "time": dt.strftime("%H:%M:%S"),
                    "location": f"{lat}, {long}",
                    "resolution": f"{w_img}x{h_img}",
                    "fps": "N/A", "duration": "N/A"
                }
            }
            print(json.dumps(response))

        except Exception as e:
            print(json.dumps({"error": f"Analysis Error: {str(e)}"}))

    if __name__ == "__main__":
        if len(sys.argv) > 1:
            analyze(sys.argv[1], sys.argv[2] if len(sys.argv)>2 else "0", sys.argv[3] if len(sys.argv)>3 else "0")

except Exception as e:
    print(json.dumps({"error": f"Startup Error: {str(e)}"}))