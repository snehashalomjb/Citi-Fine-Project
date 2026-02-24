import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'  // <--- Changed from './src/App.jsx' back to './App.jsx'
import './App.css'           // <--- Changed back to './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)