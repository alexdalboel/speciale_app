document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    
    // Theme toggle functionality
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle.querySelector('i');
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeIcon.className = savedTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
    
    // Theme toggle click handler
    themeToggle.addEventListener('click', function() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Update icon
        themeIcon.className = newTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        
        // Hide tooltip after click
        if (this._tooltipInstance) {
            this._tooltipInstance.hide();
            this.blur();
            this.setAttribute('data-bs-original-title', '');
            setTimeout(() => {
                this.setAttribute('data-bs-original-title', 'Toggle theme');
            }, 500);
        }
    });
    
    // Initialize all DOM elements
    const labelSelect = document.getElementById('labelSelect');
    const categorySelect = document.getElementById('categorySelect');
    const yearSelect = document.getElementById('yearSelect');
    const artistSelect = document.getElementById('artistSelect');
    const databaseSelect = document.getElementById('databaseSelect');
    const locationSelect = document.getElementById('locationSelect');
    const gallery = document.getElementById('gallery');
    const resetViewBtn = document.getElementById('resetViewBtn');
    const panzoomDebug = document.getElementById('panzoom-debug');
    const paginationContainer = document.getElementById('paginationContainer');
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');

    // Log all found elements
    console.log('Found elements:', {
        labelSelect: !!labelSelect,
        categorySelect: !!categorySelect,
        yearSelect: !!yearSelect,
        artistSelect: !!artistSelect,
        databaseSelect: !!databaseSelect,
        locationSelect: !!locationSelect,
        gallery: !!gallery,
        resetViewBtn: !!resetViewBtn,
        panzoomDebug: !!panzoomDebug,
        paginationContainer: !!paginationContainer,
        viewToggleBtn: !!viewToggleBtn,
        resetFiltersBtn: !!resetFiltersBtn
    });

    // Check if required elements exist
    if (!gallery) {
        console.error('Gallery element not found');
        return;
    }

    let artworksData = null;
    const cutoutCache = {};
    let currentView = 'image'; // Track current view mode
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

    // Function to get current filter values safely
    function getCurrentFilterValues() {
        return {
            label: labelSelect ? labelSelect.value : 'all',
            category: categorySelect ? categorySelect.value : 'all',
            year: yearSelect ? yearSelect.value : 'all',
            artist: artistSelect ? artistSelect.value : 'all',
            database: databaseSelect ? databaseSelect.value : 'all',
            location: locationSelect ? locationSelect.value : 'all'
        };
    }

    // Helper to set dropdown options and keep current selection if valid
    function setDropdownOptions(selectElem, options, currentValue) {
        if (!selectElem) return;
        // Save current value
        const prevValue = currentValue || selectElem.value;
        // Remove all except 'All'
        while (selectElem.options.length > 1) {
            selectElem.remove(1);
        }
        // Add new options
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            selectElem.appendChild(option);
        });
        // Restore previous value if still valid
        if (prevValue !== 'all' && options.includes(prevValue)) {
            selectElem.value = prevValue;
        } else {
            selectElem.value = 'all';
        }
    }

    // Function to populate all filter options based on current selections
    function populateAllFilterOptions() {
        if (!artworksData) return;
        const filters = getCurrentFilterValues();
        // Filter artworks based on all current filters except the one being updated
        const filteredArtworks = artworksData.filter(artwork => {
            // Year
            if (filters.year !== 'all' && artwork.Year !== filters.year) return false;
            // Artist
            if (filters.artist !== 'all' && artwork.Artist !== filters.artist) return false;
            // Database
            if (filters.database !== 'all' && artwork.Database !== filters.database) return false;
            // Location
            if (filters.location !== 'all' && artwork.Location !== filters.location) return false;
            // Category/Label handled below
            return true;
        });
        // For each dropdown, collect unique values from filteredArtworks
        const years = new Set();
        const artists = new Set();
        const databases = new Set();
        const locations = new Set();
        const categories = new Set(['random']);
        const labels = new Set();
        filteredArtworks.forEach(artwork => {
            // Year
            if (
                artwork.Year &&
                artwork.Year !== "Unknown" &&
                /^\d{4}$/.test(artwork.Year.trim())
            ) {
                years.add(artwork.Year.trim());
            }
            // Artist
            if (artwork.Artist && artwork.Artist !== "Unknown") {
                artists.add(artwork.Artist);
            }
            // Database
            if (artwork.Database && artwork.Database !== "Unknown") {
                databases.add(artwork.Database);
            }
            // Location
            if (artwork.Location && artwork.Location !== "Unknown") {
                locations.add(artwork.Location);
            }
            // Add categories and labels based on current filters
            artwork.detections.forEach(detection => {
                // For categories: if we have a label filter, only add categories that match that label
                if (detection.category) {
                    if (filters.label === 'all' || detection.label === filters.label) {
                        categories.add(detection.category);
                    }
                }
                // For labels: if we have a category filter, only add labels that match that category
                if (detection.label) {
                    if (filters.category === 'all' || filters.category === 'random' || detection.category === filters.category) {
                        labels.add(detection.label);
                    }
                }
            });
        });
        // Update dropdowns
        setDropdownOptions(yearSelect, Array.from(years).sort(), filters.year);
        setDropdownOptions(artistSelect, Array.from(artists).sort(), filters.artist);
        setDropdownOptions(databaseSelect, Array.from(databases).sort(), filters.database);
        setDropdownOptions(locationSelect, Array.from(locations).sort(), filters.location);
        setDropdownOptions(categorySelect, Array.from(categories).sort(), filters.category);
        setDropdownOptions(labelSelect, Array.from(labels).sort(), filters.label);
    }

    // On any filter change, update all dropdowns and display content
    function onAnyFilterChange() {
        populateAllFilterOptions();
        currentPage = 1;
        displayContent();
    }

    // Fetch available labels and artworks data
    async function initializeData() {
        try {
            console.log('Starting data initialization');
            // Fetch artworks data first
            const artworksResponse = await fetch('/api/artworks');
            artworksData = await artworksResponse.json();
            console.log('Fetched artworks data:', artworksData.length, 'items');

            // Populate all filter options initially
            populateAllFilterOptions();

            // Set up event listeners for all filters
            if (labelSelect) labelSelect.addEventListener('change', onAnyFilterChange);
            if (categorySelect) categorySelect.addEventListener('change', onAnyFilterChange);
            if (yearSelect) yearSelect.addEventListener('change', onAnyFilterChange);
            if (artistSelect) artistSelect.addEventListener('change', onAnyFilterChange);
            if (databaseSelect) databaseSelect.addEventListener('change', onAnyFilterChange);
            if (locationSelect) locationSelect.addEventListener('change', onAnyFilterChange);

            // View toggle button click handler
            if (viewToggleBtn) {
                viewToggleBtn.addEventListener('click', function() {
                    currentPage = 1;
                    currentView = currentView === 'cutout' ? 'image' : 'cutout';
                    this.textContent = currentView === 'cutout' ? 'Image' : 'Cutout';
                    displayContent();
                });
                viewToggleBtn.textContent = 'Cutout';
            }

            // Reset View button
            if (resetViewBtn) {
                resetViewBtn.addEventListener('click', function() {
                    if (window.panzoomInstance) {
                        window.panzoomInstance.reset();
                        if (panzoomDebug) {
                            panzoomDebug.textContent = 'View reset.';
                        }
                    }
                });
            }

            // Add event listener for reset filters button
            if (resetFiltersBtn) {
                resetFiltersBtn.addEventListener('click', function() {
                    if (labelSelect) labelSelect.value = 'all';
                    if (categorySelect) categorySelect.value = 'all';
                    if (yearSelect) yearSelect.value = 'all';
                    if (artistSelect) artistSelect.value = 'all';
                    if (databaseSelect) databaseSelect.value = 'all';
                    if (locationSelect) locationSelect.value = 'all';
                    populateAllFilterOptions();
                    currentPage = 1;
                    displayContent();
                });
            }

            // Display initial content
            displayContent();
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

        // Calculate grid dimensions
        const aspectRatio = viewportWidth / viewportHeight;
        const cols = Math.ceil(Math.sqrt(n * aspectRatio));
        const rows = Math.ceil(n / cols);

        // Calculate cell dimensions
        const gap = 8;
        const cellWidth = (viewportWidth - (cols - 1) * gap) / cols;
        const cellHeight = (viewportHeight - (rows - 1) * gap) / rows;

        return cutouts.map((cutout, i) => {
            const ar = cutout.width / cutout.height;
            let w, h;
            
            if (ar > 1) {
                // Landscape
                w = cellWidth;
                h = w / ar;
            } else {
                // Portrait
                h = cellHeight;
                w = h * ar;
            }

            return {
                ...cutout,
                displayWidth: w,
                displayHeight: h,
                containerWidth: cellWidth,
                containerHeight: cellHeight
            };
        });
    }

    // Function to preload items for a specific page
    async function preloadPageItems(pageNumber, matchingItems) {
        if (pageNumber > totalPages) return;
        
        const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
        const pageItems = matchingItems.slice(startIndex, endIndex);

        // Create all cutouts in parallel
        const items = await Promise.all(pageItems.map(async (item) => {
            if (item.type === 'cutout') {
                try {
                    const cutout = await getOrCreateCutout(
                        item.artwork.image_url,
                        item.detection.bbox,
                        item.detection.label
                    );
                    cutout.originalImageUrl = item.artwork.image_url;
                    return cutout;
                } catch (error) {
                    console.error('Error creating cutout:', error);
                    return null;
                }
            } else {
                return {
                    url: item.artwork.image_url,
                    width: item.artwork.width || 800,
                    height: item.artwork.height || 600
                };
            }
        }));

        // Filter out any failed cutouts
        const validItems = items.filter(item => item !== null);

        // Store the preloaded items
        preloadedItems.set(pageNumber, validItems);
    }

    // Helper function to load items for a specific page
    async function loadPageItems(pageNumber, matchingItems) {
        const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
        const pageItems = matchingItems.slice(startIndex, endIndex);

        // Create all cutouts in parallel
        const items = await Promise.all(pageItems.map(async (item) => {
            if (item.type === 'cutout') {
                try {
                    const cutout = await getOrCreateCutout(
                        item.artwork.image_url,
                        item.detection.bbox,
                        item.detection.label
                    );
                    cutout.originalImageUrl = item.artwork.image_url;
                    return cutout;
                } catch (error) {
                    console.error('Error creating cutout:', error);
                    return null;
                }
            } else {
                return {
                    url: item.artwork.image_url,
                    width: item.artwork.width || 800,
                    height: item.artwork.height || 600
                };
            }
        }));

        // Filter out any failed cutouts
        return items.filter(item => item !== null);
    }

    // Display cutouts or full images based on current view
    async function displayContent() {
        if (!gallery || !artworksData) return;

        const filters = getCurrentFilterValues();
        
        gallery.innerHTML = '';

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

            // Attach fade-out handler ONCE
            modal.onclick = function(e) {
                if (e.target === modal && modal.classList.contains('show')) {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.style.display = 'none';
                    }, 300);
                }
            };
        }

        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        gallery.appendChild(loadingIndicator);

        // First, collect all matching detections/artworks without creating cutouts
        let matchingItems = [];
        if (currentView === 'cutout') {
            // Collect all matching detections first
            for (const artwork of artworksData) {
                // Check metadata filters
                const yearMatch = filters.year === 'all' || artwork.Year === filters.year;
                const artistMatch = filters.artist === 'all' || artwork.Artist === filters.artist;
                const databaseMatch = filters.database === 'all' || artwork.Database === filters.database;
                const locationMatch = filters.location === 'all' || artwork.Location === filters.location;

                if (!yearMatch || !artistMatch || !databaseMatch || !locationMatch) {
                    continue;
                }

                const detections = artwork.detections.filter(detection => {
                    const labelMatch = filters.label === 'all' || detection.label === filters.label;
                    const categoryMatch = filters.category === 'random' || filters.category === 'all' || detection.category === filters.category;
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
                // Check metadata filters
                const yearMatch = filters.year === 'all' || artwork.Year === filters.year;
                const artistMatch = filters.artist === 'all' || artwork.Artist === filters.artist;
                const databaseMatch = filters.database === 'all' || artwork.Database === filters.database;
                const locationMatch = filters.location === 'all' || artwork.Location === filters.location;

                if (!yearMatch || !artistMatch || !databaseMatch || !locationMatch) {
                    continue;
                }

                const hasMatchingDetection = artwork.detections.some(detection => {
                    const labelMatch = filters.label === 'all' || detection.label === filters.label;
                    const categoryMatch = filters.category === 'random' || filters.category === 'all' || detection.category === filters.category;
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

        // If random category is selected, shuffle and limit to 100 items
        if (filters.category === 'random') {
            // Fisher-Yates shuffle algorithm
            for (let i = matchingItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [matchingItems[i], matchingItems[j]] = [matchingItems[j], matchingItems[i]];
            }
            matchingItems = matchingItems.slice(0, 100);
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

        // Remove loading indicator
        gallery.removeChild(loadingIndicator);

        function showModal(imageUrl) {
            if (isDragging) {
                console.log('Ignoring click during drag');
                return;
            }
            if (hasPanned && Date.now() - lastPanTime < PAN_COOLDOWN) {
                console.log('Too soon after panning, ignoring click');
                return;
            }
            console.log('Showing modal for:', imageUrl);
            const artwork = artworksData.find(a => a.image_url === imageUrl);

            // Find current item index
            const currentIndex = items.findIndex(item => 
                currentView === 'cutout' ? item.originalImageUrl === imageUrl : item.url === imageUrl
            );

            function createModalContent() {
                const modalContent = document.createElement('div');
                modalContent.className = 'modal-content-inner';
                modalContent.style.position = 'absolute';
                modalContent.style.top = '50%';
                modalContent.style.left = '50%';
                modalContent.style.transform = 'translate(-50%, -50%)';
                modalContent.style.width = '90%';
                modalContent.style.maxWidth = '1200px';
                modalContent.style.backgroundColor = 'rgba(45, 48, 51, 0.95)';
                modalContent.style.borderRadius = '8px';
                modalContent.style.padding = '20px';
                modalContent.style.display = 'flex';
                modalContent.style.flexDirection = 'column';
                modalContent.style.gap = '20px';
                modalContent.style.cursor = 'default';
                modalContent.style.maxHeight = '90vh';
                modalContent.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
                modalContent.style.opacity = '0';
                modalContent.style.transition = 'opacity 0.3s ease-in-out';

                // Add navigation arrows
                const prevArrow = document.createElement('button');
                prevArrow.innerHTML = '&#10094;';
                prevArrow.className = 'modal-nav-arrow modal-prev';
                prevArrow.style.position = 'absolute';
                prevArrow.style.left = '-60px';
                prevArrow.style.top = '50%';
                prevArrow.style.transform = 'translateY(-50%)';
                prevArrow.style.background = 'rgba(0, 0, 0, 0.5)';
                prevArrow.style.border = 'none';
                prevArrow.style.color = 'white';
                prevArrow.style.fontSize = '24px';
                prevArrow.style.padding = '15px 20px';
                prevArrow.style.cursor = 'pointer';
                prevArrow.style.borderRadius = '5px';
                prevArrow.style.transition = 'background-color 0.3s';
                prevArrow.style.zIndex = '1001';
                prevArrow.style.display = currentIndex > 0 ? 'block' : 'none';
                prevArrow.onmouseover = () => prevArrow.style.background = 'rgba(0, 0, 0, 0.8)';
                prevArrow.onmouseout = () => prevArrow.style.background = 'rgba(0, 0, 0, 0.5)';
                prevArrow.onclick = (e) => {
                    e.stopPropagation();
                    if (currentIndex > 0) {
                        const prevItem = items[currentIndex - 1];
                        showModal(currentView === 'cutout' ? prevItem.originalImageUrl : prevItem.url);
                    }
                };

                const nextArrow = document.createElement('button');
                nextArrow.innerHTML = '&#10095;';
                nextArrow.className = 'modal-nav-arrow modal-next';
                nextArrow.style.position = 'absolute';
                nextArrow.style.right = '-60px';
                nextArrow.style.top = '50%';
                nextArrow.style.transform = 'translateY(-50%)';
                nextArrow.style.background = 'rgba(0, 0, 0, 0.5)';
                nextArrow.style.border = 'none';
                nextArrow.style.color = 'white';
                nextArrow.style.fontSize = '24px';
                nextArrow.style.padding = '15px 20px';
                nextArrow.style.cursor = 'pointer';
                nextArrow.style.borderRadius = '5px';
                nextArrow.style.transition = 'background-color 0.3s';
                nextArrow.style.zIndex = '1001';
                nextArrow.style.display = currentIndex < items.length - 1 ? 'block' : 'none';
                nextArrow.onmouseover = () => nextArrow.style.background = 'rgba(0, 0, 0, 0.8)';
                nextArrow.onmouseout = () => nextArrow.style.background = 'rgba(0, 0, 0, 0.5)';
                nextArrow.onclick = (e) => {
                    e.stopPropagation();
                    if (currentIndex < items.length - 1) {
                        const nextItem = items[currentIndex + 1];
                        showModal(currentView === 'cutout' ? nextItem.originalImageUrl : nextItem.url);
                    }
                };

                modalContent.appendChild(prevArrow);
                modalContent.appendChild(nextArrow);

                // Image container with relative positioning for bbox overlay
                const imgContainer = document.createElement('div');
                imgContainer.style.display = 'flex';
                imgContainer.style.justifyContent = 'center';
                imgContainer.style.alignItems = 'center';
                imgContainer.style.position = 'relative';

                const modalImg = document.createElement('img');
                modalImg.src = imageUrl;
                modalImg.style.maxHeight = '40vh';
                modalImg.style.width = 'auto';
                modalImg.style.maxWidth = '100%';
                modalImg.style.objectFit = 'contain';
                modalImg.style.borderRadius = '4px';
                imgContainer.appendChild(modalImg);

                // Add bounding box overlay if in cutout mode
                if (currentView === 'cutout' && artwork) {
                    const detection = artwork.detections.find(d => {
                        const cutout = items.find(item => 
                            item.originalImageUrl === imageUrl && 
                            item.dataUrl === currentView === 'cutout' ? item.dataUrl : null
                        );
                        return cutout && cutout.bbox;
                    });

                    if (detection) {
                        const bbox = document.createElement('div');
                        bbox.style.position = 'absolute';
                        bbox.style.border = '2px solid rgba(255, 0, 0, 0.8)';
                        bbox.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
                        bbox.style.pointerEvents = 'none';
                        
                        // Calculate bbox position and size relative to the displayed image
                        const imgRect = modalImg.getBoundingClientRect();
                        const [x1, y1, x2, y2] = detection.bbox;
                        const width = x2 - x1;
                        const height = y2 - y1;
                        
                        bbox.style.left = `${(x1 / artwork.width) * 100}%`;
                        bbox.style.top = `${(y1 / artwork.height) * 100}%`;
                        bbox.style.width = `${(width / artwork.width) * 100}%`;
                        bbox.style.height = `${(height / artwork.height) * 100}%`;
                        
                        imgContainer.appendChild(bbox);
                    }
                }

                modalContent.appendChild(imgContainer);

                // Metadata (always show all fields)
                if (artwork) {
                    const metadataContainer = document.createElement('div');
                    metadataContainer.style.color = 'white';
                    metadataContainer.style.fontFamily = 'Arial, sans-serif';
                    metadataContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                    metadataContainer.style.borderRadius = '4px';
                    metadataContainer.style.padding = '24px 24px 12px 24px';
                    metadataContainer.style.marginTop = '0';

                    // Caption (prominent, centered, scrollable if long)
                    const caption = document.createElement('div');
                    caption.style.fontSize = '1.3em';
                    caption.style.fontWeight = '500';
                    caption.style.textAlign = 'center';
                    caption.style.marginBottom = '18px';
                    caption.style.lineHeight = '1.5';
                    caption.style.maxHeight = '200px';
                    caption.style.overflowY = 'auto';
                    caption.style.padding = '0 10px';
                    caption.textContent = artwork.Caption || 'No caption available';
                    if (!artwork.Caption || artwork.Caption === 'No caption available') {
                        caption.style.fontStyle = 'italic';
                        caption.style.color = '#bbb';
                    }
                    metadataContainer.appendChild(caption);

                    // Metadata row
                    const metaRow = document.createElement('div');
                    metaRow.style.display = 'flex';
                    metaRow.style.justifyContent = 'center';
                    metaRow.style.gap = '40px';
                    metaRow.style.flexWrap = 'wrap';

                    // Helper for each field
                    function metaField(label, value) {
                        const field = document.createElement('div');
                        field.style.display = 'flex';
                        field.style.flexDirection = 'column';
                        field.style.alignItems = 'center';
                        field.style.minWidth = '120px';
                        const labelSpan = document.createElement('span');
                        labelSpan.textContent = label;
                        labelSpan.style.fontWeight = 'bold';
                        labelSpan.style.color = '#aaa';
                        labelSpan.style.fontSize = '1em';
                        const valueSpan = document.createElement('span');
                        valueSpan.textContent = value && value !== 'Unknown' ? value : 'Unknown';
                        if (!value || value === 'Unknown') {
                            valueSpan.style.fontStyle = 'italic';
                            valueSpan.style.color = '#bbb';
                        } else {
                            valueSpan.style.color = '#fff';
                        }
                        valueSpan.style.fontSize = '1.1em';
                        field.appendChild(labelSpan);
                        field.appendChild(valueSpan);
                        return field;
                    }

                    metaRow.appendChild(metaField('Artist', artwork.Artist));
                    metaRow.appendChild(metaField('Year', artwork.Year));
                    metaRow.appendChild(metaField('Location', artwork.Location));
                    metaRow.appendChild(metaField('Photo Credit', artwork.Photo_Credit));
                    metadataContainer.appendChild(metaRow);
                    modalContent.appendChild(metadataContainer);
                }

                // Close button
                const closeButton = document.createElement('button');
                closeButton.innerHTML = '&times;';
                closeButton.style.position = 'absolute';
                closeButton.style.top = '10px';
                closeButton.style.right = '10px';
                closeButton.style.background = 'none';
                closeButton.style.border = 'none';
                closeButton.style.color = 'white';
                closeButton.style.fontSize = '24px';
                closeButton.style.cursor = 'pointer';
                closeButton.style.padding = '5px 10px';
                closeButton.onclick = (e) => {
                    e.stopPropagation();
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.style.display = 'none';
                    }, 300);
                };
                modalContent.appendChild(closeButton);

                return modalContent;
            }

            // If modal is already open, crossfade to new content
            if (modal.classList.contains('show')) {
                const oldContent = modal.querySelector('.modal-content-inner');
                const newContent = createModalContent();
                // Fade out old content
                if (oldContent) oldContent.style.opacity = '0';
                // After fade out, replace content and fade in
                setTimeout(() => {
                    // Remove only modal content divs with the specific class
                    Array.from(modal.querySelectorAll('.modal-content-inner')).forEach(div => modal.removeChild(div));
                    modal.appendChild(newContent);
                    // Force reflow
                    newContent.offsetHeight;
                    newContent.style.opacity = '1';
                }, 300);
            } else {
                // First time showing modal
                modal.style.display = 'block';
                // Remove only modal content divs with the specific class (just in case)
                Array.from(modal.querySelectorAll('.modal-content-inner')).forEach(div => modal.removeChild(div));
                const newContent = createModalContent();
                modal.appendChild(newContent);
                // Force reflow
                newContent.offsetHeight;
                newContent.style.opacity = '1';
                modal.classList.add('show');
            }
        }

        // Fit items to viewport
        const fittedItems = fitCutoutsToViewport(items);

        // Display items
        fittedItems.forEach(item => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'artwork-item-container';
            imgContainer.style.width = item.containerWidth + 'px';
            imgContainer.style.height = item.containerHeight + 'px';
            
            const img = document.createElement('img');
            img.src = currentView === 'cutout' ? item.dataUrl : item.url;
            img.className = 'artwork-item';
            img.alt = currentView === 'cutout' ? 'Cutout' : 'Full artwork';
            img.style.cursor = 'pointer';
            
            // Center the image in its container
            img.style.width = item.displayWidth + 'px';
            img.style.height = item.displayHeight + 'px';
            img.style.objectFit = 'contain';
            
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
        pageSpan.textContent = `${currentPage}/${totalPages}`;

        // Add event listeners for pagination buttons
        prevButton.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                displayContent();
            }
        };

        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                displayContent();
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
            panzoomDebug.textContent = '';
            console.log('Panzoom initialized on #gallery');
        } else {
            panzoomDebug.textContent = 'Panzoom library not loaded!';
            console.error('Panzoom library not loaded!');
        }
    }

    // Initialize the page
    initializeData();
});
