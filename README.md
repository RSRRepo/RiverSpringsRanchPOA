# River Springs Ranch POA SOP Library

This rebuilt website is designed for GitHub Pages and uses a single `index.html` entry point.

Upload every file and folder in this package to the repository root.

Required top-level items:
- index.html
- styles.css
- script.js
- .nojekyll
- documents/
- source/
- assets/

In GitHub: Settings → Pages → Deploy from a branch → main → / (root).

GitHub Pages paths are case-sensitive. Keep all supplied names exactly as packaged.


## Full-text search

The complete text of every editable ODT document has been extracted into `search-index.js`.

The website searches:
- document titles
- categories
- descriptions
- full document body text

Search results are ranked and include an excerpt around the matching word or phrase.

Whenever an ODT document changes, `search-index.js` must be regenerated so the website search reflects the updated wording.
