class ChoresDashboard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
  
    connectedCallback() {
      // Get HA auth token from hass object
      const hass = document.querySelector('home-assistant').hass;
      
      // Store auth token in localStorage for the iframe to access
      if (hass && hass.auth && hass.auth.data && hass.auth.data.access_token) {
        sessionStorage.setItem('chores_auth_token', hass.auth.data.access_token);
      }
      
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
        <iframe src="/local/chores-dashboard/index.html?v=20250331"></iframe>
      `;
    }
  }
  
  customElements.define('chores-dashboard', ChoresDashboard);