// Function to fetch and process the detection data
async function loadAndProcessData() {
    try {
        const response = await fetch('/get_all_detections');
        const data = await response.json();
        
        // Calculate statistics
        const stats = calculateStatistics(data);
        
        // Create charts and word cloud
        createDonutChartsAndWordCloud(stats);
        createValueChart(stats);
        
        // Update detailed statistics table
        updateStatsTable(stats);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Calculate various statistics from the data
function calculateStatistics(data) {
    const stats = {
        totalImages: data.length,
        totalDetections: 0,
        uniqueLabels: new Set(),
        uniqueCategories: new Set(),
        labelCounts: {},
        categoryCounts: {},
        averageDetectionsPerImage: 0,
        averageConfidence: 0,
        totalConfidence: 0,
        confidenceCount: 0
    };

    // Process each image
    data.forEach(image => {
        const detections = image.detections || [];
        stats.totalDetections += detections.length;

        // Process each detection
        detections.forEach(detection => {
            // Count labels
            const label = detection.label;
            stats.uniqueLabels.add(label);
            stats.labelCounts[label] = (stats.labelCounts[label] || 0) + 1;

            // Count categories
            const category = detection.category;
            stats.uniqueCategories.add(category);
            stats.categoryCounts[category] = (stats.categoryCounts[category] || 0) + 1;

            // Calculate confidence statistics
            if (detection.score) {
                stats.totalConfidence += detection.score;
                stats.confidenceCount++;
            }
        });
    });

    // Calculate averages
    stats.averageDetectionsPerImage = stats.totalDetections / stats.totalImages;
    stats.averageConfidence = stats.totalConfidence / stats.confidenceCount;

    // Convert Sets to Arrays and sort
    stats.uniqueLabels = Array.from(stats.uniqueLabels).sort();
    stats.uniqueCategories = Array.from(stats.uniqueCategories).sort();

    return stats;
}

// Create donut charts and word cloud
function createDonutChartsAndWordCloud(stats) {
    createCategoryDonutChart(stats);
    createLabelDonutChart(stats);
    createLabelWordCloud(stats);
}

// Donut chart for category distribution
function createCategoryDonutChart(stats) {
    const ctx = document.getElementById('categoryDonutChart').getContext('2d');
    const categories = Object.keys(stats.categoryCounts);
    const counts = Object.values(stats.categoryCounts);
    const colors = [
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)',
        'rgba(83, 102, 255, 0.7)',
        'rgba(40, 159, 64, 0.7)',
        'rgba(210, 199, 199, 0.7)'
    ];
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories,
            datasets: [{
                data: counts,
                backgroundColor: colors,
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right' },
                title: { display: true, text: 'Category Distribution' }
            }
        }
    });
}

// Donut chart for top 10 labels
function createLabelDonutChart(stats) {
    const ctx = document.getElementById('labelDonutChart').getContext('2d');
    const labels = Object.keys(stats.labelCounts);
    const counts = Object.values(stats.labelCounts);
    // Sort by count and take top 10
    const sortedData = labels.map((label, index) => ({
        label,
        count: counts[index]
    })).sort((a, b) => b.count - a.count).slice(0, 10);
    const donutColors = [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(199, 199, 199, 0.7)',
        'rgba(83, 102, 255, 0.7)',
        'rgba(40, 159, 64, 0.7)',
        'rgba(210, 199, 199, 0.7)'
    ];
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sortedData.map(item => item.label),
            datasets: [{
                data: sortedData.map(item => item.count),
                backgroundColor: donutColors,
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right' },
                title: { display: true, text: 'Top 10 Labels' }
            }
        }
    });
}

// Word cloud for all detected labels
function createLabelWordCloud(stats) {
    const wordList = Object.entries(stats.labelCounts).map(([label, count]) => [label, count]);
    const wordCloudDiv = document.getElementById('labelWordCloud');
    wordCloudDiv.innerHTML = '';
    if (wordList.length > 0) {
        WordCloud(wordCloudDiv, {
            list: wordList,
            gridSize: 10,
            weightFactor: 10,
            fontFamily: 'Arial',
            color: 'random-dark',
            backgroundColor: '#fff',
            rotateRatio: 0.2,
            minSize: 8,
            drawOutOfBound: false
        });
    }
}

// Create value distribution chart (confidence scores)
function createValueChart(stats) {
    const ctx = document.getElementById('valueChart').getContext('2d');
    // Create confidence score ranges
    const ranges = [
        '0.0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'
    ];
    // Count detections in each range
    const counts = new Array(ranges.length).fill(0);
    // Process all detections to count confidence scores
    Object.values(stats.labelCounts).forEach(count => {
        const confidence = count / stats.totalDetections;
        const rangeIndex = Math.min(Math.floor(confidence * 5), 4);
        counts[rangeIndex]++;
    });
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ranges,
            datasets: [{
                label: 'Number of Detections',
                data: counts,
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'Confidence Score Distribution' }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Update the detailed statistics table
function updateStatsTable(stats) {
    const tableBody = document.getElementById('statsTable');
    tableBody.innerHTML = '';
    const tableData = [
        ['Total Images', stats.totalImages],
        ['Total Detections', stats.totalDetections],
        ['Unique Labels', stats.uniqueLabels.length],
        ['Unique Categories', stats.uniqueCategories.length],
        ['Average Detections per Image', stats.averageDetectionsPerImage.toFixed(2)],
        ['Average Confidence Score', stats.averageConfidence.toFixed(2)]
    ];
    tableData.forEach(([metric, value]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${metric}</td>
            <td>${value}</td>
        `;
        tableBody.appendChild(row);
    });
}

// Load data when the page loads
document.addEventListener('DOMContentLoaded', loadAndProcessData); 