// script.js - Complete Implementation for ThonAPI Documentation

// ======================
// Configuration
// ======================
const CONFIG = {
  API_BASE_URL: 'https://api.thonapi.com/v1',
  DEFAULT_ERROR_MESSAGE: 'An error occurred. Please try again.',
  LOADING_DELAY: 300, // ms for loading animations
  DEBOUNCE_DELAY: 300, // ms for search debounce
  TOAST_DURATION: 5000 // ms for toast notifications
};

// ======================
// DOM Elements
// ======================
const DOM = {
  // Core Elements
  body: document.body,
  loadingScreen: document.getElementById("loadingScreen"),
  
  // Navigation
  sideNav: document.getElementById("sideNavigation"),
  menuToggle: document.querySelector(".menu-toggle"),
  
  // Theme
  themeToggle: document.getElementById("themeToggle"),
  
  // Search
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  
  // API Content
  apiContent: document.getElementById("apiContent"),
  
  // Notifications
  notificationToast: document.getElementById("notificationToast"),
  notificationBell: document.getElementById("notificationBell"),
  notificationBadge: document.getElementById("notificationBadge"),
  
  // Modal
  modal: {
    element: document.getElementById("apiResponseModal"),
    instance: null,
    label: document.getElementById("apiResponseModalLabel"),
    desc: document.getElementById("apiResponseModalDesc"),
    content: document.getElementById("apiResponseContent"),
    endpoint: document.getElementById("apiEndpoint"),
    spinner: document.getElementById("apiResponseLoading"),
    queryInput: document.getElementById("apiQueryInputContainer"),
    submitBtn: document.getElementById("submitQueryBtn"),
    copyEndpoint: document.getElementById("copyEndpoint"),
    copyResponse: document.getElementById("copyResponse")
  }
};

// ======================
// State Management
// ======================
const STATE = {
  currentApi: null,
  apiEndpoints: [],
  notifications: [],
  theme: localStorage.getItem('theme') || 'light'
};

// ======================
// Core Functions
// ======================

/**
 * Initialize all components when DOM is loaded
 */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize UI components
    initMobileMenu();
    initTheme();
    initSearch();
    initModal();
    
    // Load data
    await loadApiEndpoints();
    await loadNotifications();
    
    // Render content
    renderApiEndpoints();
    updateNotificationBadge();
    
    // Hide loading screen
    setTimeout(hideLoadingScreen, CONFIG.LOADING_DELAY);
    
  } catch (error) {
    console.error("Initialization error:", error);
    showToast("Failed to initialize application", "error");
    displayErrorState();
  }
});

// ======================
// API Functions
// ======================

/**
 * Load API endpoints from server
 */
