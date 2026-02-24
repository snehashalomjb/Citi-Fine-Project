import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = "http://localhost:5000";

function App() {
  const [activePage, setActivePage] = useState('home');
  const [rewardTab, setRewardTab] = useState('overview');
  const [coords, setCoords] = useState({ lat: '', long: '' });
  
  // States
  const [uploading, setUploading] = useState(false);
  const [detectResult, setDetectResult] = useState(null);
  const [stats, setStats] = useState({ points: 0, cash: 0, trust_score: 85, approved: 0, pending: 0 });
  const [complaints, setComplaints] = useState([]);

  // Live Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const mediaRecorderRef = useRef(null);
  const videoRef = useRef(null);
  const chunksRef = useRef([]);

   // --- REAL-TIME GPS TRACKING ---
  useEffect(() => {
    let watchId;
    
    if (navigator.geolocation) {
      // watchPosition updates continuously as you move
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setCoords({ 
            lat: pos.coords.latitude, 
            long: pos.coords.longitude 
          });
          // Optional: Log to console to verify it's updating
          console.log("📍 Live GPS:", pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          console.error("GPS Error:", err);
        },
        {
          enableHighAccuracy: true, // Force high-precision GPS
          timeout: 10000,
          maximumAge: 0
        }
      );
    }

    // Cleanup: Stop tracking when user leaves the app
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Page Switch Handler
  const handlePageChange = (page) => {
    setActivePage(page);
    if(page === 'rewards' || page === 'verification') {
        fetchStats();
        fetchComplaints();
    }
    if(page === 'complaints') fetchComplaints();
    if (page !== 'detection' && cameraStream) {
        stopCamera();
    }
  };

  const fetchStats = async () => {
    try { const res = await axios.get(`${API_URL}/api/dashboard-stats`); setStats(res.data); } catch(e) {}
  };

  const fetchComplaints = async () => {
    try { const res = await axios.get(`${API_URL}/api/complaints`); setComplaints(res.data); } catch(e) {}
  };

  // --- 1. PROCESS (PREVIEW) ---
  // Sends file to backend for analysis only. Does NOT save to DB yet.
  const processFile = async (file) => {
    if(!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('latitude', coords.lat || '0.0');
    formData.append('longitude', coords.long || '0.0');

    setUploading(true);
    stopCamera();
    
    try {
      const res = await axios.post(`${API_URL}/detect`, formData);
      setDetectResult(res.data); // Just show preview
    } catch (err) {
      alert("Upload failed. Check backend console.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // --- 2. SUBMIT REPORT (SAVE TO DB) ---
  // Called when user clicks "Submit Report" button
  const submitReport = async () => {
      if(!detectResult) return;
      
      try {
          // Send the detected result back to server to finalize/save
          const res = await axios.post(`${API_URL}/api/submit-report`, detectResult);
          
          alert(res.data.message); // Show success message (Approved/Under Review)
          setDetectResult(null); // Clear result
          handlePageChange('complaints'); // Go to complaints page to see it
      } catch (err) {
          alert("Submission failed. Check console.");
          console.error(err);
      }
  };

  const handleFileUpload = (e) => {
    processFile(e.target.files[0]);
  };

  // --- LIVE RECORDING FUNCTIONS ---
  const startCamera = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          setCameraStream(stream);
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
          }
      } catch (err) {
          alert("Could not access camera. Please allow permissions.");
      }
  };

  const stopCamera = () => {
      if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
          setCameraStream(null);
      }
  };

  const startRecording = () => {
      if (!cameraStream) return;
      chunksRef.current = [];
      const mediaRecorder = new MediaRecorder(cameraStream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const file = new File([blob], `live_record_${Date.now()}.webm`, { type: 'video/webm' });
          processFile(file);
      };

      mediaRecorder.start();
      setIsRecording(true);
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  // --- Navbar Component ---
  const Navbar = () => (
    <header className="navbar">
      <div className="logo">
        <i className="fas fa-shield-alt"></i>
        <span>Cityfine</span>
      </div>
      <nav className="nav-links">
        {['home', 'detection', 'complaints', 'verification', 'rewards'].map(page => (
          <a key={page} className={`nav-item ${activePage === page ? 'active' : ''}`} 
             onClick={() => handlePageChange(page)}>
            <i className={`fas fa-${page === 'home' ? 'home' : page === 'detection' ? 'camera' : page === 'complaints' ? 'file-alt' : page === 'verification' ? 'user-shield' : 'trophy'}`}></i>
            {page.charAt(0).toUpperCase() + page.slice(1)}
          </a>
        ))}
      </nav>
    </header>
  );

  return (
    <div className="app-container">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      <Navbar />
      
      <main className="content-wrapper">
        
        {/* === HOME PAGE === */}
        {activePage === 'home' && (
          <section className="page-content active">
            <div className="hero">
              <h1>AI-Powered Traffic Violation Detection</h1>
              <p>Report traffic violations instantly. Make roads safer.</p>
              
              {/* UPDATED BUTTON: Redirects to Detection Page */}
              <button 
                className="btn btn-primary" 
                style={{marginTop: '20px'}}
                onClick={() => handlePageChange('detection')}
              >
                <i className="fas fa-camera"></i> Start Detection
              </button>
            </div>

            <h2 className="section-title-center">AI-Powered Detection Features</h2>
            <div className="features-grid">
                <div className="feature-box"><i className="fas fa-traffic-light" style={{color: '#ef4444'}}></i><h3>Signal Jumping</h3><p>Detect vehicles running red lights automatically</p></div>
                <div className="feature-box"><i className="fas fa-tachometer-alt" style={{color: '#f59e0b'}}></i><h3>Overspeeding</h3><p>Identify vehicles exceeding speed limits</p></div>
                <div className="feature-box"><i className="fas fa-hard-hat" style={{color: '#10b981'}}></i><h3>Helmetless Riding</h3><p>Detect riders without proper safety gear</p></div>
                <div className="feature-box"><i className="fas fa-users" style={{color: '#4f46e5'}}></i><h3>Triple Riding</h3><p>Identify overcrowded vehicles automatically</p></div>
            </div>

            <h2 className="section-title-center">How It Works</h2>
            <div className="steps-wrapper">
                <div className="step-item"><div className="step-circle">1</div><h3>Upload Video</h3><p>Record or upload traffic violation video</p></div>
                <div className="step-item"><div className="step-circle">2</div><h3>AI Analysis</h3><p>AI detects violations and extracts number plates</p></div>
                <div className="step-item"><div className="step-circle">3</div><h3>Get Rewarded</h3><p>Earn points and cash for verified reports</p></div>
            </div>
          </section>
        )}

        {/* === DETECTION PAGE === */}
        {activePage === 'detection' && (
          <section className="page-content active">
             <div className="section-header">
               <h1>AI Violation Detection</h1>
               <p style={{color: '#666'}}>Upload a video or image to detect traffic violations automatically</p>
               
               {/* LIVE GPS INDICATOR */}
               <div style={{
                   display: 'inline-flex', 
                   alignItems: 'center', 
                   gap: '8px', 
                   background: '#d1fae5', 
                   color: '#065f46', 
                   padding: '5px 12px', 
                   borderRadius: '20px', 
                   marginTop: '10px', 
                   fontSize: '0.85rem',
                   fontWeight: '600'
               }}>
                   <i className="fas fa-satellite-dish fa-beat" style={{'--fa-animation-duration': '2s'}}></i>
                   {coords.lat ? `GPS Active: ${coords.lat.toFixed(4)}, ${coords.long.toFixed(4)}` : "Acquiring GPS..."}
               </div>
             </div>
             
             {!detectResult && !uploading && !cameraStream && (
                <div className="upload-area">
                  <i className="fas fa-cloud-upload-alt upload-icon-large"></i>
                  <h2>Upload Video or Image File</h2>
                  <p style={{marginBottom: '20px', color: '#888'}}>Choose a video or image file to analyze (Max 500MB)</p>
                  <div style={{display:'flex', gap:'15px', justifyContent:'center'}}>
                      <label className="btn btn-primary">Choose File <input type="file" onChange={handleFileUpload} style={{display:'none'}} /></label>
                      <button className="btn btn-dark" onClick={startCamera}><i className="fas fa-video"></i> Record Live</button>
                  </div>
                </div>
             )}

             {cameraStream && !uploading && (
                 <div className="camera-container">
                     <video ref={videoRef} autoPlay muted className="live-preview"></video>
                     <div className="camera-controls">
                         {!isRecording ? (
                             <button className="btn btn-danger" onClick={startRecording}><i className="fas fa-circle"></i> Start Recording</button>
                         ) : (
                             <button className="btn btn-warning" onClick={stopRecording}><i className="fas fa-stop"></i> Stop & Analyze</button>
                         )}
                         <button className="btn btn-outline" onClick={stopCamera} style={{marginLeft:'10px'}}>Cancel</button>
                     </div>
                     {isRecording && <p className="recording-indicator"><i className="fas fa-circle fa-beat"></i> Recording...</p>}
                 </div>
             )}
             
             {uploading && (
                 <div className="empty-status">
                     <i className="fas fa-spinner fa-spin" style={{fontSize: '3rem', color: '#4f46e5', marginBottom: '15px'}}></i>
                     <h3>Analyzing Footage...</h3>
                     <p>Detecting violations, faces, and reading number plate.</p>
                 </div>
             )}

             {detectResult && !uploading && (
               <div className="result-card">
                  <h3 className="result-title"><i className="fas fa-check-circle"></i> Analysis Complete</h3>
                  
                  {/* --- IMAGES SECTION (PLATE & FACE) --- */}
                  <div style={{display:'flex', gap:'15px', justifyContent:'center', margin:'20px 0'}}>
                      {detectResult.plate_image && (
                          <div style={{textAlign:'center'}}>
                              <img src={detectResult.plate_image} alt="plate" style={{height:'80px', border:'2px solid #eee', borderRadius:'8px'}} />
                              <p style={{fontSize:'0.8rem', color:'#666', marginTop:'5px'}}>Plate Evidence</p>
                          </div>
                      )}
                      {detectResult.face_image && (
                          <div style={{textAlign:'center'}}>
                              <img src={detectResult.face_image} alt="face" style={{height:'80px', border:'2px solid #eee', borderRadius:'8px'}} />
                              <p style={{fontSize:'0.8rem', color:'#666', marginTop:'5px'}}>Rider ID</p>
                          </div>
                      )}
                  </div>

                  <div className="result-grid">
                    <div className="result-item" style={{alignItems: 'flex-start'}}>
                      <b style={{minWidth:'140px'}}>Violation:</b> 
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                        {detectResult.violations?.map((v, idx) => (
                            <span key={idx} style={{background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold'}}>{v.replace(/_/g, " ")}</span>
                        ))}
                      </div>
                    </div>
                    
                    {/* UPDATED: Displays plate with proper spacing if detected */}
                    <div className="result-item">
                        <b style={{minWidth:'140px'}}>Plate:</b> 
                        <span style={{background: '#eee', padding:'4px 10px', borderRadius:'4px', fontWeight:'bold', letterSpacing: '1px'}}>
                            {detectResult.plate !== "NOT DETECTED" ? detectResult.plate : "NOT DETECTED"}
                        </span>
                    </div>
                    
                    {/* UPDATED: Displays High Confidence status correctly */}
                    <div className="result-item"><b style={{minWidth:'140px'}}>Trust Score:</b> 
                        <span style={{color: detectResult.confidence >= 85 ? '#16a34a' : '#ea580c', fontWeight:'bold'}}>
                            {detectResult.confidence}% ({detectResult.confidence >= 85 ? "Auto-Approve" : "Manual Review"})
                        </span>
                    </div>
                    
                    {/* --- FIXED CHALLAN & ADDED REWARD HERE --- */}
                    <div className="result-item"><b style={{minWidth:'140px'}}>Est. Challan:</b> <span style={{color: '#dc3545', fontWeight:'bold'}}>₹{detectResult.challan || detectResult.fine_amount || 0}</span></div>
                    <div className="result-item"><b style={{minWidth:'140px'}}>Reward:</b> <span style={{color: '#16a34a', fontWeight:'bold'}}>+{detectResult.reward_points || 0} Points</span></div>
                  </div>

                  {detectResult.metadata && (
                      <div className="metadata-box">
                          <h4><i className="fas fa-info-circle"></i> Media Metadata</h4>
                          <div className="metadata-grid" style={{gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px'}}>
                              <p><b>Date:</b><br/>{detectResult.metadata.date}</p>
                              <p><b>Time:</b><br/>{detectResult.metadata.time}</p>
                              <p><b>Location:</b><br/>{detectResult.metadata.location}</p>
                          </div>
                      </div>
                  )}

                  <div style={{marginTop: '25px', display:'flex', gap:'10px', justifyContent:'center'}}>
                      <button className="btn btn-outline" onClick={() => setDetectResult(null)}>Discard</button>
                      
                      {/* --- SUBMIT BUTTON --- */}
                      <button className="btn btn-primary" onClick={submitReport}>
                          <i className="fas fa-paper-plane"></i> Submit Report
                      </button>
                  </div>
               </div>
             )}
          </section>
        )}

        {/* === COMPLAINTS PAGE === */}
        {activePage === 'complaints' && (
          <section className="page-content active">
            <div className="section-header"><h1>My Complaints</h1></div>
            <div style={{display: 'grid', gap: '20px'}}>
              {complaints.length === 0 ? (
                <div className="empty-status"><i className="fas fa-folder-open" style={{fontSize: '3rem', color: '#ccc', marginBottom:'15px'}}></i><h3>No Reports Found</h3><p>You haven't submitted any violation reports yet.</p></div>
              ) : complaints.map((c, i) => (
                <div key={i} className="card" style={{display:'flex', gap:'20px', alignItems:'center'}}>
                  <div style={{width:'120px', height:'80px', background:'#000', borderRadius:'8px', overflow:'hidden', flexShrink: 0}}><img src={c.media} style={{width:'100%', height:'100%', objectFit:'cover'}} onError={(e)=>{e.target.style.display='none'}} /></div>
                  <div style={{flex: 1}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <h3 style={{fontSize:'1.1rem', margin:0}}>{c.violation_type}</h3>
                        <span style={{padding:'4px 12px', borderRadius:'20px', fontSize:'0.8rem', fontWeight:'600', background: c.status==='Approved'?'#d1fae5': c.status==='Rejected'?'#fee2e2':'#fef3c7', color: c.status==='Approved'?'#047857': c.status==='Rejected'?'#b91c1c':'#b45309'}}>{c.status}</span>
                    </div>
                    <p style={{color:'#666', fontSize:'0.9rem', marginBottom:'4px'}}><i className="fas fa-id-card"></i> Plate: <b>{c.plate}</b></p>
                    <p style={{color:'#666', fontSize:'0.9rem'}}><i className="fas fa-map-marker-alt"></i> {c.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* === VERIFICATION PAGE === */}
        {activePage === 'verification' && (
          <section className="page-content active">
             <div className="section-header">
               <h1>Trust Score Verification</h1>
               <p>Track your report verification status and trust score</p>
             </div>

             <div className="verif-card">
                 <div className="verif-stats-row">
                     <div className="verif-stat-item"><h4>Your Trust Score</h4><div className="score-circle-large sc-purple">{stats.trust_score}</div><span style={{color: '#4f46e5', fontWeight: 'bold'}}>Good</span></div>
                     <div className="verif-stat-item"><h4>Total Reports</h4><div className="score-circle-large sc-blue">{complaints.length}</div></div>
                     <div className="verif-stat-item"><h4>Approved</h4><div className="score-circle-large sc-green">{stats.approved}</div></div>
                 </div>
             </div>

             <div className="info-banner">
                 <div style={{display:'flex', alignItems:'flex-start', gap:'15px'}}>
                     <i className="fas fa-shield-alt" style={{fontSize: '1.5rem', color: '#4f46e5', marginTop:'3px'}}></i>
                     <div><h4 style={{color: '#4f46e5', marginBottom: '5px'}}>Trust Score Benefits</h4><p style={{color: '#555', fontSize: '0.95rem'}}>High trust score! Your reports are auto-approved for faster processing.</p></div>
                 </div>
             </div>

             <h3 style={{marginBottom: '20px'}}>How Verification Works</h3>
             <div className="verif-info-grid">
                 <div className="verif-box vb-green"><h4 style={{color: '#16a34a', marginBottom: '10px'}}><i className="fas fa-check-circle"></i> High Trust Score (≥80)</h4><p style={{fontSize: '0.9rem', color: '#166534'}}>Reports are automatically approved and rewards are instantly credited.</p></div>
                 <div className="verif-box vb-blue"><h4 style={{color: '#2563eb', marginBottom: '10px'}}><i className="fas fa-clock"></i> Lower Trust Score (&lt;80)</h4><p style={{fontSize: '0.9rem', color: '#1e40af'}}>Reports are sent to RTO authorities for manual verification (2-5 business days).</p></div>
             </div>
          </section>
        )}

        {/* === REWARDS PAGE === */}
        {activePage === 'rewards' && (
          <section className="page-content active">
             <div className="section-header">
               <h1>Reward & Tracking Dashboard</h1>
               <p>Monitor your reports and claim your rewards</p>
             </div>
             
             <div className="rewards-grid">
                <div className="reward-card"><div className="reward-icon-circle rc-blue"><i className="fas fa-trophy"></i></div><div className="reward-value">{stats.points}</div><div className="reward-label">Total Points</div></div>
                <div className="reward-card"><div className="reward-icon-circle rc-green"><i className="fas fa-dollar-sign"></i></div><div className="reward-value">₹{stats.cash}</div><div className="reward-label">Cash Value</div></div>
                <div className="reward-card"><div className="reward-icon-circle rc-purple"><i className="fas fa-medal"></i></div><div className="reward-value">{stats.approved}</div><div className="reward-label">Approved</div></div>
                <div className="reward-card"><div className="reward-icon-circle rc-yellow"><i className="fas fa-chart-line"></i></div><div className="reward-value">{stats.trust_score}</div><div className="reward-label">Trust Score</div></div>
             </div>

             <div className="dashboard-panel">
                 <div className="tabs-header">
                     <div className={`tab-item ${rewardTab==='overview'?'active':''}`} onClick={()=>setRewardTab('overview')}>Overview</div>
                     <div className={`tab-item ${rewardTab==='claim'?'active':''}`} onClick={()=>setRewardTab('claim')}>Claim Rewards</div>
                     <div className={`tab-item ${rewardTab==='achievements'?'active':''}`} onClick={()=>setRewardTab('achievements')}>Achievements</div>
                 </div>

                 {rewardTab === 'overview' && (
                     <div className="dashboard-content">
                        <div className="dashboard-row">
                           <div className="dashboard-col">
                               <h3>Report Status Breakdown</h3>
                               <div className="status-breakdown-list">
                                   <div className="breakdown-item bg-yellow"><span>Pending Review</span><strong>{stats.pending || 0}</strong></div>
                                   <div className="breakdown-item bg-blue"><span>Under Review</span><strong>0</strong></div>
                                   <div className="breakdown-item bg-green"><span>Approved</span><strong>{stats.approved}</strong></div>
                                   <div className="breakdown-item bg-red"><span>Rejected</span><strong>0</strong></div>
                               </div>
                           </div>
                           <div className="dashboard-col" style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                               <h3>Recent Activity</h3>
                               {complaints.length > 0 ? (
                                   <div style={{width:'100%', marginTop:'10px'}}>
                                       {complaints.slice(0,3).map((c,i) => (<div key={i} style={{padding:'10px', borderBottom:'1px solid #eee', fontSize:'0.9rem'}}><i className="fas fa-circle" style={{fontSize:'8px', marginRight:'8px', color:'#4f46e5'}}></i>Submitted <b>{c.violation_type}</b> report</div>))}
                                   </div>
                               ) : (<div style={{textAlign:'center', color:'#999', padding:'20px'}}><i className="far fa-calendar-alt" style={{fontSize:'3rem', marginBottom:'10px'}}></i><p>No reports submitted yet</p></div>)}
                           </div>
                        </div>
                     </div>
                 )}

                 {rewardTab === 'claim' && (
                     <div className="dashboard-content" style={{textAlign:'center', padding:'40px'}}>
                        <h3 style={{marginBottom:'10px'}}><i className="fas fa-wallet"></i> Cash Out Rewards</h3>
                        <p style={{marginBottom: '30px', color: '#666'}}>Convert your verified points to cash instantly.</p>
                        <div style={{background:'#f8fafc', padding:'30px', borderRadius:'12px', display:'inline-block', minWidth:'300px'}}>
                            <div style={{fontSize:'2.5rem', fontWeight:'700', color:'#10b981', marginBottom:'5px'}}>₹{stats.cash}</div>
                            <p style={{marginBottom:'20px'}}>Available Balance</p>
                            {stats.points > 0 ? (
                                <button className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} onClick={async () => {
                                    try { const res = await axios.post(`${API_URL}/api/claim-reward`); alert(res.data.message); fetchStats(); } catch (err) { alert("Claim failed"); }
                                }}>Confirm Withdrawal</button>
                            ) : (<button className="btn btn-outline" disabled style={{width:'100%', opacity: 0.6, cursor:'not-allowed'}}>No Balance</button>)}
                        </div>
                     </div>
                 )}
                 {rewardTab === 'achievements' && <div className="dashboard-content" style={{textAlign:'center', padding:'50px', color:'#999'}}><i className="fas fa-medal" style={{fontSize:'3rem', marginBottom:'15px'}}></i><p>Achievements unlocking soon!</p></div>}
             </div>
          </section>
        )}

      </main>
    </div>
  );
}

export default App;