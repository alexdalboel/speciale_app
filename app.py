from flask import Flask, render_template, request, url_for, jsonify
import json
import os

app = Flask(__name__)

# Load detections once at startup
with open('data/detections_50.json', 'r') as f:
    detections_data = json.load(f)

# Create a working copy if it doesn't exist
WORKING_PATH = 'data/detections_50_working.json'
if not os.path.exists(WORKING_PATH):
    with open(WORKING_PATH, 'w') as wf:
        json.dump(detections_data, wf, indent=2)

# Load working detections
with open(WORKING_PATH, 'r') as wf:
    working_detections_data = json.load(wf)

@app.route('/')
def index():
    # Pagination
    page = int(request.args.get('page', 1))
    per_page = 1
    total_images = len(working_detections_data)
    total_pages = total_images

    # Get filter class from query parameter
    filter_class = request.args.get('class', 'all')

    # Filter images based on class if a specific class is selected
    if filter_class != 'all':
        filtered_data = []
        for image_data in working_detections_data:
            if any(det['label'] == filter_class for det in image_data.get('detections', [])):
                filtered_data.append(image_data)
        total_pages = len(filtered_data)
        if total_pages == 0:
            return render_template(
                'index.html',
                image_file=None,
                labels=[],
                unique_labels=sorted(list(set(d['label'] for img in working_detections_data for d in img.get('detections', [])))),
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
        current = working_detections_data[page - 1]

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
    for image_data in working_detections_data:
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
        
        # Find the actual index of the image in the full dataset
        actual_index = None
        for i, img_data in enumerate(working_detections_data):
            if img_data['image_file'] == image_file:
                actual_index = i
                break
        
        if actual_index is None:
            raise ValueError(f"Image {image_file} not found in dataset")
        
        # Update the detections for the current image in the working copy
        working_detections_data[actual_index]['detections'] = new_detections
        
        # Save the updated data back to the working JSON file
        with open(WORKING_PATH, 'w') as f:
            json.dump(working_detections_data, f, indent=2)
        
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error updating detections: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get_all_detections')
def get_all_detections():
    try:
        # Return the working detections for annotation tool
        return jsonify(working_detections_data)
    except Exception as e:
        print(f"Error getting all detections: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get_stats_data')
def get_stats_data():
    try:
        # Return both original and working detections for stats
        with open('data/detections_50.json', 'r') as f:
            original = json.load(f)
        with open(WORKING_PATH, 'r') as wf:
            working = json.load(wf)
        return jsonify({'original': original, 'working': working})
    except Exception as e:
        print(f"Error getting stats data: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/stats')
def stats():
    return render_template('stats.html')

@app.route('/visitor')
def visitor():
    return render_template('visitor.html')

@app.route('/api/labels')
def get_labels():
    # Get all unique labels across all images
    all_labels = set()
    for image_data in working_detections_data:
        for detection in image_data.get('detections', []):
            all_labels.add(detection['label'])
    return jsonify(sorted(list(all_labels)))

@app.route('/api/artworks')
def get_artworks():
    # Return all artworks with their detections
    artworks = []
    for image_data in working_detections_data:
        artwork = {
            'image_url': url_for('static', filename=f'artworks_50/{image_data["image_file"]}'),
            'detections': image_data.get('detections', [])
        }
        artworks.append(artwork)
    return jsonify(artworks)

@app.route('/reset_working_copy', methods=['POST'])
def reset_working_copy():
    try:
        with open('data/detections_50.json', 'r') as f:
            original = json.load(f)
        with open(WORKING_PATH, 'w') as wf:
            json.dump(original, wf, indent=2)
        global working_detections_data
        working_detections_data = original
        return jsonify({'success': True})
    except Exception as e:
        print(f"Error resetting working copy: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