async function loadApiEndpoints() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/endpoints`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    STATE.apiEndpoints = await response.json();
    
  } catch (error) {
    console.error("Error loading API endpoints:", error);
    showToast("Failed to load API endpoints", "error");
    // Fallback to sample data if API fails
    STATE.apiEndpoints = getSampleEndpoints();
  }
}

/**
 * Make real API request
 */
async function makeApiRequest(endpoint, method = 'GET', params = {}) {
  try {
    const url = new URL(`${CONFIG.API_BASE_URL}${endpoint}`);
    
    // Add query parameters for GET requests
    if (method === 'GET') {
      Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
      });
    }
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    // Add body for non-GET requests
    if (method !== 'GET') {
      options.body = JSON.stringify(params);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || CONFIG.DEFAULT_ERROR_MESSAGE);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

// ======================
// UI Functions
// ======================

/**
 * Initialize mobile menu functionality
 */
function initMobileMenu() {
  DOM.menuToggle.addEventListener("click", () => {
    DOM.sideNav.classList.toggle("active");
    const expanded = DOM.sideNav.classList.contains("active");
    DOM.menuToggle.setAttribute("aria-expanded", expanded);
  });
  
  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!DOM.sideNav.contains(e.target) && !DOM.menuToggle.contains(e.target)) {
      DOM.sideNav.classList.remove("active");
      DOM.menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

/**
 * Initialize theme switcher
 */
function initTheme() {
  // Set initial theme
  DOM.body.classList.toggle('dark-theme', STATE.theme === 'dark');
  DOM.themeToggle.checked = STATE.theme === 'dark';
  
  // Toggle theme
  DOM.themeToggle.addEventListener("change", () => {
    STATE.theme = DOM.themeToggle.checked ? 'dark' : 'light';
    DOM.body.classList.toggle('dark-theme', STATE.theme === 'dark');
    localStorage.setItem('theme', STATE.theme);
    showToast(`Theme set to ${STATE.theme} mode`);
  });
}

/**
 * Initialize search functionality
 */
function initSearch() {
  // Search with debounce
  DOM.searchInput.addEventListener("input", debounce(() => {
    const query = DOM.searchInput.value.toLowerCase();
    DOM.clearSearch.style.visibility = query ? "visible" : "hidden";
    filterApiEndpoints(query);
  }, CONFIG.DEBOUNCE_DELAY));
  
  // Clear search
  DOM.clearSearch.addEventListener("click", () => {
    DOM.searchInput.value = "";
    DOM.searchInput.focus();
    DOM.clearSearch.style.visibility = "hidden";
    filterApiEndpoints("");
  });
}

/**
 * Initialize modal functionality
 */
function initModal() {
  DOM.modal.instance = new bootstrap.Modal(DOM.modal.element);
  
  // Copy buttons
  DOM.modal.copyEndpoint.addEventListener("click", () => {
    copyToClipboard(DOM.modal.endpoint.textContent);
  });
  
  DOM.modal.copyResponse.addEventListener("click", () => {
    copyToClipboard(DOM.modal.content.textContent);
  });
  
  // Submit button
  DOM.modal.submitBtn.addEventListener("click", async () => {
    if (!STATE.currentApi) return;
    await submitApiRequest();
  });
}

// ======================
// API Content Rendering
// ======================

/**
 * Render API endpoints to the page
 */
function renderApiEndpoints() {
  if (!STATE.apiEndpoints.length) {
    displayErrorState("No API endpoints available");
    return;
  }
  
  DOM.apiContent.innerHTML = STATE.apiEndpoints.map(api => `
    <div class="api-card" data-id="${api.id}">
      <div class="api-card-header">
        <h3>${api.name}</h3>
        <span class="method-${api.method.toLowerCase()}">${api.method}</span>
      </div>
      <p>${api.description}</p>
      <div class="api-card-footer">
        <button class="btn btn-sm try-api-btn" data-api-id="${api.id}">
          <i class="fas fa-terminal"></i> Try it
        </button>
      </div>
    </div>
  `).join("");
  
  // Add event listeners to try buttons
  document.querySelectorAll(".try-api-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const apiId = btn.getAttribute("data-api-id");
      openApiModal(apiId);
    });
  });
}

/**
 * Filter API endpoints based on search query
 */
function filterApiEndpoints(query) {
  const cards = document.querySelectorAll(".api-card");
  let hasResults = false;
  
  cards.forEach(card => {
    const title = card.querySelector("h3").textContent.toLowerCase();
    const desc = card.querySelector("p").textContent.toLowerCase();
    const matches = title.includes(query) || desc.includes(query);
    
    card.style.display = matches ? "" : "none";
    if (matches) hasResults = true;
  });
  
  toggleNoResultsMessage(!hasResults && query);
}

// ======================
// Modal Functions
// ======================

/**
 * Open API modal with specified endpoint
 */
function openApiModal(apiId) {
  const api = STATE.apiEndpoints.find(a => a.id === apiId);
  if (!api) return;
  
  STATE.currentApi = api;
  
  // Set modal content
  DOM.modal.label.textContent = api.name;
  DOM.modal.desc.textContent = api.description;
  DOM.modal.endpoint.textContent = `${CONFIG.API_BASE_URL}${api.endpoint}`;
  DOM.modal.content.textContent = "";
  
  // Generate query inputs
  generateQueryInputs(api);
  
  // Show modal
  DOM.modal.instance.show();
}

/**
 * Generate query inputs based on API parameters
 */
function generateQueryInputs(api) {
  DOM.modal.queryInput.innerHTML = api.parameters?.map(param => `
    <div class="mb-3">
      <label class="form-label">
        ${param.name}
        ${param.required ? '<span class="text-danger">*</span>' : ''}
      </label>
      <input 
        type="${param.type || 'text'}" 
        class="form-control" 
        placeholder="${param.example || ''}"
        ${param.required ? 'required' : ''}
        data-param="${param.name}"
      >
    </div>
  `).join("") || "<p>No parameters required</p>";
  
  // Validate inputs on change
  document.querySelectorAll("#apiQueryInputContainer input").forEach(input => {
    input.addEventListener("input", validateModalInputs);
  });
  
  DOM.modal.submitBtn.disabled = api.parameters?.some(p => p.required) || false;
}

/**
 * Validate modal inputs
 */
function validateModalInputs() {
  const requiredInputs = document.querySelectorAll("#apiQueryInputContainer input[required]");
  const allValid = Array.from(requiredInputs).every(input => input.value.trim());
  DOM.modal.submitBtn.disabled = !allValid;
}

/**
 * Submit API request from modal
 */
async function submitApiRequest() {
  if (!STATE.currentApi) return;
  
  try {
    // Show loading state
    DOM.modal.spinner.classList.remove("d-none");
    DOM.modal.submitBtn.disabled = true;
    DOM.modal.submitBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2"></span>
      Processing...
    `;
    
    // Get parameters
    const params = {};
    document.querySelectorAll("#apiQueryInputContainer input").forEach(input => {
      if (input.value.trim()) {
        params[input.dataset.param] = input.value.trim();
      }
    });
    
    // Make API request
    const response = await makeApiRequest(
      STATE.currentApi.endpoint, 
      STATE.currentApi.method, 
      params
    );
    
    // Display response
    DOM.modal.content.textContent = JSON.stringify(response, null, 2);
    DOM.modal.spinner.classList.add("d-none");
    
    showToast("API request successful!", "success");
    
  } catch (error) {
    console.error("API request error:", error);
    DOM.modal.content.textContent = `Error: ${error.message}`;
    showToast(error.message || "API request failed", "error");
    
  } finally {
    DOM.modal.spinner.classList.add("d-none");
    DOM.modal.submitBtn.disabled = false;
    DOM.modal.submitBtn.innerHTML = `
      <span>Submit</span>
      <i class="fas fa-paper-plane ms-2"></i>
    `;
  }
}

