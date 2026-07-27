const documents = Array.isArray(window.RSR_SEARCH_INDEX)
  ? window.RSR_SEARCH_INDEX
  : [];

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
  sidebar?.classList.remove("open");
  overlay?.classList.remove("show");
  menuButton?.setAttribute("aria-expanded", "false");
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

  if (window.innerWidth <= 760) closeMobileMenu();
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
  Search normalization:
  - ignores capitalization and accents
  - treats curly and straight apostrophes alike
  - treats punctuation, slashes, underscores, dashes and line breaks as spaces
  - joins repeated whitespace
  This makes words searchable even when an ODT split them across formatting runs.
*/
function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/&/g, " and ")
    .replace(/[_/\\–—-]+/g, " ")
    .replace(/[^a-zA-Z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenizeQuery(query) {
  return normalizeSearchText(query)
    .split(" ")
    .filter(Boolean);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let position = 0;

  while ((position = haystack.indexOf(needle, position)) !== -1) {
    count += 1;
    position += Math.max(needle.length, 1);
  }

  return count;
}

function prepareDocument(doc) {
  const title = normalizeSearchText(doc.title);
  const category = normalizeSearchText(doc.category);
  const description = normalizeSearchText(doc.description);
  const content = normalizeSearchText(doc.content);

  return {
    ...doc,
    _title: title,
    _category: category,
    _description: description,
    _content: content,
    _all: `${title} ${category} ${description} ${content}`.trim()
  };
}

const searchableDocuments = documents.map(prepareDocument);

function termMatches(text, term) {
  if (text.includes(term)) return true;

  // Small amount of plural/prefix tolerance without using an external library.
  if (term.length >= 4) {
    const singular = term.endsWith("s") ? term.slice(0, -1) : term;
    if (singular.length >= 4 && text.includes(singular)) return true;
  }

  return false;
}

function scoreDocument(doc, terms, normalizedPhrase) {
  // Every entered term must occur somewhere in the document.
  if (!terms.every((term) => termMatches(doc._all, term))) return 0;

  let score = 1;

  for (const term of terms) {
    if (termMatches(doc._title, term)) score += 80;
    if (termMatches(doc._category, term)) score += 35;
    if (termMatches(doc._description, term)) score += 20;

    const occurrences = countOccurrences(doc._content, term);
    score += Math.min(occurrences, 50) * 4;
  }

  if (normalizedPhrase) {
    if (doc._title.includes(normalizedPhrase)) score += 160;
    if (doc._description.includes(normalizedPhrase)) score += 70;
    if (doc._content.includes(normalizedPhrase)) score += 100;
  }

  return score;
}

function locateBestMatch(content, terms, normalizedPhrase) {
  const plain = String(content ?? "").replace(/\s+/g, " ").trim();
  const normalized = normalizeSearchText(plain);

  const candidates = [];
  if (normalizedPhrase) candidates.push(normalizedPhrase);
  candidates.push(...terms);

  let best = null;
  for (const candidate of candidates) {
    const position = normalized.indexOf(candidate);
    if (position !== -1 && (!best || position < best.position)) {
      best = { position, candidate };
    }
  }

  return { plain, normalized, best };
}

function highlightSnippet(snippet, terms) {
  let output = escapeHtml(snippet);

  const uniqueTerms = [...new Set(terms)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const term of uniqueTerms) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(
      new RegExp(`(${escapedTerm})`, "gi"),
      "<mark>$1</mark>"
    );
  }

  return output;
}

function makeSnippet(content, terms, normalizedPhrase) {
  const { plain, normalized, best } = locateBestMatch(
    content,
    terms,
    normalizedPhrase
  );

  if (!plain) return "No text was extracted from this document.";

  if (!best) {
    const fallback = plain.slice(0, 260);
    return escapeHtml(fallback) + (plain.length > 260 ? "…" : "");
  }

  /*
    The normalized and original strings may differ slightly because punctuation
    is removed. Find the matching word in the original text when possible.
  */
  const originalLower = plain.toLowerCase();
  const candidateWords = best.candidate.split(" ").filter(Boolean);
  let originalPosition = -1;

  for (const word of candidateWords) {
    originalPosition = originalLower.indexOf(word.toLowerCase());
    if (originalPosition !== -1) break;
  }

  if (originalPosition === -1) {
    originalPosition = Math.min(best.position, plain.length - 1);
  }

  const start = Math.max(0, originalPosition - 115);
  const end = Math.min(plain.length, originalPosition + 210);
  let snippet = plain.slice(start, end);

  if (start > 0) snippet = `…${snippet}`;
  if (end < plain.length) snippet = `${snippet}…`;

  return highlightSnippet(snippet, terms);
}

function runFullTextSearch() {
  const rawQuery = searchInput.value.trim();
  const normalizedPhrase = normalizeSearchText(rawQuery);
  const terms = tokenizeQuery(rawQuery);

  if (!rawQuery || terms.length === 0) {
    searchResultsPanel.hidden = true;
    sidebarNavigation.classList.remove("search-active");
    noResults.hidden = true;
    searchResults.innerHTML = "";
    searchResultCount.textContent = "";
    return;
  }

  const matches = searchableDocuments
    .map((doc) => ({
      doc,
      score: scoreDocument(doc, terms, normalizedPhrase)
    }))
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.doc.title.localeCompare(b.doc.title)
    );

  searchResultsPanel.hidden = false;
  sidebarNavigation.classList.add("search-active");
  searchResultCount.textContent =
    `${matches.length} document${matches.length === 1 ? "" : "s"}`;

  if (matches.length === 0) {
    searchResults.innerHTML = `
      <p class="search-empty">
        No document contains all of the entered words.
      </p>
    `;
    noResults.hidden = false;
    return;
  }

  noResults.hidden = true;

  searchResults.innerHTML = matches.map(({ doc }) => `
    <button
      class="search-result"
      type="button"
      data-search-document="${escapeHtml(doc.id)}"
    >
      <span class="search-result-title">${escapeHtml(doc.title)}</span>
      <span class="search-result-category">${escapeHtml(doc.category)}</span>
      <span class="search-result-snippet">
        ${makeSnippet(doc.content, terms, normalizedPhrase)}
      </span>
    </button>
  `).join("");

  searchResults
    .querySelectorAll("[data-search-document]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        showView(button.dataset.searchDocument);
      });
    });
}

