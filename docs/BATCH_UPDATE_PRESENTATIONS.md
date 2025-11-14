# Batch Update Guide for CSP Compliance

This guide explains how to update additional presentation files for CSP compliance using the automated tools created in this PR.

## Overview

This PR includes an automated batch update script that can update presentation HTML files to be CSP-compliant by:
1. Adding reference to external `presentation-nav.js`
2. Removing inline `<script>` blocks
3. Removing `onclick` and other inline event attributes
4. Adding appropriate CSS classes (`nav-prev`, `nav-next`, `nav-home`)
5. Adding `aria-label` attributes for accessibility
6. Adding `data-slide-index` and `data-slide-total` attributes

## Automated Batch Update

### Step 1: Run the Batch Script

```bash
# Dry run first to see what would be changed
node scripts/batch-update-presentations.cjs --dry-run

# Apply the changes
node scripts/batch-update-presentations.cjs
```

The script automatically processes all HTML files in `site/presentations/` (excluding `index.html` files).

### Step 2: Verify Changes

```bash
# Check for remaining inline script violations
npm run check:inline-scripts
```

### Step 3: Manual Cleanup (if needed)

Some edge cases may need manual fixes:

#### Common Issues:

**1. Index.html redirect files with inline scripts:**
```bash
# Remove location.replace inline scripts
find site/presentations -name "index.html" -exec sed -i 's|<script>location\.replace("[^"]*");</script>||g' {} \;
```

**2. Site.js loader scripts:**
These inline scripts load site.css and site.js dynamically and should be replaced with static links:
```html
<!-- Remove this: -->
<script>
  (function(){
    var root = location.pathname.indexOf('/site/') >= 0 ? ...
    // ... loader code
  })();
</script>

<!-- Add this instead: -->
<link rel="stylesheet" href="/assets/css/theme.css"/>
<script src="/assets/js/section-nav.js" defer></script>
```

**3. Different function names for navigation:**
If presentations use `previousSlide()` or `nextSlide()` instead of `changeSlide()`:
```bash
# Remove these onclick handlers
sed -i 's/onclick="previousSlide()"//g' site/presentations/*/presentation-*.html
sed -i 's/onclick="nextSlide()"//g' site/presentations/*/presentation-*.html
```

## Manual Update Process

For files that the batch script doesn't handle, follow this manual process:

### 1. Add External Script Reference

In the `<head>` section, after the `<title>` tag:
```html
<script src="/site/assets/js/presentation-nav.js" defer></script>
```

### 2. Add Data Attributes

On the presentation container `<div>`:
```html
<div class="presentation-container" data-slide-index="11" data-slide-total="13">
```

### 3. Update Navigation Buttons

Replace:
```html
<button class="nav-btn" id="prevBtn" onclick="changeSlide(-1)">Previous</button>
<button class="nav-btn" id="nextBtn" onclick="changeSlide(1)">Next</button>
```

With:
```html
<button class="nav-btn nav-prev" aria-label="Previous slide">Previous</button>
<button class="nav-btn nav-next" aria-label="Next slide">Next</button>
```

### 4. Update Home Button

Add the `nav-home` class:
```html
<a href="/language-arts/" class="home-btn nav-home" aria-label="Return to Language Arts Home">Language Arts Home</a>
```

### 5. Remove Inline Script Block

Delete the entire `<script>` block at the end of the file that contains:
- `changeSlide()` function
- `showSlide()` function
- Keyboard event listeners
- Background slideshow logic

All this functionality is now in `presentation-nav.js`.

### 6. Add Background Images Data (if applicable)

If the presentation has a background slideshow, add the image list as a data attribute:
```html
<div class="bg-slideshow" id="bgSlideshow" data-images='["image1.jpg","image2.jpg","image3.jpg"]'></div>
```

## Testing

After making changes, test the presentation:

### 1. Check for Violations
```bash
npm run check:inline-scripts | grep -A 3 "your-presentation-file.html"
```

### 2. Visual Inspection
Open the presentation in a browser and verify:
- [ ] No CSP violations in console (F12 → Console)
- [ ] Previous button is disabled on first slide
- [ ] Next button is disabled on last slide
- [ ] Previous/Next buttons navigate correctly
- [ ] Home button works
- [ ] Keyboard navigation works (Arrow keys, Space)
- [ ] Background slideshow works (if applicable)

### 3. Accessibility Check
- [ ] Previous/Next buttons have `aria-label` attributes
- [ ] Disabled buttons have `aria-disabled="true"`
- [ ] All buttons are `<button>` elements (not divs with click handlers)

## Troubleshooting

### Issue: Buttons don't work

**Cause:** JavaScript file not loaded or wrong class names

**Fix:** 
1. Check that `<script src="/site/assets/js/presentation-nav.js" defer></script>` is in the `<head>`
2. Verify button class names are exactly: `nav-prev`, `nav-next`, `nav-home`
3. Check browser console for JavaScript errors

### Issue: Slides don't advance

**Cause:** Slide elements don't have the `.slide` class

**Fix:** Ensure all slide divs have `class="slide"` and the first one also has `class="slide active"`

### Issue: Background images don't rotate

**Cause:** Missing `data-images` attribute or wrong element ID

**Fix:** 
1. Add `data-images` attribute to the background slideshow element
2. Ensure the element has `id="bgSlideshow"`

## Extending to Other Presentation Sets

To update Life Skills or Language Arts Toolkit presentations:

1. Update the `PRESENTATIONS_DIR` in `scripts/batch-update-presentations.cjs` if needed
2. Run the batch script
3. Update `site/assets/data/presentations.json` to include the new presentations
4. Test each presentation individually

## Reference Implementation

See `site/presentations/a-door-into-time/presentation-11/Week_11_HTML_Presentation_Multiple_Perspectives (2).html` for a complete reference implementation.

## Additional Resources

- CSP Documentation: See `netlify.toml` for the enforced CSP policy
- JavaScript API: See comments in `site/assets/js/presentation-nav.js`
- Inline Script Checker: `scripts/check-inline-scripts.cjs`
