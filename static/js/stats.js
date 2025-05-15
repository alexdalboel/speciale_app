// Fetch both original and working detections, then compute and visualize the diff
fetch('/get_stats_data')
  .then(res => res.json())
  .then(data => {
    const { original, working } = data;
    const correctionLog = computeCorrectionLog(original, working);
    updateStats(correctionLog, working);
  });

// Compute a correction log (diff) between original and working detections using IoU-based matching
function computeCorrectionLog(original, working) {
  const log = [];
  const IOU_THRESHOLD = 0.3; // Lower threshold to better handle resized boxes
  for (let i = 0; i < original.length; i++) {
    const origImg = original[i];
    const workImg = working[i];
    const imageId = origImg.image_file;
    const origDet = origImg.detections || [];
    const workDet = workImg.detections || [];

    // Track which detections have been matched
    const matchedOrig = new Set();
    const matchedWork = new Set();

    // First pass: Try to match detections with same label
    origDet.forEach((od, oidx) => {
      let bestMatchIdx = -1;
      let bestIoU = 0;
      workDet.forEach((wd, widx) => {
        if (matchedWork.has(widx)) return;
        const iouVal = iou(od.bbox, wd.bbox);
        if (iouVal > bestIoU) {
          bestIoU = iouVal;
          bestMatchIdx = widx;
        }
      });
      if (bestIoU > IOU_THRESHOLD && bestMatchIdx !== -1) {
        matchedOrig.add(oidx);
        matchedWork.add(bestMatchIdx);
        const wd = workDet[bestMatchIdx];
        if (od.label !== wd.label) {
          log.push({
            imageId,
            type: 'label_change',
            originalLabel: od.label,
            newLabel: wd.label,
            bbox: wd.bbox,
            undone: false
          });
        }
        // Only log bbox adjustment if the bbox coordinates are actually different
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
      } else {
        // No match found: removal
        log.push({
          imageId,
          type: 'remove',
          originalLabel: od.label,
          bbox: od.bbox,
          undone: false
        });
      }
    });

    // For each working detection not matched, it's an addition
    workDet.forEach((wd, widx) => {
      if (!matchedWork.has(widx)) {
        log.push({
          imageId,
          type: 'add',
          newLabel: wd.label,
          bbox: wd.bbox,
          undone: false
        });
      }
    });
  }
  return log;
}

function updateStats(correctionLog, detectionsData) {
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

  // 3. Correction Type Breakdown
  const typeCounts = {};
  active.forEach(c => {
    let type = c.type === 'remove' ? 'delete' : c.type;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });
  Plotly.newPlot('correction-type-breakdown', [{
    labels: Object.keys(typeCounts),
    values: Object.values(typeCounts),
    type: 'pie',
    textinfo: 'percent+label',
    textposition: 'inside',
    hole: 0.4,
    marker: { 
      colors: ['#377eb8', '#ff7f00', '#984ea3', '#ffff33'],
      line: { width: 0 }
    },
    hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>',
    insidetextorientation: 'auto',
    textfont: { size: 13 },
    constraintext: 'both'
  }], {
    margin: { t: 10, r: 10, b: 10, l: 10 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'inherit' },
    showlegend: false,
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
}

function iou(boxA, boxB) {
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
}