// ======================
// Utility Functions
// ======================

/**
 * Show toast notification
 */
function showToast(message, type = "success") {
  const toast = new bootstrap.Toast(DOM.notificationToast);
  const toastBody = DOM.notificationToast.querySelector(".toast-body");
  
  // Set content and style
  toastBody.textContent = message;
  DOM.notificationToast.className = `toast show align-items-center text-bg-${type}`;
  
  // Show and auto-hide
  toast.show();
  setTimeout(() => toast.hide(), CONFIG.TOAST_DURATION);
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  } catch (err) {
    showToast("Failed to copy", "error");
  }
}

/**
 * Debounce function for performance
 */
function debounce(func, delay) {
  let timeout;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
  DOM.loadingScreen.classList.add("fade-out");
  setTimeout(() => {
    DOM.loadingScreen.style.display = "none";
    DOM.body.classList.remove("no-scroll");
  }, CONFIG.LOADING_DELAY);
}

// ======================
// Sample Data (Fallback)
// ======================

function getSampleEndpoints() {
  return [
    {
      id: 'users',
      name: 'Users API',
      method: 'GET',
      endpoint: '/users',
      description: 'Manage user accounts and profiles',
      parameters: [
        { name: 'userId', type: 'text', required: true, example: 'user123' }
      ]
    },
    {
      id: 'data',
      name: 'Data API',
      method: 'POST',
      endpoint: '/data',
      description: 'Store and retrieve application data',
      parameters: [
        { name: 'key', type: 'text', required: true, example: 'data_key' },
        { name: 'value', type: 'text', required: true, example: 'your_data' }
      ]
    }
  ];
}

// ======================
// Error Handling
// ======================

function displayErrorState(message = "Failed to load content") {
  DOM.apiContent.innerHTML = `
    <div class="error-state text-center py-5">
      <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
      <h4>${message}</h4>
      <button class="btn btn-primary mt-3" onclick="location.reload()">
        <i class="fas fa-sync-alt me-2"></i> Reload
      </button>
    </div>
  `;
}

function toggleNoResultsMessage(show) {
  let message = document.getElementById("noResultsMessage");
  
  if (show && !message) {
    message = document.createElement("div");
    message.id = "noResultsMessage";
    message.className = "no-results text-center py-4";
    message.innerHTML = `
      <i class="fas fa-search fa-3x mb-3"></i>
      <h4>No results found</h4>
      <p>Try different search terms</p>
    `;
    DOM.apiContent.appendChild(message);
  } else if (!show && message) {
    message.remove();
  }
}

// ======================
// Notification Functions
// ======================

async function loadNotifications() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/notifications`);
    if (!response.ok) throw new Error("Failed to load notifications");
    STATE.notifications = await response.json();
  } catch (error) {
    console.error("Error loading notifications:", error);
    STATE.notifications = [];
  }
}

function updateNotificationBadge() {
  const unreadCount = STATE.notifications.filter(n => !n.read).length;
  
  if (unreadCount > 0) {
    DOM.notificationBadge.textContent = unreadCount;
    DOM.notificationBadge.classList.add("active");
  } else {
    DOM.notificationBadge.classList.remove("active");
  }
}

// Initialize notification bell
DOM.notificationBell.addEventListener("click", () => {
  const unread = STATE.notifications.filter(n => !n.read);
  
  if (unread.length > 0) {
    showToast(`You have ${unread.length} unread notifications`, "info");
    // Mark as read (in a real app, you would update the server)
    STATE.notifications.forEach(n => n.read = true);
    updateNotificationBadge();
  } else {
    showToast("No new notifications", "info");
  }
});