function buildDocumentLibrary() {
  const grid = document.getElementById("document-grid");

  grid.innerHTML = documents.map((item) => `
    <article class="document-card">
      <span class="category">${escapeHtml(item.category)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.description)}</p>
      <div class="document-card-actions">
        <button
          class="open-detail"
          type="button"
          data-open-document="${escapeHtml(item.id)}"
        >
          View Details
        </button>
        <a
          class="open-file"
          href="${item.pdf}"
          target="_blank"
          rel="noopener"
        >
          Open PDF
        </a>
        <a class="open-file" href="${item.odt}" download>
          Download ODT
        </a>
      </div>
    </article>
  `).join("");

  grid.querySelectorAll("[data-open-document]").forEach((button) => {
    button.addEventListener("click", () => {
      showView(button.dataset.openDocument);
    });
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
    button.querySelector(".expand-symbol").textContent =
      collapsed ? "+" : "−";
  });
});

menuButton?.addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");
  overlay.classList.toggle("show", open);
  menuButton.setAttribute("aria-expanded", String(open));
});

overlay?.addEventListener("click", closeMobileMenu);
searchInput?.addEventListener("input", runFullTextSearch);

clearSearchButton?.addEventListener("click", () => {
  searchInput.value = "";
  runFullTextSearch();
  searchInput.focus();
});

themeButton?.addEventListener("click", () => {
  const current =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;

  try {
    localStorage.setItem("rsr-theme", next);
  } catch (error) {}
});




const printDocumentButton = document.getElementById("print-document");

printDocumentButton?.addEventListener("click", () => {
  const pdfUrl = document.getElementById("open-pdf")?.href;

  if (!pdfUrl || pdfUrl.endsWith("#")) {
    alert("No PDF document is currently selected.");
    return;
  }

  /*
    Browser PDF viewers control their own printing. Opening the PDF directly
    ensures the browser prints the document pages rather than a screenshot of
    the surrounding website. Automatic opening of the print dialog is not
    reliable across Chrome, Safari, Firefox, and mobile browsers.
  */
  const pdfWindow = window.open(pdfUrl, "_blank", "noopener");

  if (!pdfWindow) {
    window.location.href = pdfUrl;
  }
});

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
