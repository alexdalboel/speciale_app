from flask import Flask, render_template, request, url_for, jsonify
import json
import os

app = Flask(__name__)

# Load detections once at startup
with open('data/detections_50.json', 'r') as f:
    detections_data = json.load(f)

@app.route('/')
def index():
    # Pagination
    page = int(request.args.get('page', 1))
    per_page = 1
    total_images = len(detections_data)
    total_pages = total_images

    # Get filter class from query parameter
    filter_class = request.args.get('class', 'all')

    # Filter images based on class if a specific class is selected
    if filter_class != 'all':
        filtered_data = []
        for image_data in detections_data:
            if any(det['label'] == filter_class for det in image_data.get('detections', [])):
                filtered_data.append(image_data)
        total_pages = len(filtered_data)
        if total_pages == 0:
            return render_template(
                'index.html',
                image_file=None,
                labels=[],
                unique_labels=sorted(list(set(d['label'] for img in detections_data for d in img.get('detections', [])))),
                page=1,
                total_pages=1,
                detections=[],
                filter_class=filter_class
            )
        # Adjust page number if it's out of bounds after filtering
        if page > total_pages:
            page = total_pages
        current = filtered_data[page - 1]
    else:
        current = detections_data[page - 1]

    # Clamp page
    if page < 1: page = 1
    if page > total_pages: page = total_pages

    # Get current image and detections
    image_file = current['image_file']
    detections = current.get('detections', [])

    # Get unique labels for buttons and filter
    labels = [d['label'] for d in detections]
    labels = list(dict.fromkeys(labels))  # Remove duplicates, preserve order

    # Get all unique labels across all images for the filter
    all_labels = set()
    for image_data in detections_data:
        for detection in image_data.get('detections', []):
            all_labels.add(detection['label'])
    unique_labels = sorted(list(all_labels))

    return render_template(
        'index.html',
        image_file=image_file,
        labels=labels,
        unique_labels=unique_labels,
        page=page,
        total_pages=total_pages,
        detections=detections,
        filter_class=filter_class
    )

@app.route('/update_detections', methods=['POST'])
def update_detections():
    try:
        data = request.json
        image_file = data['image_file']
        new_detections = data['detections']
        
        # Find the current page from the URL
        page = int(request.args.get('page', 1))
        
        # Update the detections for the current image
        detections_data[page - 1]['detections'] = new_detections
        
        # Save the updated data back to the JSON file
        with open('data/detections_50.json', 'w') as f:
            json.dump(detections_data, f, indent=2)
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating detections: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get_all_detections')
def get_all_detections():
    try:
        return jsonify(detections_data)
    except Exception as e:
        print(f"Error getting all detections: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/stats')
def stats():
    return render_template('stats.html')

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8000, debug=True)
