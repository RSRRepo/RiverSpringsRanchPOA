const documents = window.RSR_SEARCH_INDEX || [];

const views = document.querySelectorAll("[data-view-panel]");
const navButtons = document.querySelectorAll(".nav-link[data-view]");
const allViewButtons = document.querySelectorAll("[data-view]");
const sidebar = document.getElementById("sidebar");
const menuButton = document.getElementById("mobile-menu-button");
const overlay = document.getElementById("sidebar-overlay");
const searchInput = document.getElementById("menu-search");
const clearSearchButton = document.getElementById("clear-search");
const noResults = document.getElementById("no-results");
const themeButton = document.getElementById("theme-button");
const mainContent = document.getElementById("main-content");
const searchResultsPanel = document.getElementById("search-results-panel");
const searchResults = document.getElementById("search-results");
const searchResultCount = document.getElementById("search-result-count");
const sidebarNavigation = document.getElementById("sidebar-navigation");

function closeMobileMenu() {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
  menuButton.setAttribute("aria-expanded", "false");
}

function setActiveNavigation(viewName) {
  navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
}

function showView(viewName, updateHash = true) {
  const record = documents.find((item) => item.id === viewName);

  if (record) {
    populateDocumentView(record);
    viewName = "document";
  }

  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === viewName);
  });

  setActiveNavigation(record ? record.id : viewName);

  if (updateHash) {
    history.replaceState(null, "", `#${record ? record.id : viewName}`);
  }

  mainContent.scrollTop = 0;
  mainContent.focus({ preventScroll: true });

  if (window.innerWidth <= 760) {
    closeMobileMenu();
  }
}

function populateDocumentView(record) {
  document.getElementById("document-breadcrumb").textContent = record.title;
  document.getElementById("document-category").textContent = record.category;
  document.getElementById("document-title").textContent = record.title;
  document.getElementById("document-description").textContent = record.description;
  document.getElementById("open-pdf").href = record.pdf;

  const odt = document.getElementById("download-odt");
  odt.href = record.odt;
  odt.setAttribute("download", "");

  const frame = document.getElementById("pdf-frame");
  frame.src = `${record.pdf}#view=FitH`;
  frame.title = `${record.title} PDF preview`;
}

function buildDocumentLibrary() {
  const grid = document.getElementById("document-grid");
  grid.innerHTML = documents.map((item) => `
    <article class="document-card">
      <span class="category">${escapeHtml(item.category)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.description)}</p>
      <div class="document-card-actions">
        <button class="open-detail" type="button" data-open-document="${item.id}">View Details</button>
        <a class="open-file" href="${item.pdf}" target="_blank" rel="noopener">Open PDF</a>
        <a class="open-file" href="${item.odt}" download>Download ODT</a>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-open-document]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.openDocument));
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(query) {
  return normalize(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function scoreDocument(doc, terms) {
  const title = normalize(doc.title);
  const category = normalize(doc.category);
  const description = normalize(doc.description);
  const content = normalize(doc.content);
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 40;
    if (category.includes(term)) score += 18;
    if (description.includes(term)) score += 10;

    const occurrences = content.split(term).length - 1;
    score += Math.min(occurrences, 20) * 2;
  }

  const phrase = terms.join(" ");
  if (phrase && title.includes(phrase)) score += 60;
  if (phrase && description.includes(phrase)) score += 25;
  if (phrase && content.includes(phrase)) score += 35;

  return score;
}

function makeSnippet(content, terms) {
  const plain = String(content).replace(/\s+/g, " ").trim();
  const lower = normalize(plain);

  let firstIndex = -1;
  let matchedTerm = "";

  for (const term of terms) {
    const index = lower.indexOf(term);
    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
      matchedTerm = term;
    }
  }

  if (firstIndex === -1) {
    return escapeHtml(plain.slice(0, 220)) + (plain.length > 220 ? "…" : "");
  }

  const start = Math.max(0, firstIndex - 90);
  const end = Math.min(plain.length, firstIndex + Math.max(150, matchedTerm.length + 110));
  let snippet = plain.slice(start, end);

  if (start > 0) snippet = "…" + snippet;
  if (end < plain.length) snippet += "…";

  let escaped = escapeHtml(snippet);

  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    escaped = escaped.replace(new RegExp(`(${safeTerm})`, "gi"), "<mark>$1</mark>");
  }

  return escaped;
}

function runFullTextSearch() {
  const query = searchInput.value.trim();
  const terms = tokenize(query);

  if (!query || terms.length === 0) {
    searchResultsPanel.hidden = true;
    sidebarNavigation.classList.remove("search-active");
    noResults.hidden = true;
    return;
  }

  const matches = documents
    .map((doc) => ({ doc, score: scoreDocument(doc, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));

  searchResultsPanel.hidden = false;
  sidebarNavigation.classList.add("search-active");
  searchResultCount.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"}`;

  if (matches.length === 0) {
    searchResults.innerHTML = "";
    noResults.hidden = false;
    return;
  }

  noResults.hidden = true;
  searchResults.innerHTML = matches.map(({ doc }) => `
    <button class="search-result" type="button" data-search-document="${doc.id}">
      <span class="search-result-title">${escapeHtml(doc.title)}</span>
      <span class="search-result-category">${escapeHtml(doc.category)}</span>
      <span class="search-result-snippet">${makeSnippet(doc.content, terms)}</span>
    </button>
  `).join("");

  searchResults.querySelectorAll("[data-search-document]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.searchDocument));
  });
}

allViewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.view) showView(button.dataset.view);
  });
});

document.querySelectorAll(".nav-group-heading").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest(".nav-group");
    const collapsed = group.classList.toggle("collapsed");
    button.setAttribute("aria-expanded", String(!collapsed));
    button.querySelector(".expand-symbol").textContent = collapsed ? "+" : "−";
  });
});

menuButton.addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");
  overlay.classList.toggle("show", open);
  menuButton.setAttribute("aria-expanded", String(open));
});

overlay.addEventListener("click", closeMobileMenu);
searchInput.addEventListener("input", runFullTextSearch);

clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  runFullTextSearch();
  searchInput.focus();
});

themeButton.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("rsr-theme", next);
  } catch (error) {}
});

document.getElementById("print-page").addEventListener("click", () => window.print());

window.addEventListener("hashchange", () => {
  const requested = location.hash.slice(1);
  if (requested) showView(requested, false);
});

buildDocumentLibrary();

const initial = location.hash.slice(1) || "home";
const valid =
  ["home", "library", "guide"].includes(initial) ||
  documents.some((item) => item.id === initial);

showView(valid ? initial : "home", false);
