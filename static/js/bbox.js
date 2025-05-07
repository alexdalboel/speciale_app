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
    `;
    document.head.appendChild(style);
  
    const img = document.getElementById('main-image');
    const bboxes = document.querySelectorAll('.bbox');
    const handButton = document.querySelector('.icon.hand');
    const classFilterSelect = document.getElementById('class-filter-select');
    const imageContainer = img.parentElement;
    if (!img) return;
  
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
          } else {
            box.dataset.category = "Miscellaneous";
          }
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
      } else {
        box.dataset.category = "Miscellaneous";
      }
    });
  
    let isCreatingBox = false;
    let startX, startY;
    let creatingBox = null;
    let horizontalGuideline = null;
    let verticalGuideline = null;
  
    function updateBoxes() {
      // Get the actual displayed size and position of the image
      const imgRect = img.getBoundingClientRect();
      const containerRect = imageContainer.getBoundingClientRect();
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayedWidth = imgRect.width;
      const displayedHeight = imgRect.height;
      // Offset of the image inside the container
      const offsetX = imgRect.left - containerRect.left;
      const offsetY = imgRect.top - containerRect.top;
      const scaleX = displayedWidth / naturalWidth;
      const scaleY = displayedHeight / naturalHeight;

      document.querySelectorAll('.bbox').forEach(box => {
        const x = parseFloat(box.dataset.x);
        const y = parseFloat(box.dataset.y);
        const w = parseFloat(box.dataset.w);
        const h = parseFloat(box.dataset.h);

        // Calculate positions relative to the container
        const left = offsetX + x * scaleX;
        const top = offsetY + y * scaleY;
        const width = w * scaleX;
        const height = h * scaleY;

        // Set the position and size
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
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
      console.log('Getting category for label:', label);
      console.log('Current all detections data:', window.allDetectionsData);

      // First check in the DOM for boxes with the same label
      const existingBoxes = document.querySelectorAll('.bbox');
      for (const box of existingBoxes) {
        if (box.title === label && box.dataset.category) {
          console.log('Found category in DOM:', box.dataset.category);
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
          console.log('Found category in detections data:', matchingDetection.category);
          return matchingDetection.category;
        }
      }

      console.log('No category found for label:', label);
      return null;
    }

    // Function to update the JSON data on the server
    async function updateJsonData() {
      try {
        // Get current page from URL
        const urlParams = new URLSearchParams(window.location.search);
        const page = urlParams.get('page') || '1';
        const currentImage = img.src.split('/').pop();

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
  
          resizeState.x = ((newL - offsetX) / scaleX);
          resizeState.y = ((newT - offsetY) / scaleY);
          resizeState.w = newW / scaleX;
          resizeState.h = newH / scaleY;
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
      console.log('Resize clicked');
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

      // Get current page from URL
      const urlParams = new URLSearchParams(window.location.search);
      const page = urlParams.get('page') || '1';

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
      }).catch(error => {
        console.error('Error updating detections:', error);
        alert('Failed to save changes. Please try again.');
      });
    };

    function addResizeHandles(bbox) {
      console.log('Adding resize handles');
      removeResizeHandles(bbox);
      bbox.classList.add('resizing');
      ['nw', 'ne', 'sw', 'se'].forEach(dir => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle ' + dir;
        handle.dataset.dir = dir;
        bbox.appendChild(handle);
      });
      console.log('Resize handles added:', bbox.querySelectorAll('.resize-handle').length);
    }
  
    function removeResizeHandles(bbox) {
      if (!bbox) return;
      bbox.classList.remove('resizing');
      bbox.querySelectorAll('.resize-handle').forEach(h => h.remove());
    }
  
    function cancelResize() {
      console.log('Canceling resize');
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

    // Function to convert screen coordinates to image coordinates
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

      return {
        x: (screenX - rect.left - offsetX) / scaleX,
        y: (screenY - rect.top - offsetY) / scaleY
      };
    }

    // Function to convert image coordinates to screen coordinates
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

      return {
        x: offsetX + (imageX * scaleX),
        y: offsetY + (imageY * scaleY)
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
        imageContainer.style.cursor = 'default';
      } else {
        createGuidelines();
        imageContainer.style.cursor = 'crosshair';
      }
    });

    // Modify the mousemove handler for guidelines
    imageContainer.addEventListener('mousemove', function(e) {
      if (!isCreatingBox || !horizontalGuideline || !verticalGuideline) return;
      
      const rect = imageContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      updateGuidelines(x, y);
    });

    // Modify the mousedown handler for creating boxes
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
        creatingBox.style.width = (width * img.width / img.naturalWidth) + 'px';
        creatingBox.style.height = (height * img.height / img.naturalHeight) + 'px';
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
  });
  