window.addEventListener('DOMContentLoaded', function () {
    // Add styles for resize handles and guidelines
    const style = document.createElement('style');
    style.textContent = `
      .highlight { outline: 2px solid #00ff00; }
      .fade { opacity: 0.3; }
      .bbox {
        pointer-events: none;
        position: absolute;
        border: 2px solid #4CAF50;
      }
      .bbox.resizing {
        pointer-events: auto;
      }
      .resize-handle {
        position: absolute;
        width: 10px;
        height: 10px;
        background-color: white;
        border: 2px solid #4CAF50;
        border-radius: 50%;
        pointer-events: auto;
        z-index: 1000;
      }
      .resize-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
      .resize-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
      .resize-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
      .resize-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
      .creating-box {
        position: absolute;
        border: 2px dashed #4CAF50;
        background-color: rgba(76, 175, 80, 0.1);
        pointer-events: none;
      }
      .guideline {
        position: absolute;
        background-color: #00ff00;
        pointer-events: none;
        z-index: 999;
      }
      .guideline.horizontal {
        height: 1px;
        width: 100%;
        left: 0;
      }
      .guideline.vertical {
        width: 1px;
        height: 100%;
        top: 0;
      }
      .image-container {
        overflow: hidden;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }
      #main-image {
        display: block;
        max-width: 100%;
        max-height: 100%;
        margin: auto;
      }

      /* Add category-specific styles directly in JavaScript */
      .object-btn[data-category="Animals"] {
        background: #fff7c0 !important;
        color: #a18c2a !important;
      }
      .object-btn[data-category="Buildings & Infrastructure"] {
        background: #d1f0ff !important;
        color: #2b5b6b !important;
      }
      .object-btn[data-category="Furniture & Indoor Objects"] {
        background: #e1d5fa !important;
        color: #4b3b6b !important;
      }
      .object-btn[data-category="Miscellaneous"] {
        background: #f0f0f0 !important;
        color: #666666 !important;
      }
      .object-btn[data-category="Nature & Outdoor Features"] {
        background: #d1ffd1 !important;
        color: #2b6b2b !important;
      }
      .object-btn[data-category="People & Clothing"] {
        background: #ffd1d1 !important;
        color: #a14a4a !important;
      }
      .object-btn[data-category="Symbols & Identification"] {
        background: #ffe0b2 !important;
        color: #b75e00 !important;
      }
      .object-btn[data-category="Vehicles & Transport"] {
        background: #b3e5fc !important;
        color: #01579b !important;
      }
      .object-btn[data-category="Weapons & Tools"] {
        background: #ffcdd2 !important;
        color: #b71c1c !important;
      }
    `;
    document.head.appendChild(style);
  
    const img = document.getElementById('main-image');
    const bboxes = document.querySelectorAll('.bbox');
    const handButton = document.querySelector('.icon.hand');
    const classFilterSelect = document.getElementById('class-filter-select');
    const imageContainer = img.parentElement;
    if (!img) return;
  
    // Debug: Log initial state of buttons
    document.querySelectorAll('.object-btn').forEach(btn => {
      btn.dataset.category = btn.dataset.category;
    });
  
    // Load all detections data from the JSON file
    fetch('/get_all_detections')
      .then(response => response.json())
      .then(data => {
        // Store all detections from all pages with their image files
        window.allDetectionsData = data.reduce((acc, item) => {
          const detectionsWithImage = item.detections.map(detection => ({
            ...detection,
            _image_file: item.image_file // Use _image_file for internal tracking only
          }));
          return acc.concat(detectionsWithImage);
        }, []);

        // Store all unique categories from the complete dataset
        window.allCategories = new Set();
        window.allDetectionsData.forEach(detection => {
          if (detection.category) {
            window.allCategories.add(detection.category);
          }
        });

        // Initialize bboxes with their categories from the data attributes
        bboxes.forEach(box => {
          const label = box.title;
          // Find matching detection in the data
          const matchingDetection = window.allDetectionsData.find(d => 
            d.label === label && d._image_file === img.src.split('/').pop()
          );
          
          if (matchingDetection && matchingDetection.category) {
            box.dataset.category = matchingDetection.category;
            // Also update the corresponding button
            const btn = document.querySelector(`.object-btn[data-idx="${box.dataset.idx}"]`);
            if (btn) {
              btn.dataset.category = matchingDetection.category;
            }
          } else {
            box.dataset.category = "Miscellaneous";
            // Also update the corresponding button
            const btn = document.querySelector(`.object-btn[data-idx="${box.dataset.idx}"]`);
            if (btn) {
              btn.dataset.category = "Miscellaneous";
            }
          }
        });

        // Debug: Log final state of buttons
        document.querySelectorAll('.object-btn').forEach(btn => {
          btn.dataset.category = btn.dataset.category;
        });
      })
      .catch(error => {
        console.error('Error loading detections data:', error);
      });
  
    // Initialize bboxes with their categories from the data attributes
    bboxes.forEach(box => {
      const category = box.getAttribute('data-category');
      if (category) {
        box.dataset.category = category;
        // Also update the corresponding button
        const btn = document.querySelector(`.object-btn[data-idx="${box.dataset.idx}"]`);
        if (btn) {
          btn.dataset.category = category;
        }
      } else {
        box.dataset.category = "Miscellaneous";
        // Also update the corresponding button
        const btn = document.querySelector(`.object-btn[data-idx="${box.dataset.idx}"]`);
        if (btn) {
          btn.dataset.category = "Miscellaneous";
        }
      }
    });
  
    let isCreatingBox = false;
    let startX, startY;
    let creatingBox = null;
    let horizontalGuideline = null;
    let verticalGuideline = null;
  
    // Add panning state variables
    let isPanning = false;
    let panOffset = { x: 0, y: 0 };
    let lastPanPosition = { x: 0, y: 0 };
    
    // Add zoom state variables
    let zoomLevel = 1;
    const ZOOM_SPEED = 0.1;
    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 5;
  
    function updateBoxes() {
      // Get the actual displayed size and position of the image
      const imgRect = img.getBoundingClientRect();
      const containerRect = imageContainer.getBoundingClientRect();
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayedWidth = img.width;
      const displayedHeight = img.height;
      const offsetX = (containerRect.width - displayedWidth) / 2;
      const offsetY = (containerRect.height - displayedHeight) / 2;
      const scaleX = displayedWidth / naturalWidth;
      const scaleY = displayedHeight / naturalHeight;

      document.querySelectorAll('.bbox').forEach(box => {
        const x = parseFloat(box.dataset.x);
        const y = parseFloat(box.dataset.y);
        const w = parseFloat(box.dataset.w);
        const h = parseFloat(box.dataset.h);

        // Calculate positions relative to the container, matching image transformation
        const left = offsetX + (x * scaleX * zoomLevel) + panOffset.x;
        const top = offsetY + (y * scaleY * zoomLevel) + panOffset.y;
        const width = w * scaleX * zoomLevel;
        const height = h * scaleY * zoomLevel;

        // Set the position and size
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        // Remove transform properties
        box.style.transform = '';
        box.style.transformOrigin = '';
      });
    }
  
    // Update boxes when image loads and on window resize
    img.addEventListener('load', function() {
      // Wait a short moment to ensure image dimensions are properly set
      setTimeout(updateBoxes, 0);
    });
    window.addEventListener('resize', updateBoxes);
  
    // Initial update of boxes
    if (img.complete) {
      updateBoxes();
    }
  
    const popup = document.getElementById('bbox-popup');
    const popupRename = document.getElementById('popup-rename');
    const popupResize = document.getElementById('popup-resize');
    const popupDelete = document.getElementById('popup-delete');
  
    let currentIdx = null;
    let activeBox = null;
    let resizing = false;
    let startW, startH, startL, startT, handleDir;
    let resizeState = null;
    let applyBtn = null;

    // Function to get category for a label from existing boxes or JSON data
    function getCategoryForLabel(label) {
      // First check in the DOM for boxes with the same label
      const existingBoxes = document.querySelectorAll('.bbox');
      for (const box of existingBoxes) {
        if (box.title === label && box.dataset.category) {
          return box.dataset.category;
        }
      }

      // Then check in the global detections data
      if (window.allDetectionsData) {
        const currentImage = img.src.split('/').pop();
        
        // First try to find a detection from the current image
        let matchingDetection = window.allDetectionsData
          .filter(detection => detection.label === label && detection._image_file === currentImage)
          .pop();
        
        // If not found in current image, look in all images
        if (!matchingDetection) {
          matchingDetection = window.allDetectionsData
            .filter(detection => detection.label === label)
            .pop();
        }
        
        if (matchingDetection && matchingDetection.category) {
          return matchingDetection.category;
        }
      }

      return null;
    }

    // Function to update the JSON data on the server
    async function updateJsonData() {
      try {
        // Get current page from URL
        const urlParams = new URLSearchParams(window.location.search);
        const page = urlParams.get('page') || '1';
        const currentImage = img.src.split('/').pop();
        const filterClass = urlParams.get('class');

        // Get all current boxes
        const detections = Array.from(document.querySelectorAll('.bbox')).map(box => ({
          label: box.title,
          category: box.dataset.category || "Miscellaneous",
          bbox: [
            parseFloat(box.dataset.x),
            parseFloat(box.dataset.y),
            parseFloat(box.dataset.x) + parseFloat(box.dataset.w),
            parseFloat(box.dataset.y) + parseFloat(box.dataset.h)
          ]
        }));

        // Update the current page's detections
        window.detectionsData = detections;

        // Update the all detections data
        if (window.allDetectionsData) {
          // Remove all detections for the current image
          window.allDetectionsData = window.allDetectionsData.filter(d => 
            d._image_file !== currentImage
          );
          // Add new detections with internal image tracking
          const detectionsWithImage = detections.map(d => ({
            ...d,
            _image_file: currentImage
          }));
          window.allDetectionsData = window.allDetectionsData.concat(detectionsWithImage);
        }

        // Update the allCategories set
        if (!window.allCategories) {
          window.allCategories = new Set();
        }
        detections.forEach(detection => {
          if (detection.category) {
            window.allCategories.add(detection.category);
          }
        });

        const response = await fetch(`/update_detections?page=${page}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_file: currentImage,
            detections: detections
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update detections');
        }

        // If we're filtering by class, ensure we stay on a valid page
        if (filterClass && filterClass !== 'all') {
          const filteredDetections = detections.filter(d => d.label === filterClass);
          if (filteredDetections.length === 0) {
            // If no detections left for this class, redirect to first page
            window.location.href = `${window.location.pathname}?page=1&class=${filterClass}`;
            return;
          }
        }

        // Update stats after successful update
        updateStats();
      } catch (error) {
        console.error('Error updating detections:', error);
        alert('Failed to save changes. Please try again.');
      }
    }
  
    document.querySelectorAll('.object-btn').forEach(btn => {
      btn.addEventListener('mouseenter', function () {
        const idx = btn.getAttribute('data-idx');
        bboxes.forEach(box => {
          if (box.getAttribute('data-idx') === idx) {
            box.classList.add('highlight');
            box.classList.remove('fade');
          } else {
            box.classList.remove('highlight');
            box.classList.add('fade');
          }
        });
      });
  
      btn.addEventListener('mouseleave', function () {
        bboxes.forEach(box => {
          box.classList.remove('highlight');
          box.classList.remove('fade');
        });
      });
  
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        currentIdx = btn.getAttribute('data-idx');
        activeBox = document.querySelector(`.bbox[data-idx="${currentIdx}"]`);
        if (!activeBox) return;
        const rect = btn.getBoundingClientRect();
        popup.style.left = (rect.right + window.scrollX + 8) + 'px';
        popup.style.top = (rect.top + window.scrollY) + 'px';
        popup.style.display = 'block';
      });
    });
  
    document.addEventListener('mousedown', function (e) {
      // Handle popup closing
      if (!popup.contains(e.target) && 
          !e.target.classList.contains('object-btn') && 
          !e.target.closest('.resize-handle') && 
          (!applyBtn || !applyBtn.contains(e.target))) {
        popup.style.display = 'none';
        if (resizing) cancelResize();
      }

      // Handle resize
      if (!resizing || !activeBox) {
        return;
      }
      const handle = e.target.closest('.resize-handle');
      if (handle && handle.parentElement === activeBox) {
        e.preventDefault();
        e.stopPropagation();
        handleDir = handle.dataset.dir;
        startX = e.clientX;
        startY = e.clientY;
        const rect = activeBox.getBoundingClientRect();
        const parentRect = activeBox.parentElement.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        startL = rect.left - parentRect.left;
        startT = rect.top - parentRect.top;
  
        resizeState = {
          x: parseFloat(activeBox.dataset.x),
          y: parseFloat(activeBox.dataset.y),
          w: parseFloat(activeBox.dataset.w),
          h: parseFloat(activeBox.dataset.h)
        };
  
        function onMouseMove(ev) {
          if (!activeBox) return;
          let dx = ev.clientX - startX;
          let dy = ev.clientY - startY;
          let newW = startW, newH = startH, newL = startL, newT = startT;
  
          if (handleDir.includes('e')) newW = Math.max(10, startW + dx);
          if (handleDir.includes('s')) newH = Math.max(10, startH + dy);
          if (handleDir.includes('w')) {
            newW = Math.max(10, startW - dx);
            newL = startL + dx;
          }
          if (handleDir.includes('n')) {
            newH = Math.max(10, startH - dy);
            newT = startT + dy;
          }
  
          Object.assign(activeBox.style, {
            width: newW + 'px',
            height: newH + 'px',
            left: newL + 'px',
            top: newT + 'px'
          });
  
          const container = imageContainer;
          const naturalWidth = img.naturalWidth;
          const naturalHeight = img.naturalHeight;
          const displayedWidth = img.width;
          const displayedHeight = img.height;
          const offsetX = (container.clientWidth - displayedWidth) / 2;
          const offsetY = (container.clientHeight - displayedHeight) / 2;
          const scaleX = displayedWidth / naturalWidth;
          const scaleY = displayedHeight / naturalHeight;
  
          // Convert screen coordinates back to image coordinates, accounting for zoom
          resizeState.x = ((newL - offsetX - panOffset.x) / (scaleX * zoomLevel));
          resizeState.y = ((newT - offsetY - panOffset.y) / (scaleY * zoomLevel));
          resizeState.w = newW / (scaleX * zoomLevel);
          resizeState.h = newH / (scaleY * zoomLevel);
        }
  
        function onMouseUp(ev) {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }
  
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }
    });
  
    document.addEventListener('keydown', function (e) {
      if (resizing) {
        if (e.key === 'Escape') {
          cancelResize();
        } else if (e.key === 'Enter' && applyBtn) {
          applyBtn.click();
        }
      }
    });
  
    img.ondragstart = () => false;
  
    popupRename.onclick = function () {
      popup.style.display = 'none';
      if (!activeBox) return;
      const newLabel = prompt('Enter new label:', activeBox.title);
      if (newLabel && newLabel.trim() !== '') {
        // Check if the new label exists and has a category
        const existingCategory = getCategoryForLabel(newLabel);
        if (existingCategory) {
          // Use the existing category
          activeBox.dataset.category = existingCategory;
        } else {
          // Show category selection modal for new label
          const existingCategories = getExistingCategories();
          
          // Create a modal dialog for category selection
          const modal = document.createElement('div');
          modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 1000;
          `;

          const title = document.createElement('h3');
          title.textContent = `Select Category for "${newLabel}"`;
          title.style.marginBottom = '15px';
          modal.appendChild(title);

          const buttonContainer = document.createElement('div');
          buttonContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 15px;
          `;

          // Add "Create New Category" button
          const newCategoryBtn = document.createElement('button');
          newCategoryBtn.textContent = 'Create New Category';
          newCategoryBtn.style.cssText = `
            padding: 8px 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          `;
          newCategoryBtn.onclick = () => {
            const newCategory = prompt('Enter new category name:');
            if (newCategory && newCategory.trim()) {
              activeBox.dataset.category = newCategory.trim();
              modal.remove();
              continueRename();
            }
          };
          buttonContainer.appendChild(newCategoryBtn);

          // Add existing categories as buttons
          existingCategories.forEach(cat => {
            const catBtn = document.createElement('button');
            catBtn.textContent = cat;
            catBtn.style.cssText = `
              padding: 8px 16px;
              background: #f0f0f0;
              border: 1px solid #ddd;
              border-radius: 4px;
              cursor: pointer;
            `;
            catBtn.onclick = () => {
              activeBox.dataset.category = cat;
              modal.remove();
              continueRename();
            };
            buttonContainer.appendChild(catBtn);
          });

          modal.appendChild(buttonContainer);
          document.body.appendChild(modal);
        }

        function continueRename() {
          activeBox.title = newLabel;
          const btn = document.querySelector(`.object-btn[data-idx="${currentIdx}"]`);
          if (btn) btn.textContent = newLabel;
          updateJsonData();
        }

        // If we found an existing category, continue with the rename
        if (existingCategory) {
          continueRename();
        }
      }
    };

    popupResize.onclick = function () {
      popup.style.display = 'none';
      if (!activeBox) return;
      addResizeHandles(activeBox);
      resizing = true;
      if (!applyBtn) {
        applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply';
        Object.assign(applyBtn.style, {
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: '1000',
          padding: '8px 16px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        });
        document.body.appendChild(applyBtn);
        applyBtn.addEventListener('click', () => {
          if (activeBox && resizeState) {
            // Update the dataset values
            activeBox.dataset.x = resizeState.x.toString();
            activeBox.dataset.y = resizeState.y.toString();
            activeBox.dataset.w = resizeState.w.toString();
            activeBox.dataset.h = resizeState.h.toString();
            
            // Update the visual position
            updateBoxes();
            
            // Save to JSON
            updateJsonData();
          }
          cancelResize();
        });
      }
      applyBtn.style.display = 'block';
    };
  
    popupDelete.onclick = function () {
      popup.style.display = 'none';
      if (!activeBox) return;

      // Get the specific box's data before removing it
      const boxData = {
        idx: activeBox.dataset.idx,
        label: activeBox.title,
        category: activeBox.dataset.category,
        bbox: [
          parseFloat(activeBox.dataset.x),
          parseFloat(activeBox.dataset.y),
          parseFloat(activeBox.dataset.x) + parseFloat(activeBox.dataset.w),
          parseFloat(activeBox.dataset.y) + parseFloat(activeBox.dataset.h)
        ]
      };

      // Remove the box and button from DOM
      const btn = document.querySelector(`.object-btn[data-idx="${activeBox.dataset.idx}"]`);
      if (activeBox) activeBox.remove();
      if (btn) btn.remove();

      // Update indices of remaining boxes and buttons
      const remainingBoxes = document.querySelectorAll('.bbox');
      const remainingButtons = document.querySelectorAll('.object-btn');
      
      remainingBoxes.forEach((box, index) => {
        box.dataset.idx = index.toString();
      });
      
      remainingButtons.forEach((btn, index) => {
        btn.dataset.idx = index.toString();
      });

      // Reset state
      currentIdx = null;
      activeBox = null;

      // Update JSON data
      const detections = Array.from(remainingBoxes).map(box => ({
        label: box.title,
        category: box.dataset.category || "Miscellaneous",
        bbox: [
          parseFloat(box.dataset.x),
          parseFloat(box.dataset.y),
          parseFloat(box.dataset.x) + parseFloat(box.dataset.w),
          parseFloat(box.dataset.y) + parseFloat(box.dataset.h)
        ]
      }));

      // Get current page and filter from URL
      const urlParams = new URLSearchParams(window.location.search);
      const page = urlParams.get('page') || '1';
      const filterClass = urlParams.get('class');

      // Update allDetectionsData by removing the deleted box
      if (window.allDetectionsData) {
        window.allDetectionsData = window.allDetectionsData.filter(detection => {
          // Keep the detection if it's not from the current image
          if (detection._image_file !== img.src.split('/').pop()) {
            return true;
          }
          // For the current image, only keep detections that match the remaining boxes
          return detections.some(d => 
            d.label === detection.label &&
            d.bbox[0] === detection.bbox[0] &&
            d.bbox[1] === detection.bbox[1] &&
            d.bbox[2] === detection.bbox[2] &&
            d.bbox[3] === detection.bbox[3]
          );
        });
      }

      fetch(`/update_detections?page=${page}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_file: img.src.split('/').pop(),
          detections: detections
        })
      }).then(() => {
        // If we're filtering by class and this was the last instance of that class,
        // redirect to the first page
        if (filterClass && filterClass !== 'all') {
          const remainingClassDetections = detections.filter(d => d.label === filterClass);
          if (remainingClassDetections.length === 0) {
            window.location.href = `${window.location.pathname}?page=1&class=${filterClass}`;
            return;
          }
        }
        // Update stats after successful deletion
        updateStats();
      }).catch(error => {
        console.error('Error updating detections:', error);
        alert('Failed to save changes. Please try again.');
      });
    };

    function addResizeHandles(bbox) {
      removeResizeHandles(bbox);
      bbox.classList.add('resizing');
      ['nw', 'ne', 'sw', 'se'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle ' + dir;
        handle.dataset.dir = dir;
        bbox.appendChild(handle);
      });
    }
  
    function removeResizeHandles(bbox) {
      if (!bbox) return;
      bbox.classList.remove('resizing');
      bbox.querySelectorAll('.resize-handle').forEach(h => h.remove());
    }
  
    function cancelResize() {
      if (activeBox && resizeState) {
        // Reset to original position
        activeBox.style.width = '';
        activeBox.style.height = '';
        activeBox.style.left = '';
        activeBox.style.top = '';
        updateBoxes();
      }
      removeResizeHandles(activeBox);
      if (applyBtn) applyBtn.style.display = 'none';
      resizing = false;
      resizeState = null;
    }

    // Update the screenToImageCoords function to properly handle pan and zoom
    function screenToImageCoords(screenX, screenY) {
      const container = imageContainer;
      const rect = container.getBoundingClientRect();
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayedWidth = img.width;
      const displayedHeight = img.height;
      const offsetX = (container.clientWidth - displayedWidth) / 2;
      const offsetY = (container.clientHeight - displayedHeight) / 2;
      const scaleX = displayedWidth / naturalWidth;
      const scaleY = displayedHeight / naturalHeight;

      // First remove pan offset, then divide by zoom and scale
      return {
        x: (screenX - rect.left - offsetX - panOffset.x) / (scaleX * zoomLevel),
        y: (screenY - rect.top - offsetY - panOffset.y) / (scaleY * zoomLevel)
      };
    }

    // Update the imageToScreenCoords function to properly handle pan and zoom
    function imageToScreenCoords(imageX, imageY) {
      const container = imageContainer;
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayedWidth = img.width;
      const displayedHeight = img.height;
      const offsetX = (container.clientWidth - displayedWidth) / 2;
      const offsetY = (container.clientHeight - displayedHeight) / 2;
      const scaleX = displayedWidth / naturalWidth;
      const scaleY = displayedHeight / naturalHeight;

      // First multiply by scale and zoom, then add pan offset
      return {
        x: offsetX + (imageX * scaleX * zoomLevel) + panOffset.x,
        y: offsetY + (imageY * scaleY * zoomLevel) + panOffset.y
      };
    }

    // Function to get unique existing categories
    function getExistingCategories() {
      const categories = new Set();
      
      // Get categories from existing boxes
      document.querySelectorAll('.bbox').forEach(box => {
        if (box.dataset.category) {
          categories.add(box.dataset.category);
        }
      });

      // Get categories from global detections data
      if (window.detectionsData) {
        window.detectionsData.forEach(detection => {
          if (detection.category) {
            categories.add(detection.category);
          }
        });
      }

      // Add categories from the complete dataset
      if (window.allCategories) {
        window.allCategories.forEach(category => {
          categories.add(category);
        });
      }

      return Array.from(categories).sort();
    }

    // Function to create a new bounding box
    function createNewBox(x, y, width, height, label) {
      const container = imageContainer;
      const box = document.createElement('div');
      box.className = 'bbox';
      box.dataset.x = x;
      box.dataset.y = y;
      box.dataset.w = width;
      box.dataset.h = height;
      box.title = label;
      
      // Get category for the label
      let category = getCategoryForLabel(label);
      
      // If no category exists for this label, show the category selection modal
      if (!category) {
        const existingCategories = getExistingCategories();
        
        // Create a modal dialog for category selection
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 1000;
        `;

        const title = document.createElement('h3');
        title.textContent = `Select Category for "${label}"`;
        title.style.marginBottom = '15px';
        modal.appendChild(title);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 15px;
        `;

        // Add "Create New Category" button
        const newCategoryBtn = document.createElement('button');
        newCategoryBtn.textContent = 'Create New Category';
        newCategoryBtn.style.cssText = `
          padding: 8px 16px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        `;
        newCategoryBtn.onclick = () => {
          const newCategory = prompt('Enter new category name:');
          if (newCategory && newCategory.trim()) {
            category = newCategory.trim();
            modal.remove();
            continueBoxCreation();
          }
        };
        buttonContainer.appendChild(newCategoryBtn);

        // Add existing categories as buttons
        existingCategories.forEach(cat => {
          const catBtn = document.createElement('button');
          catBtn.textContent = cat;
          catBtn.style.cssText = `
            padding: 8px 16px;
            background: #f0f0f0;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
          `;
          catBtn.onclick = () => {
            category = cat;
            modal.remove();
            continueBoxCreation();
          };
          buttonContainer.appendChild(catBtn);
        });

        modal.appendChild(buttonContainer);
        document.body.appendChild(modal);
      } else {
        // If category exists for this label, use it directly
        continueBoxCreation();
      }

      // Function to continue box creation after category selection
      function continueBoxCreation() {
        if (!category) {
          category = "Miscellaneous"; // Fallback category if none selected
        }
        box.dataset.category = category;
        
        // Get the next available index
        const existingBoxes = document.querySelectorAll('.bbox');
        const nextIndex = existingBoxes.length;
        box.dataset.idx = nextIndex.toString();
        
        container.appendChild(box);

        // Create new button in the objects panel
        const objectsPanel = document.querySelector('.objects-panel');
        const btn = document.createElement('button');
        btn.className = 'object-btn';
        btn.textContent = label;
        btn.dataset.idx = nextIndex.toString();
        btn.dataset.category = category; // Set the category on the button
        objectsPanel.appendChild(btn);

        // Add event listeners to the new button
        btn.addEventListener('mouseenter', function () {
          const idx = btn.getAttribute('data-idx');
          document.querySelectorAll('.bbox').forEach(box => {
            if (box.getAttribute('data-idx') === idx) {
              box.classList.add('highlight');
              box.classList.remove('fade');
            } else {
              box.classList.remove('highlight');
              box.classList.add('fade');
            }
          });
        });

        btn.addEventListener('mouseleave', function () {
          document.querySelectorAll('.bbox').forEach(box => {
            box.classList.remove('highlight');
            box.classList.remove('fade');
          });
        });

        btn.addEventListener('click', function (e) {
          e.preventDefault();
          const idx = btn.getAttribute('data-idx');
          const box = document.querySelector(`.bbox[data-idx="${idx}"]`);
          if (!box) return;
          
          // Set the current active box and index
          currentIdx = idx;
          activeBox = box;
          
          const rect = btn.getBoundingClientRect();
          popup.style.left = (rect.right + window.scrollX + 8) + 'px';
          popup.style.top = (rect.top + window.scrollY) + 'px';
          popup.style.display = 'block';
        });

        updateBoxes();
        updateJsonData();
      }
    }

    // Function to create guidelines
    function createGuidelines() {
      const container = imageContainer;
      
      // Create horizontal guideline
      horizontalGuideline = document.createElement('div');
      horizontalGuideline.className = 'guideline horizontal';
      container.appendChild(horizontalGuideline);
      
      // Create vertical guideline
      verticalGuideline = document.createElement('div');
      verticalGuideline.className = 'guideline vertical';
      container.appendChild(verticalGuideline);
    }

    // Function to remove guidelines
    function removeGuidelines() {
      if (horizontalGuideline) {
        horizontalGuideline.remove();
        horizontalGuideline = null;
      }
      if (verticalGuideline) {
        verticalGuideline.remove();
        verticalGuideline = null;
      }
    }

    // Function to update guideline positions
    function updateGuidelines(x, y) {
      if (!horizontalGuideline || !verticalGuideline) return;
      
      horizontalGuideline.style.top = y + 'px';
      verticalGuideline.style.left = x + 'px';
    }

    // Update the panning event handlers
    imageContainer.addEventListener('mousedown', function(e) {
      if (isCreatingBox || resizing) return; // Don't pan if creating box or resizing
      
      isPanning = true;
      lastPanPosition = { x: e.clientX, y: e.clientY };
      imageContainer.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
      if (!isPanning) return;
      
      const dx = e.clientX - lastPanPosition.x;
      const dy = e.clientY - lastPanPosition.y;
      
      // Update pan offset directly
      panOffset.x += dx;
      panOffset.y += dy;
      
      lastPanPosition = { x: e.clientX, y: e.clientY };
      
      // Update image transform
      img.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
      
      // Update all boxes positions
      updateBoxes();
    });

    document.addEventListener('mouseup', function() {
      if (isPanning) {
        isPanning = false;
        imageContainer.style.cursor = isCreatingBox ? 'crosshair' : 'grab';
      }
    });

    // Update the wheel event handler to properly handle zoom around mouse position
    imageContainer.addEventListener('wheel', function(e) {
      e.preventDefault();
      
      // Calculate zoom factor based on wheel direction
      const delta = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
      const newZoom = Math.min(Math.max(zoomLevel + delta, MIN_ZOOM), MAX_ZOOM);
      
      // Calculate mouse position relative to container
      const rect = imageContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate mouse position in image coordinates before zoom
      const imageCoords = screenToImageCoords(e.clientX, e.clientY);
      
      // Update zoom level
      zoomLevel = newZoom;
      
      // Calculate new screen position for the same image coordinates
      const newScreenCoords = imageToScreenCoords(imageCoords.x, imageCoords.y);
      
      // Update pan offset to keep mouse position fixed
      panOffset.x += mouseX - newScreenCoords.x;
      panOffset.y += mouseY - newScreenCoords.y;
      
      // Update image transform
      img.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
      
      // Update all boxes positions
      updateBoxes();
    });

    // Modify the hand button click handler
    handButton.addEventListener('click', function() {
      isCreatingBox = !isCreatingBox;
      handButton.style.backgroundColor = isCreatingBox ? '#e0e0e0' : '';
      
      if (!isCreatingBox) {
        if (creatingBox) {
          creatingBox.remove();
          creatingBox = null;
        }
        removeGuidelines();
        imageContainer.style.cursor = 'grab';
      } else {
        createGuidelines();
        imageContainer.style.cursor = 'crosshair';
      }
    });

    // Add class filter functionality
    classFilterSelect.addEventListener('change', function() {
      const selectedClass = this.value;
      const urlParams = new URLSearchParams(window.location.search);
      
      if (selectedClass === 'all') {
        urlParams.delete('class');
      } else {
        urlParams.set('class', selectedClass);
      }
      urlParams.set('page', '1'); // Reset to first page when filtering
      
      // Update URL and reload page
      window.location.href = `${window.location.pathname}?${urlParams.toString()}`;
    });

    // Set the current filter value in the dropdown
    const urlParams = new URLSearchParams(window.location.search);
    const currentFilter = urlParams.get('class');
    if (currentFilter) {
      classFilterSelect.value = currentFilter;
    }

    // Add bbox visibility toggle logic
    const bboxVisibilityToggle = document.getElementById('toggle-bbox-visibility');
    if (bboxVisibilityToggle) {
      // Restore state from localStorage
      const stored = localStorage.getItem('bbox-visibility');
      if (stored !== null) {
        bboxVisibilityToggle.checked = stored === 'true';
        document.querySelectorAll('.bbox').forEach(box => {
          box.style.display = bboxVisibilityToggle.checked ? '' : 'none';
        });
      }
      bboxVisibilityToggle.addEventListener('change', function() {
        const show = bboxVisibilityToggle.checked;
        localStorage.setItem('bbox-visibility', show);
        document.querySelectorAll('.bbox').forEach(box => {
          box.style.display = show ? '' : 'none';
        });
      });
    }

    // Add initial cursor style and transform origin
    imageContainer.style.cursor = 'grab';
    img.style.transformOrigin = '0 0';
    document.querySelectorAll('.bbox').forEach(box => {
      box.style.transformOrigin = '0 0';
    });

    // Update the mousemove handler for guidelines to use proper coordinate conversion
    imageContainer.addEventListener('mousemove', function(e) {
      if (!isCreatingBox || !horizontalGuideline || !verticalGuideline) return;
      
      const rect = imageContainer.getBoundingClientRect();
      const coords = screenToImageCoords(e.clientX, e.clientY);
      const screenCoords = imageToScreenCoords(coords.x, coords.y);
      
      updateGuidelines(screenCoords.x, screenCoords.y);
    });

    // Update the mousedown handler for creating boxes
    imageContainer.addEventListener('mousedown', function(e) {
      if (!isCreatingBox) return;
      
      const coords = screenToImageCoords(e.clientX, e.clientY);
      startX = coords.x;
      startY = coords.y;

      creatingBox = document.createElement('div');
      creatingBox.className = 'creating-box';
      
      // Calculate initial position using screen coordinates
      const screenCoords = imageToScreenCoords(startX, startY);
      creatingBox.style.left = screenCoords.x + 'px';
      creatingBox.style.top = screenCoords.y + 'px';
      imageContainer.appendChild(creatingBox);

      function onMouseMove(ev) {
        if (!creatingBox) return;
        const currentCoords = screenToImageCoords(ev.clientX, ev.clientY);
        const width = Math.abs(currentCoords.x - startX);
        const height = Math.abs(currentCoords.y - startY);
        const left = Math.min(startX, currentCoords.x);
        const top = Math.min(startY, currentCoords.y);

        const screenCoords = imageToScreenCoords(left, top);
        creatingBox.style.left = screenCoords.x + 'px';
        creatingBox.style.top = screenCoords.y + 'px';
        creatingBox.style.width = (width * img.width / img.naturalWidth * zoomLevel) + 'px';
        creatingBox.style.height = (height * img.height / img.naturalHeight * zoomLevel) + 'px';
      }

      function onMouseUp(ev) {
        if (!creatingBox) return;
        const currentCoords = screenToImageCoords(ev.clientX, ev.clientY);
        const width = Math.abs(currentCoords.x - startX);
        const height = Math.abs(currentCoords.y - startY);
        const left = Math.min(startX, currentCoords.x);
        const top = Math.min(startY, currentCoords.y);

        if (width > 10 && height > 10) {
          const label = prompt('Enter label for the new box:');
          if (label && label.trim() !== '') {
            createNewBox(left, top, width, height, label);
            // Force an immediate update of all boxes
            updateBoxes();
          }
        }

        creatingBox.remove();
        creatingBox = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Add 'Delete All Corrections' button to the tools panel
    const functionsPanel = document.querySelector('.tools-panel');
    if (functionsPanel) {
      const deleteAllBtn = document.createElement('button');
      deleteAllBtn.textContent = 'Delete All Corrections';
      deleteAllBtn.style.background = '#ff4d4d';
      deleteAllBtn.style.color = 'white';
      deleteAllBtn.style.margin = '8px 0';
      deleteAllBtn.style.fontWeight = 'bold';
      deleteAllBtn.onclick = function () {
        if (confirm('Are you sure? This action deletes all changes made.')) {
          fetch('/reset_working_copy', { method: 'POST' })
            .then(res => {
              if (!res.ok) throw new Error('Failed to reset working copy');
              return res.json();
            })
            .then(data => {
              if (data.success) {
                window.location.reload();
              } else {
                alert('Failed to reset corrections: ' + (data.error || 'Unknown error'));
              }
            })
            .catch(err => {
              alert('Failed to reset corrections: ' + err.message);
            });
        }
      };
      functionsPanel.appendChild(deleteAllBtn);
    }

    // Add function to update stats
    function updateStats() {
      fetch('/get_stats_data')
        .then(res => res.json())
        .then(data => {
          const { original, working } = data;
          const correctionLog = computeCorrectionLog(original, working);
          updateStats(correctionLog, working);
        })
        .catch(error => {
          console.error('Error updating stats:', error);
        });
    }

    // Add multi-select functionality
    const objectsPanel = document.querySelector('.objects-panel');
    const multiSelectBtn = document.createElement('button');
    multiSelectBtn.textContent = 'Select Multiple';
    multiSelectBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      margin: 8px 0;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    objectsPanel.insertBefore(multiSelectBtn, objectsPanel.firstChild.nextSibling);

    let isMultiSelectMode = false;
    let selectedBoxes = new Set();

    // Add bulk actions container
    const bulkActions = document.createElement('div');
    bulkActions.style.cssText = `
      display: none;
      margin: 8px 0;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
    `;
    objectsPanel.insertBefore(bulkActions, multiSelectBtn.nextSibling);

    // Add bulk action buttons
    const bulkRenameBtn = document.createElement('button');
    bulkRenameBtn.textContent = 'Rename Selected';
    bulkRenameBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      margin: 4px 0;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;

    const bulkDeleteBtn = document.createElement('button');
    bulkDeleteBtn.textContent = 'Delete Selected';
    bulkDeleteBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      margin: 4px 0;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;

    bulkActions.appendChild(bulkRenameBtn);
    bulkActions.appendChild(bulkDeleteBtn);

    // Function to handle button clicks
    function handleButtonClick(e, btn) {
      if (isMultiSelectMode) {
        e.preventDefault();
        e.stopPropagation();
        const idx = btn.getAttribute('data-idx');
        const box = document.querySelector(`.bbox[data-idx="${idx}"]`);
        
        if (selectedBoxes.has(idx)) {
          selectedBoxes.delete(idx);
          btn.style.border = '2px solid transparent';
          btn.classList.remove('selected');
          box.classList.remove('highlight');
          box.classList.add('fade');
        } else {
          selectedBoxes.add(idx);
          btn.style.border = '2px solid #2196F3';
          btn.classList.add('selected');
          box.classList.add('highlight');
          box.classList.remove('fade');
        }
        return false;
      } else {
        // Normal mode - show popup
        e.preventDefault();
        currentIdx = btn.getAttribute('data-idx');
        activeBox = document.querySelector(`.bbox[data-idx="${currentIdx}"]`);
        if (!activeBox) return;
        const rect = btn.getBoundingClientRect();
        popup.style.left = (rect.right + window.scrollX + 8) + 'px';
        popup.style.top = (rect.top + window.scrollY) + 'px';
        popup.style.display = 'block';
      }
    }

    // Toggle multi-select mode
    multiSelectBtn.addEventListener('click', function() {
      isMultiSelectMode = !isMultiSelectMode;
      selectedBoxes.clear();
      
      if (isMultiSelectMode) {
        multiSelectBtn.style.background = '#2196F3';
        multiSelectBtn.textContent = 'Cancel Selection';
        bulkActions.style.display = 'block';
        
        // Update button styles
        document.querySelectorAll('.object-btn').forEach(btn => {
          btn.style.border = '2px solid transparent';
        });
      } else {
        multiSelectBtn.style.background = '#4CAF50';
        multiSelectBtn.textContent = 'Select Multiple';
        bulkActions.style.display = 'none';
        
        // Reset button styles
        document.querySelectorAll('.object-btn').forEach(btn => {
          btn.style.border = '';
          btn.classList.remove('selected');
        });
        
        // Reset box styles
        document.querySelectorAll('.bbox').forEach(box => {
          box.classList.remove('highlight');
          box.classList.remove('fade');
        });
      }
    });

    // Remove all existing click handlers and add our new one
    document.querySelectorAll('.object-btn').forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', (e) => handleButtonClick(e, newBtn));

      // Add hover effects
      newBtn.addEventListener('mouseenter', function() {
        const idx = newBtn.getAttribute('data-idx');
        document.querySelectorAll('.bbox').forEach(box => {
          if (box.getAttribute('data-idx') === idx) {
            box.classList.add('highlight');
            // Only remove fade if not in multi-select mode or if this box is selected
            if (!isMultiSelectMode || selectedBoxes.has(idx)) {
              box.classList.remove('fade');
            }
          } else {
            // In multi-select mode, don't fade selected boxes
            if (!isMultiSelectMode || !selectedBoxes.has(box.getAttribute('data-idx'))) {
              box.classList.remove('highlight');
              box.classList.add('fade');
            }
          }
        });
      });

      newBtn.addEventListener('mouseleave', function() {
        document.querySelectorAll('.bbox').forEach(box => {
          const idx = box.getAttribute('data-idx');
          // In multi-select mode, maintain selection state
          if (!isMultiSelectMode || !selectedBoxes.has(idx)) {
            box.classList.remove('highlight');
            box.classList.remove('fade');
          }
        });
      });
    });

    // Update the createNewBox function to use the new click handler
    const originalCreateNewBox = createNewBox;
    createNewBox = function(x, y, width, height, label) {
      originalCreateNewBox(x, y, width, height, label);
      // Add click handler to the newly created button
      const newBtn = document.querySelector(`.object-btn[data-idx="${document.querySelectorAll('.object-btn').length - 1}"]`);
      if (newBtn) {
        newBtn.addEventListener('click', (e) => handleButtonClick(e, newBtn));
      }
    };

    // Bulk rename handler
    bulkRenameBtn.addEventListener('click', function() {
      if (selectedBoxes.size === 0) {
        alert('Please select at least one object to rename');
        return;
      }

      const newLabel = prompt('Enter new label for selected objects:');
      if (!newLabel || newLabel.trim() === '') return;

      // Get category for the new label
      const existingCategory = getCategoryForLabel(newLabel);
      let category = existingCategory;

      if (!category) {
        // Show category selection modal for new label
        const existingCategories = getExistingCategories();
        const modal = document.createElement('div');
        modal.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 1000;
        `;

        const title = document.createElement('h3');
        title.textContent = `Select Category for "${newLabel}"`;
        title.style.marginBottom = '15px';
        modal.appendChild(title);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 15px;
        `;

        // Add "Create New Category" button
        const newCategoryBtn = document.createElement('button');
        newCategoryBtn.textContent = 'Create New Category';
        newCategoryBtn.style.cssText = `
          padding: 8px 16px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        `;
        newCategoryBtn.onclick = () => {
          const newCategory = prompt('Enter new category name:');
          if (newCategory && newCategory.trim()) {
            category = newCategory.trim();
            modal.remove();
            performBulkRename();
          }
        };
        buttonContainer.appendChild(newCategoryBtn);

        // Add existing categories as buttons
        existingCategories.forEach(cat => {
          const catBtn = document.createElement('button');
          catBtn.textContent = cat;
          catBtn.style.cssText = `
            padding: 8px 16px;
            background: #f0f0f0;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
          `;
          catBtn.onclick = () => {
            category = cat;
            modal.remove();
            performBulkRename();
          };
          buttonContainer.appendChild(catBtn);
        });

        modal.appendChild(buttonContainer);
        document.body.appendChild(modal);
      } else {
        performBulkRename();
      }

      function performBulkRename() {
        if (!category) {
          category = "Miscellaneous";
        }

        selectedBoxes.forEach(idx => {
          const box = document.querySelector(`.bbox[data-idx="${idx}"]`);
          const btn = document.querySelector(`.object-btn[data-idx="${idx}"]`);
          if (box && btn) {
            box.title = newLabel;
            box.dataset.category = category;
            btn.textContent = newLabel;
            btn.dataset.category = category;
          }
        });

        updateJsonData();
        // Exit multi-select mode
        multiSelectBtn.click();
      }
    });

    // Bulk delete handler
    bulkDeleteBtn.addEventListener('click', function() {
      if (selectedBoxes.size === 0) {
        alert('Please select at least one object to delete');
        return;
      }

      if (!confirm(`Are you sure you want to delete ${selectedBoxes.size} selected objects?`)) {
        return;
      }

      // Get current page and filter from URL
      const urlParams = new URLSearchParams(window.location.search);
      const page = urlParams.get('page') || '1';
      const filterClass = urlParams.get('class');

      // Remove selected boxes and buttons
      selectedBoxes.forEach(idx => {
        const box = document.querySelector(`.bbox[data-idx="${idx}"]`);
        const btn = document.querySelector(`.object-btn[data-idx="${idx}"]`);
        if (box) box.remove();
        if (btn) btn.remove();
      });

      // Update indices of remaining boxes and buttons
      const remainingBoxes = document.querySelectorAll('.bbox');
      const remainingButtons = document.querySelectorAll('.object-btn');
      
      remainingBoxes.forEach((box, index) => {
        box.dataset.idx = index.toString();
      });
      
      remainingButtons.forEach((btn, index) => {
        btn.dataset.idx = index.toString();
      });

      // Update JSON data
      const detections = Array.from(remainingBoxes).map(box => ({
        label: box.title,
        category: box.dataset.category || "Miscellaneous",
        bbox: [
          parseFloat(box.dataset.x),
          parseFloat(box.dataset.y),
          parseFloat(box.dataset.x) + parseFloat(box.dataset.w),
          parseFloat(box.dataset.y) + parseFloat(box.dataset.h)
        ]
      }));

      // Update allDetectionsData
      if (window.allDetectionsData) {
        window.allDetectionsData = window.allDetectionsData.filter(detection => {
          if (detection._image_file !== img.src.split('/').pop()) {
            return true;
          }
          return detections.some(d => 
            d.label === detection.label &&
            d.bbox[0] === detection.bbox[0] &&
            d.bbox[1] === detection.bbox[1] &&
            d.bbox[2] === detection.bbox[2] &&
            d.bbox[3] === detection.bbox[3]
          );
        });
      }

      fetch(`/update_detections?page=${page}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_file: img.src.split('/').pop(),
          detections: detections
        })
      }).then(() => {
        if (filterClass && filterClass !== 'all') {
          const remainingClassDetections = detections.filter(d => d.label === filterClass);
          if (remainingClassDetections.length === 0) {
            window.location.href = `${window.location.pathname}?page=1&class=${filterClass}`;
            return;
          }
        }
        updateStats();
        // Exit multi-select mode
        multiSelectBtn.click();
      }).catch(error => {
        console.error('Error updating detections:', error);
        alert('Failed to save changes. Please try again.');
      });
    });
  });
  