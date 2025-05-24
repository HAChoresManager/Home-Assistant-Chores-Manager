class ChoresDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Simplified approach - let the auth-helper handle all authentication
    // This works better for mobile apps since we don't need to extract tokens here
    
    const timestamp = new Date().getTime();
    
    // Check if we're running in the Home Assistant mobile app
    const isInMobileApp = this.detectMobileApp();
    
    // Add cache-busting parameter
    let iframeSrc = `/local/chores-dashboard/index.html?v=${timestamp}`;
    
    // Add mobile app indicator if detected
    if (isInMobileApp) {
      iframeSrc += '&mobile=1';
    }
    
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          overflow: hidden;
          background-color: #ffffff;
        }
        iframe {
          border: 0;
          width: 100%;
          height: 100%;
          display: block;
          background-color: #ffffff;
        }
        .loading-message {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #333;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          text-align: center;
        }
        .loading-spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 0 auto 10px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .error-message {
          color: #e74c3c;
          background: #fdf2f2;
          padding: 15px;
          border-radius: 5px;
          border: 1px solid #e74c3c;
          margin: 10px;
        }
      </style>
      <div class="loading-message" id="loading">
        <div class="loading-spinner"></div>
        <div>Loading Chores Dashboard...</div>
        <div style="font-size: 12px; color: #666; margin-top: 10px;">
          ${isInMobileApp ? 'Mobile App Mode' : 'Web Browser Mode'}
        </div>
      </div>
      <iframe 
        src="${iframeSrc}" 
        id="dashboard-iframe"
        style="display: none;"
        onload="this.parentElement.querySelector('#loading').style.display='none'; this.style.display='block';"
        onerror="this.parentElement.querySelector('#loading').innerHTML='<div class=error-message>Failed to load dashboard. Please refresh the page.</div>';"
      ></iframe>
    `;
    
    // Set up error handling for iframe loading
    const iframe = this.shadowRoot.querySelector('#dashboard-iframe');
    const loading = this.shadowRoot.querySelector('#loading');
    
    // Timeout to show error if iframe takes too long to load
    setTimeout(() => {
      if (loading.style.display !== 'none') {
        loading.innerHTML = `
          <div class="error-message">
            Dashboard is taking longer than expected to load.<br>
            <button onclick="window.location.reload()" style="margin-top: 10px; padding: 5px 10px; cursor: pointer;">
              Refresh Page
            </button>
          </div>
        `;
      }
    }, 15000); // 15 second timeout
  }
  
  detectMobileApp() {
    try {
      // Check for Home Assistant mobile app indicators
      const userAgent = navigator.userAgent || '';
      const isHA = userAgent.includes('HomeAssistant') || 
                   userAgent.includes('Home Assistant') ||
                   window.webkit?.messageHandlers?.externalBus ||
                   window.external?.getExternalAuth ||
                   document.querySelector('home-assistant')?.hasAttribute('mobile');
                   
      // Also check if we're in a webview
      const isWebView = userAgent.includes('wv') || 
                       window.chrome?.webview ||
                       window.external?.notify;
      
      return isHA || isWebView;
    } catch (e) {
      return false;
    }
  }
}

customElements.define('chores-dashboard', ChoresDashboard);