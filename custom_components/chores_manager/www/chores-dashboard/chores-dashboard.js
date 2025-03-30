class ChoresDashboard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
  
    connectedCallback() {
      // Get HA auth token from hass object
      const hass = document.querySelector('home-assistant').hass;
      let authParam = '';
      
      // Store auth token in sessionStorage for the iframe to access
      if (hass && hass.auth && hass.auth.data && hass.auth.data.access_token) {
        const token = hass.auth.data.access_token;
        sessionStorage.setItem('chores_auth_token', token);
        // Also pass as URL parameter to ensure it's available
        authParam = `&auth=${encodeURIComponent(token)}`;
      }
      
      const timestamp = new Date().getTime();
      
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            height: 100%;
            overflow: hidden;
          }
          iframe {
            border: 0;
            width: 100%;
            height: 100%;
            display: block;
          }
        </style>
        <iframe src="/local/chores-dashboard/index.html?v=${timestamp}${authParam}"></iframe>
      `;
    }
  }
  
  customElements.define('chores-dashboard', ChoresDashboard);