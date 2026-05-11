import { useState, useRef, useCallback } from 'react'
import './App.css'

const FILE_TYPES = [
  {
    id: 'iso',
    name: 'ISO',
    desc: 'ISO 8583 Messages',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z" /><path d="M4 10h16" /><path d="M10 4v16" />
      </svg>
    ),
  },
  {
    id: 'billed',
    name: 'BILLED',
    desc: 'Statement Raw',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
  },
  {
    id: 'auth',
    name: 'AUTH',
    desc: 'Auth Raw',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
]

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('jwt_token') || null)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [fileType, setFileType] = useState(null)
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { type: 'success'|'error', data: {...} }
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    if (!fileType) return // Block file drop without file type
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) setFile(droppedFile)
  }, [fileType])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) setFile(selectedFile)
  }

  const handleRemoveFile = () => {
    setFile(null)
    setResult(null)
    setCopied(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUpload = async () => {
    if (!fileType || !file) return

    setLoading(true)
    setResult(null)
    setCopied(false)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('file_type', fileType)

      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/transaction/parse`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      })

      // Safely parse response — backend might return empty body or HTML error page
      let data
      const contentType = response.headers.get('content-type') || ''
      const responseText = await response.text()

      if (contentType.includes('application/json') && responseText) {
        try {
          data = JSON.parse(responseText)
        } catch {
          data = null
        }
      }

      if (response.ok && data && data.status === 'success') {
        setResult({ type: 'success', data })
      } else {
        // Build error from structured response or raw text
        const errorData = data || {
          status: 'error',
          message: response.status >= 500
            ? 'Server error occurred (HTTP ' + response.status + '). Check backend logs for details.'
            : 'Request failed with status ' + response.status,
          errorDetails: responseText ? responseText.substring(0, 500) : 'No response body',
        }
        setResult({ type: 'error', data: errorData })
      }
    } catch (err) {
      setResult({
        type: 'error',
        data: {
          status: 'error',
          message: 'Network error: Unable to connect to the server. Please ensure the backend is running on port 8083.',
          errorDetails: err.message,
        },
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (result?.data?.query) {
      try {
        await navigator.clipboard.writeText(result.data.query)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // fallback
        const textArea = document.createElement('textarea')
        textArea.value = result.data.query
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  const handleReset = () => {
    setFileType(null)
    setFile(null)
    setResult(null)
    setCopied(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const renderQuery = (query) => {
    if (!query) return null
    const lines = query.split('\n')
    return lines.map((line, i) => {
      // Split by keywords, table names, or values, keeping the delimiters
      const tokens = line.split(/(\b(?:SELECT|FROM|WHERE|IN|AND|OR|NOT|INSERT|UPDATE|DELETE|JOIN|ON|AS|SET|VALUES)\b|public\.\w+|'[^']*')/gi)
      
      return (
        <span key={i}>
          {tokens.map((token, j) => {
            if (!token) return null
            if (/^(?:SELECT|FROM|WHERE|IN|AND|OR|NOT|INSERT|UPDATE|DELETE|JOIN|ON|AS|SET|VALUES)$/i.test(token)) {
              return <span key={j} className="query-keyword">{token}</span>
            }
            if (/^public\.\w+$/.test(token)) {
              return <span key={j} className="query-table">{token}</span>
            }
            if (/^'[^']*'$/.test(token)) {
              return <span key={j} className="query-values">{token}</span>
            }
            return <span key={j}>{token}</span>
          })}
          {i < lines.length - 1 && '\n'}
        </span>
      )
    })
  }

  const handleLogout = () => {
    localStorage.removeItem('jwt_token')
    setToken(null)
    setResult(null)
    setFile(null)
    setFileType(null)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const API_URL = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      
      const data = await response.json()
      
      if (response.ok && data.token) {
        localStorage.setItem('jwt_token', data.token)
        setToken(data.token)
      } else {
        setLoginError(data.error || 'Invalid credentials')
      }
    } catch (err) {
      setLoginError('Network error connecting to server.')
    } finally {
      setLoginLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="app-container login-container">
        <div className="login-box">
          <div className="login-header">
            <h2>Secure Access</h2>
            <p>Please log in to continue</p>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            {loginError && <div className="error-banner">{loginError}</div>}
            
            <div className="form-group">
              <label>Username</label>
              <input 
                type="text" 
                value={loginForm.username}
                onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                disabled={loginLoading}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Password</label>
              <input 
                type="password" 
                value={loginForm.password}
                onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                disabled={loginLoading}
                required
              />
            </div>
            
            <button type="submit" className="upload-button" disabled={loginLoading}>
              {loginLoading ? 'Authenticating...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const canUpload = fileType && file && !loading

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <div className="app-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <h1 className="app-title" style={{margin: 0}}>BST Data Loader</h1>
            <p className="app-subtitle" style={{margin: 0}}>Upload transaction files to load into the database</p>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </header>

      {/* Main Card */}
      <div className="card">
        {/* Step 1: File Type */}
        <div className="card-section">
          <div className="section-label">
            <span className="step-number">1</span>
            Select File Type
          </div>
          <div className="file-type-grid">
            {FILE_TYPES.map((type) => (
              <button
                key={type.id}
                id={`file-type-${type.id}`}
                className={`file-type-btn${fileType === type.id ? ' active' : ''}`}
                onClick={() => setFileType(type.id)}
                disabled={loading}
              >
                <div className="type-icon">{type.icon}</div>
                <span className="type-name">{type.name}</span>
                <span className="type-desc">{type.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: File Upload */}
        <div className="card-section">
          <div className="section-label">
            <span className="step-number">2</span>
            Attach CSV File
          </div>
          <div
            className={`drop-zone${dragOver ? ' drag-over' : ''}${file ? ' has-file' : ''}${!fileType ? ' disabled' : ''}`}
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !loading && fileType && fileInputRef.current?.click()}
          >
            <div className="drop-zone-icon">
              {file ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <polyline points="9 15 12 18 15 15" className="checkmark-path" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>
            {file ? (
              <p className="drop-zone-text">File attached successfully</p>
            ) : !fileType ? (
              <>
                <p className="drop-zone-text">Select a file type first</p>
                <p className="drop-zone-hint">Choose ISO, BILLED, or AUTH above to proceed</p>
              </>
            ) : (
              <>
                <p className="drop-zone-text">
                  Drag & drop your file here, or <strong>browse</strong>
                </p>
                <p className="drop-zone-hint">Supports pipe-delimited CSV files</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              accept=".csv,.txt"
              onChange={handleFileSelect}
              disabled={loading}
            />
          </div>

          {/* File Preview */}
          {file && (
            <div className="file-preview">
              <div className="file-preview-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="file-preview-info">
                <div className="file-preview-name">{file.name}</div>
                <div className="file-preview-size">{formatFileSize(file.size)}</div>
              </div>
              {!loading && (
                <button className="file-remove-btn" onClick={(e) => { e.stopPropagation(); handleRemoveFile() }} title="Remove file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Upload Button — show when no result yet OR when there's an error (so user can retry) */}
        {!loading && (!result || result.type === 'error') && (
          <div className="upload-section">
            <button
              id="upload-btn"
              className="upload-btn"
              disabled={!canUpload}
              onClick={handleUpload}
            >
              <span className="upload-btn-content">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {result?.type === 'error' ? 'Retry Load' : 'Load Data'}
              </span>
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-card">
              <div className="spinner-ring" />
              <p className="loading-text">Processing your file...</p>
              <p className="loading-subtext">Parsing CSV and loading records into the database</p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="result-panel">
            {result.type === 'success' ? (
              <div className="result-success">
                <div className="result-success-header">
                  <div className="success-icon-circle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <div className="success-title">{result.data.message}</div>
                    <div className="success-subtitle">
                      {result.data.recordCount} record{result.data.recordCount !== 1 ? 's' : ''} loaded as {result.data.fileType?.toUpperCase()}
                    </div>
                  </div>
                </div>

                {result.data.query && (
                  <div className="query-block">
                    <div className="query-label">
                      <span className="query-label-text">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                        </svg>
                        Verification Query
                      </span>
                      <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
                        {copied ? (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="query-code">{renderQuery(result.data.query)}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="result-error">
                <div className="error-header">
                  <div className="error-icon-circle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <div className="error-title">Data Load Failed</div>
                    <p className="error-message">{result.data.message || 'An unexpected error occurred'}</p>
                  </div>
                </div>

                {result.data.errorDetails && (
                  <div className="error-details">
                    <span className="error-details-label">Technical Details</span>
                    {result.data.errorDetails}
                  </div>
                )}
              </div>
            )}

            {/* Reset */}
            <button className="reset-btn" onClick={handleReset}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Upload Another File
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
