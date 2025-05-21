// Fetch both original and working detections, then compute and visualize the diff
fetch('/get_stats_data')
  .then(res => res.json())
  .then(data => {
    const { original, working } = data;
    const correctionLog = computeCorrectionLog(original, working);
    updateStats(correctionLog, working);
    initializeFilters(correctionLog, working, original);
  });

// Global variables for filters
let selectedCategory = null;
let selectedLabel = null;
let originalDetections = null;

// Initialize category and label filters
function initializeFilters(correctionLog, detectionsData, originalData) {
  originalDetections = originalData;
  // Get unique categories and labels
  const categories = new Set();
  const labels = new Set();
  
  detectionsData.forEach(img => {
    img.detections?.forEach(det => {
      if (det.category) categories.add(det.category);
      if (det.label) labels.add(det.label);
    });
  });

  // Create category buttons
  const categoryContainer = document.getElementById('category-buttons');
  const allCategoriesBtn = document.createElement('button');
  allCategoriesBtn.textContent = 'All Categories';
  allCategoriesBtn.className = 'filter-btn active';
  allCategoriesBtn.onclick = () => {
    document.querySelectorAll('#category-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
    allCategoriesBtn.classList.add('active');
    selectedCategory = null;
    updateVisualizations(correctionLog, detectionsData);
  };
  categoryContainer.appendChild(allCategoriesBtn);

  Array.from(categories).sort().forEach(category => {
    const btn = document.createElement('button');
    btn.textContent = category;
    btn.className = 'filter-btn';
    btn.dataset.category = category;
    btn.onclick = () => {
      document.querySelectorAll('#category-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = category;
      updateLabelButtons(correctionLog, detectionsData);
      updateVisualizations(correctionLog, detectionsData);
    };
    categoryContainer.appendChild(btn);
  });

  // Create label buttons
  const labelContainer = document.getElementById('label-buttons');
  const allLabelsBtn = document.createElement('button');
  allLabelsBtn.textContent = 'All Labels';
  allLabelsBtn.className = 'filter-btn active';
  allLabelsBtn.onclick = () => {
    document.querySelectorAll('#label-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
    allLabelsBtn.classList.add('active');
    selectedLabel = null;
    updateVisualizations(correctionLog, detectionsData);
  };
  labelContainer.appendChild(allLabelsBtn);

  // Add reset button functionality
  document.getElementById('reset-filters').addEventListener('click', () => {
    // Reset category filter
    document.querySelectorAll('#category-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
    categoryContainer.querySelector('button').classList.add('active');
    selectedCategory = null;

    // Reset label filter
    document.querySelectorAll('#label-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
    labelContainer.querySelector('button').classList.add('active');
    selectedLabel = null;

    // Update label buttons to show all labels
    updateLabelButtons(correctionLog, detectionsData);

    // Update visualizations
    updateVisualizations(correctionLog, detectionsData);
  });

  updateLabelButtons(correctionLog, detectionsData);
}

// Update label buttons based on selected category
function updateLabelButtons(correctionLog, detectionsData) {
  const labelContainer = document.getElementById('label-buttons');
  const allLabelsBtn = labelContainer.querySelector('button');
  labelContainer.innerHTML = '';
  labelContainer.appendChild(allLabelsBtn);

  const labels = new Set();
  detectionsData.forEach(img => {
    img.detections?.forEach(det => {
      if (det.label && (!selectedCategory || det.category === selectedCategory)) {
        labels.add(det.label);
      }
    });
  });

  Array.from(labels).sort().forEach(label => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = 'filter-btn';
    btn.onclick = () => {
      document.querySelectorAll('#label-buttons .filter-btn').forEach(btn => btn.classList.remove('active'));
      btn.classList.add('active');
      selectedLabel = label;
      updateVisualizations(correctionLog, detectionsData);
    };
    labelContainer.appendChild(btn);
  });
}

// Update all visualizations based on current filters
function updateVisualizations(correctionLog, detectionsData) {
  const filteredLog = correctionLog.filter(c => {
    if (selectedCategory) {
      // For label changes, check the original label's category from original detections
      if (c.type === 'label_change') {
        const originalImg = originalDetections.find(img => img.image_file === c.imageId);
        const originalDetection = originalImg?.detections?.find(d => d.label === c.originalLabel);
        if (!originalDetection || originalDetection.category !== selectedCategory) return false;
      } else {
        // For other types, check the current label's category
        const detection = detectionsData.find(img => img.image_file === c.imageId)
          ?.detections?.find(d => d.label === (c.type === 'add' ? c.newLabel : c.originalLabel));
        if (!detection || detection.category !== selectedCategory) return false;
      }
    }
    if (selectedLabel) {
      if (c.type === 'label_change') {
        if (c.originalLabel !== selectedLabel) return false;
      } else {
        if (c.type === 'add' && c.newLabel !== selectedLabel) return false;
        if (c.type === 'remove' && c.originalLabel !== selectedLabel) return false;
      }
    }
    return true;
  });

  const filteredData = detectionsData.filter(img => {
    if (selectedCategory) {
      return img.detections?.some(d => d.category === selectedCategory);
    }
    if (selectedLabel) {
      return img.detections?.some(d => d.label === selectedLabel);
    }
    return true;
  });

  updateStats(filteredLog, filteredData);
}

// Make functions available globally
window.computeCorrectionLog = function(original, working) {
  const log = [];
  const IOU_THRESHOLD = 0.3; // Lower threshold to better handle resized boxes

  for (let i = 0; i < original.length; i++) {
    const origImg = original[i];
    const workImg = working[i];
    const imageId = origImg.image_file;
    const origDet = origImg.detections || [];
    const workDet = workImg.detections || [];

    // Create a copy of working detections that we can modify
    let remainingWorkDet = [...workDet];
    let remainingOrigDet = [...origDet];

    // First, find all exact matches (same label and similar bbox)
    for (let oidx = remainingOrigDet.length - 1; oidx >= 0; oidx--) {
      const od = remainingOrigDet[oidx];
      let matchFound = false;

      for (let widx = remainingWorkDet.length - 1; widx >= 0; widx--) {
        const wd = remainingWorkDet[widx];
        
        if (od.label === wd.label) {
          const iouVal = iou(od.bbox, wd.bbox);
          if (iouVal > IOU_THRESHOLD) {
            // Check if bbox changed
            const bboxChanged = od.bbox.some((coord, idx) => Math.abs(coord - wd.bbox[idx]) > 0.0001);
            if (bboxChanged) {
              log.push({
                imageId,
                type: 'bbox_adjust',
                originalLabel: od.label,
                bbox: wd.bbox,
                undone: false
              });
            }
            // Remove matched detections
            remainingOrigDet.splice(oidx, 1);
            remainingWorkDet.splice(widx, 1);
            matchFound = true;
            break;
          }
        }
      }
    }

    // Then, find label changes (different label but similar bbox)
    for (let oidx = remainingOrigDet.length - 1; oidx >= 0; oidx--) {
      const od = remainingOrigDet[oidx];
      let matchFound = false;

      for (let widx = remainingWorkDet.length - 1; widx >= 0; widx--) {
        const wd = remainingWorkDet[widx];
        const iouVal = iou(od.bbox, wd.bbox);
        
        if (iouVal > IOU_THRESHOLD) {
          log.push({
            imageId,
            type: 'label_change',
            originalLabel: od.label,
            newLabel: wd.label,
            bbox: wd.bbox,
            undone: false
          });
          // Remove matched detections
          remainingOrigDet.splice(oidx, 1);
          remainingWorkDet.splice(widx, 1);
          matchFound = true;
          break;
        }
      }
    }

    // Any remaining original detections are deletions
    remainingOrigDet.forEach(od => {
      log.push({
        imageId,
        type: 'remove',
        originalLabel: od.label,
        bbox: od.bbox,
        undone: false
      });
    });

    // Any remaining working detections are additions
    remainingWorkDet.forEach(wd => {
      log.push({
        imageId,
        type: 'add',
        newLabel: wd.label,
        bbox: wd.bbox,
        undone: false
      });
    });
  }
  return log;
};

window.updateStats = function(correctionLog, detectionsData) {
  const active = correctionLog.filter(c => !c.undone);

  // Calculate overall statistics
  const totalImages = detectionsData.length;
  const totalDetections = detectionsData.reduce((sum, img) => sum + (img.detections?.length || 0), 0);
  const avgDetections = (totalDetections / totalImages).toFixed(1);
  
  // Get unique labels from all detections
  const uniqueLabels = new Set();
  detectionsData.forEach(img => {
    img.detections?.forEach(det => uniqueLabels.add(det.label));
  });

  // Update the statistics cards with animation
  function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const animate = () => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        element.textContent = end;
      } else {
        element.textContent = Math.round(current);
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }

  // Add hover effect to cards
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 6px 16px var(--card-shadow)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 4px 12px var(--card-shadow)';
    });
  });

  // Update stats with animation
  animateValue(document.getElementById('total-images'), 0, totalImages, 1000);
  animateValue(document.getElementById('total-detections'), 0, totalDetections, 1000);
  document.getElementById('avg-detections').textContent = avgDetections;
  animateValue(document.getElementById('unique-labels'), 0, uniqueLabels.size, 1000);

  // 1. Label Change Sankey Diagram
  // Build label change flows
  const labelRenames = active.filter(
    c => c.type === 'label_change' && c.originalLabel !== c.newLabel
  );
  const sankeyCounts = {};
  labelRenames.forEach(c => {
    const key = c.originalLabel + '→' + c.newLabel;
    sankeyCounts[key] = (sankeyCounts[key] || 0) + 1;
  });
  const sankeyLabelsSet = new Set();
  labelRenames.forEach(c => {
    sankeyLabelsSet.add(c.originalLabel);
    sankeyLabelsSet.add(c.newLabel);
  });
  const sankeyLabels = Array.from(sankeyLabelsSet);
  const sankeySource = [];
  const sankeyTarget = [];
  const sankeyValue = [];
  Object.entries(sankeyCounts).forEach(([key, count]) => {
    const [orig, corr] = key.split('→');
    sankeySource.push(sankeyLabels.indexOf(orig));
    sankeyTarget.push(sankeyLabels.indexOf(corr));
    sankeyValue.push(count);
  });
  // Calculate incoming totals for each corrected label (target)
  const incomingTotals = Array(sankeyLabels.length).fill(0);
  sankeyTarget.forEach((targetIdx, i) => {
    incomingTotals[targetIdx] += sankeyValue[i];
  });
  // Update labels for corrected labels (targets) to include the count
  // Only update if the label is a target (i.e., appears as a corrected label)
  const correctedLabelSet = new Set(labelRenames.map(c => c.newLabel));
  const sankeyLabelsWithCounts = sankeyLabels.map((label, idx) =>
    correctedLabelSet.has(label) ? `${label} (${incomingTotals[idx]})` : label
  );
  Plotly.newPlot('label-change-sankey', [{
    type: 'sankey',
    orientation: 'h',
    node: {
      pad: 15,
      thickness: 20,
      line: { color: 'black', width: 0.5 },
      label: sankeyLabelsWithCounts,
      color: '#cccccc',
      hovertemplate: '%{label}<extra></extra>'
    },
    link: {
      source: sankeySource,
      target: sankeyTarget,
      value: sankeyValue,
      color: 'rgba(55,126,184,0.4)',
      hovertemplate: '<b>%{source.label} → %{target.label}</b><br>Count: %{value}<extra></extra>'
    }
  }], {
    margin: { t: 10, r: 10, b: 40, l: 60 },
    font: { family: 'inherit', size: 13 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    autosize: true,
    responsive: true
  });

  // 2. Most Frequently Added/Removed Labels
  const added = {}, removed = {};
  active.forEach(c => {
    if (c.type === 'add' && c.type !== 'bbox_adjust') added[c.newLabel] = (added[c.newLabel] || 0) + 1;
    if (c.type === 'remove') removed[c.originalLabel] = (removed[c.originalLabel] || 0) + 1;
  });
  const addedLabels = Object.keys(added);
  const removedLabels = Object.keys(removed);
  Plotly.newPlot('added-removed-labels', [
    {
      x: addedLabels,
      y: addedLabels.map(l => added[l]),
      name: 'Added',
      type: 'bar',
      marker: { 
        color: '#377eb8', // blue (colorblind-friendly)
        line: { width: 0 }
      },
      hovertemplate: '<b>Label:</b> %{x}<br><b>Added:</b> %{y}<extra></extra>',
      text: addedLabels.map(l => added[l]),
      textposition: 'outside',
      textfont: { size: 12 }
    },
    {
      x: removedLabels,
      y: removedLabels.map(l => removed[l]),
      name: 'Removed',
      type: 'bar',
      marker: { 
        color: '#ff7f00', // orange (colorblind-friendly)
        line: { width: 0 }
      },
      hovertemplate: '<b>Label:</b> %{x}<br><b>Removed:</b> %{y}<extra></extra>',
      text: removedLabels.map(l => removed[l]),
      textposition: 'outside',
      textfont: { size: 12 }
    }
  ], {
    barmode: 'group',
    margin: { t: 10, r: 10, b: 60, l: 40 },
    xaxis: { 
      title: 'Label',
      tickangle: -30,
      tickfont: { size: 12 },
      automargin: true,
      gridcolor: 'rgba(128, 128, 128, 0.1)'
    },
    yaxis: { 
      title: 'Count',
      gridcolor: 'rgba(128, 128, 128, 0.1)',
      automargin: true
    },
    legend: { 
      orientation: 'h',
      y: -0.2,
      x: 0.5,
      xanchor: 'center'
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'inherit' },
    bargap: 0.15,
    bargroupgap: 0.1,
    autosize: true,
    responsive: true
  });

  // 4. Top Images with Most Corrections
  const imageCounts = {};
  active.forEach(c => {
    imageCounts[c.imageId] = (imageCounts[c.imageId] || 0) + 1;
  });
  const topImages = Object.entries(imageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  Plotly.newPlot('top-images-corrections', [{
    x: topImages.map(([img]) => img),
    y: topImages.map(([, count]) => count),
    type: 'bar',
    marker: { 
      color: '#9C27B0',
      line: { width: 0 }
    },
    hovertemplate: '<b>Image:</b> %{x}<br><b>Corrections:</b> %{y}<extra></extra>',
    text: topImages.map(([, count]) => count),
    textposition: 'outside',
    textfont: { size: 12 }
  }], {
    margin: { t: 10, r: 10, b: 60, l: 40 },
    xaxis: { 
      title: 'Image',
      tickangle: -30,
      tickfont: { size: 12 },
      automargin: true,
      gridcolor: 'rgba(128, 128, 128, 0.1)'
    },
    yaxis: { 
      title: 'Corrections',
      gridcolor: 'rgba(128, 128, 128, 0.1)',
      automargin: true
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'inherit' },
    bargap: 0.3,
    autosize: true,
    responsive: true
  });
};

window.iou = function(boxA, boxB) {
  const [xA1, yA1, xA2, yA2] = boxA;
  const [xB1, yB1, xB2, yB2] = boxB;
  const x1 = Math.max(xA1, xB1);
  const y1 = Math.max(yA1, yB1);
  const x2 = Math.min(xA2, xB2);
  const y2 = Math.min(yA2, yB2);
  const interArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const boxAArea = (xA2 - xA1) * (yA2 - yA1);
  const boxBArea = (xB2 - xB1) * (yB2 - yB1);
  const unionArea = boxAArea + boxBArea - interArea;
  return unionArea === 0 ? 0 : interArea / unionArea;
};
