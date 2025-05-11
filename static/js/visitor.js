document.addEventListener('DOMContentLoaded', function() {
    const labelSelect = document.getElementById('labelSelect');
    const categorySelect = document.getElementById('categorySelect');
    const gallery = document.getElementById('gallery');
    const resetViewBtn = document.getElementById('resetViewBtn');
    const panzoomDebug = document.getElementById('panzoom-debug');
    const paginationContainer = document.getElementById('paginationContainer');
    let artworksData = null;
    const cutoutCache = {};
    let currentView = 'cutout'; // Track current view mode
    let isPanning = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let clickTimeout = null;
    let lastPanTime = 0;
    const PAN_COOLDOWN = 5000; // 5 seconds in milliseconds
    let hasPanned = false;
    let isDragging = false;
    
    // Pagination variables
    const ITEMS_PER_PAGE = 100;
    let currentPage = 1;
    let totalItems = 0;
    let totalPages = 1;
    let preloadedItems = new Map(); // Store preloaded items for each page

    // Function to update label options based on selected category
    function updateLabelOptions(selectedCategory) {
        // Clear existing options except "All"
        while (labelSelect.options.length > 1) {
            labelSelect.remove(1);
        }

        if (!artworksData) return;

        // Get unique labels for the selected category
        const labels = new Set();
        artworksData.forEach(artwork => {
            artwork.detections.forEach(detection => {
                if (selectedCategory === 'all' || detection.category === selectedCategory) {
                    labels.add(detection.label);
                }
            });
        });

        // Add new options
        Array.from(labels).sort().forEach(label => {
            const option = document.createElement('option');
            option.value = label;
            option.textContent = label;
            labelSelect.appendChild(option);
        });
    }

    // Fetch available labels and artworks data
    async function initializeData() {
        try {
            // Fetch artworks data first
            const artworksResponse = await fetch('/api/artworks');
            artworksData = await artworksResponse.json();

            // Populate category select with unique categories
            const categories = new Set();
            artworksData.forEach(artwork => {
                artwork.detections.forEach(detection => {
                    if (detection.category) {
                        categories.add(detection.category);
                    }
                });
            });
            Array.from(categories).sort().forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categorySelect.appendChild(option);
            });

            // Initialize label options for 'all' category
            updateLabelOptions('all');

            // Display all cutouts initially
            displayContent('all', 'all');
        } catch (error) {
            console.error('Error initializing data:', error);
        }
    }

    // Create cutout image from bbox coordinates
    function createCutoutImage(imageUrl, bbox) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate dimensions while maintaining aspect ratio
                const bboxWidth = bbox[2] - bbox[0];
                const bboxHeight = bbox[3] - bbox[1];
                
                // Set canvas size to match bbox dimensions
                canvas.width = bboxWidth;
                canvas.height = bboxHeight;
                
                // Draw the cutout
                ctx.drawImage(
                    img,
                    bbox[0], bbox[1], bboxWidth, bboxHeight, // Source coordinates
                    0, 0, bboxWidth, bboxHeight // Destination coordinates
                );
                
                resolve({
                    dataUrl: canvas.toDataURL(),
                    width: bboxWidth,
                    height: bboxHeight
                });
            };
            img.onerror = reject;
            img.src = imageUrl;
        });
    }

    function getCutoutKey(imageUrl, bbox, label) {
        return `${imageUrl}|${bbox.join(',')}|${label}`;
    }

    async function getOrCreateCutout(imageUrl, bbox, label) {
        const key = getCutoutKey(imageUrl, bbox, label);
        if (cutoutCache[key]) {
            return cutoutCache[key];
        }
        const cutout = await createCutoutImage(imageUrl, bbox);
        cutoutCache[key] = cutout;
        return cutout;
    }

    // Fit all cutouts within the viewport
    function fitCutoutsToViewport(cutouts) {
        const viewport = document.querySelector('.gallery-viewport');
        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        const n = cutouts.length;
        if (n === 0) return [];

        // Get all aspect ratios
        const aspectRatios = cutouts.map(c => c.width / c.height);
        // Try to find the best grid (rows x cols) to fit all cutouts
        let bestRows = 1, bestCols = n, bestSize = 0;
        for (let rows = 1; rows <= n; rows++) {
            const cols = Math.ceil(n / rows);
            // Estimate max cell width/height
            let maxCellWidth = viewportWidth / cols;
            let maxCellHeight = viewportHeight / rows;
            // Find the scale for each cutout
            let scale = Infinity;
            for (let i = 0; i < n; i++) {
                const ar = aspectRatios[i];
                const w = Math.min(maxCellWidth, maxCellHeight * ar);
                const h = w / ar;
                scale = Math.min(scale, w / cutouts[i].width, h / cutouts[i].height);
            }
            // Calculate used area
            const totalWidth = cols * maxCellWidth;
            const totalHeight = rows * maxCellHeight;
            if (scale > bestSize && totalWidth <= viewportWidth + 1 && totalHeight <= viewportHeight + 1) {
                bestRows = rows;
                bestCols = cols;
                bestSize = scale;
            }
        }

        // Calculate cell dimensions accounting for the 8px gap
        const gap = 8;
        let cellWidth = (viewportWidth - (bestCols - 1) * gap) / bestCols;
        let cellHeight = (viewportHeight - (bestRows - 1) * gap) / bestRows;

        return cutouts.map((cutout, i) => {
            const ar = aspectRatios[i];
            let w = Math.min(cellWidth, cellHeight * ar);
            let h = w / ar;
            return { ...cutout, displayWidth: w, displayHeight: h };
        });
    }

    // Function to preload items for a specific page
    async function preloadPageItems(pageNumber, matchingItems) {
        if (pageNumber > totalPages) return;
        
        const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
        const pageItems = matchingItems.slice(startIndex, endIndex);

        const items = [];
        for (const item of pageItems) {
            if (item.type === 'cutout') {
                try {
                    const cutout = await getOrCreateCutout(
                        item.artwork.image_url,
                        item.detection.bbox,
                        item.detection.label
                    );
                    cutout.originalImageUrl = item.artwork.image_url;
                    items.push(cutout);
                } catch (error) {
                    console.error('Error creating cutout:', error);
                }
            } else {
                items.push({
                    url: item.artwork.image_url,
                    width: item.artwork.width || 800,
                    height: item.artwork.height || 600
                });
            }
        }

        // Store the preloaded items
        preloadedItems.set(pageNumber, items);
    }

    // Display cutouts or full images based on current view
    async function displayContent(label, category) {
        gallery.innerHTML = '';
        if (!artworksData) return;

        // Create modal element if it doesn't exist
        let modal = document.getElementById('imageModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'imageModal';
            modal.style.display = 'none';
            modal.style.position = 'fixed';
            modal.style.zIndex = '1000';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
            modal.style.cursor = 'pointer';
            document.body.appendChild(modal);

            modal.addEventListener('click', function() {
                modal.style.display = 'none';
            });
        }

        function showModal(imageUrl) {
            // If we're in the middle of a drag operation, don't show the modal
            if (isDragging) {
                console.log('Ignoring click during drag');
                return;
            }
            
            // If we've panned and it's been less than 5 seconds, don't show the modal
            if (hasPanned && Date.now() - lastPanTime < PAN_COOLDOWN) {
                console.log('Too soon after panning, ignoring click');
                return;
            }

            console.log('Showing modal for:', imageUrl);
            const modalImg = document.createElement('img');
            modalImg.src = imageUrl;
            modalImg.style.maxWidth = '90%';
            modalImg.style.maxHeight = '90%';
            modalImg.style.margin = 'auto';
            modalImg.style.display = 'block';
            modalImg.style.position = 'absolute';
            modalImg.style.top = '50%';
            modalImg.style.left = '50%';
            modalImg.style.transform = 'translate(-50%, -50%)';
            
            modal.innerHTML = '';
            modal.appendChild(modalImg);
            modal.style.display = 'block';
        }

        // First, collect all matching detections/artworks without creating cutouts
        let matchingItems = [];
        if (currentView === 'cutout') {
            // Collect all matching detections first
            for (const artwork of artworksData) {
                const detections = artwork.detections.filter(detection => {
                    const labelMatch = !label || label === 'all' || detection.label === label;
                    const categoryMatch = !category || category === 'all' || detection.category === category;
                    return labelMatch && categoryMatch;
                });
                
                for (const detection of detections) {
                    matchingItems.push({
                        type: 'cutout',
                        artwork: artwork,
                        detection: detection
                    });
                }
            }
        } else {
            // Collect all matching artworks
            for (const artwork of artworksData) {
                const hasMatchingDetection = artwork.detections.some(detection => {
                    const labelMatch = !label || label === 'all' || detection.label === label;
                    const categoryMatch = !category || category === 'all' || detection.category === category;
                    return labelMatch && categoryMatch;
                });

                if (hasMatchingDetection) {
                    matchingItems.push({
                        type: 'image',
                        artwork: artwork
                    });
                }
            }
        }

        // Update pagination info
        totalItems = matchingItems.length;
        totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        currentPage = Math.min(currentPage, totalPages);
        if (currentPage < 1) currentPage = 1;

        // Clear preloaded items when filters change
        preloadedItems.clear();

        // Load current page and preload next page
        let items;
        if (preloadedItems.has(currentPage)) {
            // Use preloaded items if available
            items = preloadedItems.get(currentPage);
            preloadedItems.delete(currentPage);
        } else {
            // Load current page items
            items = await loadPageItems(currentPage, matchingItems);
        }

        // Preload next page if available
        if (currentPage < totalPages) {
            preloadPageItems(currentPage + 1, matchingItems);
        }

        // Fit items to viewport
        const fittedItems = fitCutoutsToViewport(items);

        // Display items
        fittedItems.forEach(item => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'artwork-item-container';
            imgContainer.style.width = item.displayWidth + 'px';
            imgContainer.style.height = item.displayHeight + 'px';
            const img = document.createElement('img');
            img.src = currentView === 'cutout' ? item.dataUrl : item.url;
            img.className = 'artwork-item';
            img.alt = currentView === 'cutout' ? 'Cutout' : 'Full artwork';
            img.style.cursor = 'pointer';
            
            img.addEventListener('click', function(e) {
                console.log('Item clicked');
                e.preventDefault();
                e.stopPropagation();
                showModal(currentView === 'cutout' ? item.originalImageUrl : item.url);
            });
            
            imgContainer.appendChild(img);
            gallery.appendChild(imgContainer);
        });

        // Update pagination controls
        const prevButton = document.getElementById('prevPage');
        const nextButton = document.getElementById('nextPage');
        const pageSpan = paginationContainer.querySelector('span');

        prevButton.disabled = currentPage === 1;
        nextButton.disabled = currentPage === totalPages;
        pageSpan.textContent = `Page ${currentPage} of ${totalPages}`;

        // Add event listeners for pagination buttons
        prevButton.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                displayContent(labelSelect.value, categorySelect.value);
            }
        };

        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                displayContent(labelSelect.value, categorySelect.value);
            }
        };

        // Initialize or re-initialize panzoom on #gallery
        if (window.panzoomInstance) {
            window.panzoomInstance.destroy();
            window.panzoomInstance = null;
        }
        if (typeof Panzoom !== 'undefined') {
            window.panzoomInstance = Panzoom(gallery, {
                maxScale: 20,
                minScale: 0.2,
                contain: 'outside'
            });
            
            // Add panzoom event listeners
            gallery.addEventListener('mousedown', function(e) {
                startX = e.clientX;
                startY = e.clientY;
                isDragging = true;
                hasPanned = false;
            });

            gallery.addEventListener('mousemove', function(e) {
                if (isDragging && (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5)) {
                    hasPanned = true;
                    lastPanTime = Date.now();
                }
            });

            gallery.addEventListener('mouseup', function() {
                isDragging = false;
            });

            gallery.addEventListener('mouseleave', function() {
                isDragging = false;
            });
            
            gallery.parentElement.addEventListener('wheel', window.panzoomInstance.zoomWithWheel);
            panzoomDebug.textContent = 'Panzoom initialized. Try zooming and panning!';
            console.log('Panzoom initialized on #gallery');
        } else {
            panzoomDebug.textContent = 'Panzoom library not loaded!';
            console.error('Panzoom library not loaded!');
        }
    }

    // Helper function to load items for a specific page
    async function loadPageItems(pageNumber, matchingItems) {
        const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
        const pageItems = matchingItems.slice(startIndex, endIndex);

        const items = [];
        for (const item of pageItems) {
            if (item.type === 'cutout') {
                try {
                    const cutout = await getOrCreateCutout(
                        item.artwork.image_url,
                        item.detection.bbox,
                        item.detection.label
                    );
                    cutout.originalImageUrl = item.artwork.image_url;
                    items.push(cutout);
                } catch (error) {
                    console.error('Error creating cutout:', error);
                }
            } else {
                items.push({
                    url: item.artwork.image_url,
                    width: item.artwork.width || 800,
                    height: item.artwork.height || 600
                });
            }
        }
        return items;
    }

    // Event listeners for label and category selection
    labelSelect.addEventListener('change', function() {
        currentPage = 1; // Reset to first page when filters change
        displayContent(this.value, categorySelect.value);
    });

    categorySelect.addEventListener('change', function() {
        currentPage = 1; // Reset to first page when filters change
        const selectedCategory = this.value;
        updateLabelOptions(selectedCategory);
        displayContent(labelSelect.value, selectedCategory);
    });

    // View toggle button click handler
    document.getElementById('viewToggleBtn').addEventListener('click', function() {
        currentPage = 1; // Reset to first page when view changes
        currentView = currentView === 'cutout' ? 'image' : 'cutout';
        this.textContent = currentView === 'cutout' ? 'Switch to Image View' : 'Switch to Cutout View';
        displayContent(labelSelect.value, categorySelect.value);
    });

    // Reset View button
    resetViewBtn.addEventListener('click', function() {
        if (window.panzoomInstance) {
            window.panzoomInstance.reset();
            panzoomDebug.textContent = 'View reset.';
        }
    });

    // Initialize the page
    initializeData();
});
