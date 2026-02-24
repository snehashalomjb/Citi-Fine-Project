import os
from ultralytics import YOLO

if os.path.exists("best.pt"):
    print("✅ File Found!")
    try:
        model = YOLO("best.pt")
        print("🚀 Model Loaded Successfully!")
        print(f"Classes: {model.names}")
    except Exception as e:
        print(f"❌ File exists but crashed: {e}")
else:
    print("❌ Error: best.pt is NOT in this folder.")