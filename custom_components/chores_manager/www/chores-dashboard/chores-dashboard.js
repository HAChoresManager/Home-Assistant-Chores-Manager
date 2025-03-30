class ChoresDashboard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }
  
    connectedCallback() {
      this.shadowRoot.innerHTML = `
        <style>
          /* Core styles */
          iframe {
            border: 0;
            width: 100%;
            height: 100%;
            position: absolute;
          }
        </style>
        <iframe src="/local/chores-dashboard/index.html"></iframe>
      `;
    }
  }
  
  customElements.define('chores-dashboard', ChoresDashboard);