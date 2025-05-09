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
  const IOU_THRESHOLD = 0.5;
  for (let i = 0; i < original.length; i++) {
    const origImg = original[i];
    const workImg = working[i];
    const imageId = origImg.image_file;
    const origDet = origImg.detections || [];
    const workDet = workImg.detections || [];

    // Track which detections have been matched
    const matchedOrig = new Set();
    const matchedWork = new Set();

    // For each original detection, find best match in working by IoU
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
        // Use a small threshold to account for floating point precision
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

  // 1. Label Change Heatmap
  const labelRenames = active.filter(
    c => c.type === 'label_change' && c.originalLabel !== c.newLabel
  );
  const labelSet = new Set();
  labelRenames.forEach(c => {
    labelSet.add(c.originalLabel);
    labelSet.add(c.newLabel);
  });
  const labels = Array.from(labelSet);
  const heatmapMatrix = labels.map(() => labels.map(() => 0));
  labelRenames.forEach(c => {
    const i = labels.indexOf(c.originalLabel);
    const j = labels.indexOf(c.newLabel);
    heatmapMatrix[i][j] += 1;
  });
  Plotly.newPlot('label-change-heatmap', [{
    z: heatmapMatrix,
    x: labels,
    y: labels,
    type: 'heatmap',
    colorscale: 'YlOrRd',
    hoverongaps: false,
    hovertemplate: 'Original: %{y}<br>Corrected: %{x}<br>Instances: %{z}<extra></extra>'
  }], {
    title: 'Label Change Heatmap',
    xaxis: { title: 'Corrected Label' },
    yaxis: { title: 'Original Label' }
  });

  // 2. Most Frequently Added/Removed Labels
  const added = {}, removed = {};
  active.forEach(c => {
    if (c.type === 'add') added[c.newLabel] = (added[c.newLabel] || 0) + 1;
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
      marker: { color: 'green' }
    },
    {
      x: removedLabels,
      y: removedLabels.map(l => removed[l]),
      name: 'Removed',
      type: 'bar',
      marker: { color: 'red' }
    }
  ], {
    barmode: 'group',
    title: 'Most Frequently Added/Removed Labels',
    xaxis: { title: 'Label' },
    yaxis: { title: 'Count' }
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
    textinfo: 'label+percent',
    marker: { colors: ['#636EFA', '#EF553B', '#00CC96', '#AB63FA'] }
  }], {
    title: 'Correction Type Breakdown'
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
    marker: { color: '#FFA15A' }
  }], {
    title: 'Top Images with Most Corrections',
    xaxis: { title: 'Image' },
    yaxis: { title: 'Corrections' }
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
