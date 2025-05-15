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

    # Get filter values from query parameters
    filter_class = request.args.get('class', 'all')
    filter_label = request.args.get('label', 'all')
    filter_year = request.args.get('year', 'all')
    filter_artist = request.args.get('artist', 'all')
    filter_database = request.args.get('database', 'all')
    filter_location = request.args.get('location', 'all')

    # Filter images based on selected filters
    if any(f != 'all' for f in [filter_class, filter_label, filter_year, filter_artist, filter_database, filter_location]):
        filtered_data = []
        for image_data in working_detections_data:
            # Check metadata filters
            if filter_year != 'all' and image_data.get('Year') != filter_year:
                continue
            if filter_artist != 'all' and image_data.get('Artist') != filter_artist:
                continue
            if filter_database != 'all' and image_data.get('Database') != filter_database:
                continue
            if filter_location != 'all' and image_data.get('Location') != filter_location:
                continue

            # Check detection filters
            has_matching_detection = False
            for detection in image_data.get('detections', []):
                label_match = filter_label == 'all' or detection['label'] == filter_label
                category_match = filter_class == 'all' or detection.get('category') == filter_class
                if label_match and category_match:
                    has_matching_detection = True
                    break

            if has_matching_detection:
                filtered_data.append(image_data)

        total_pages = len(filtered_data)
        if total_pages == 0:
            return render_template(
                'index.html',
                image_file=None,
                labels=[],
                unique_labels=sorted(list(set(d['label'] for img in working_detections_data for d in img.get('detections', [])))),
                unique_years=sorted(list(set(img.get('Year', '') for img in working_detections_data if img.get('Year', '') != 'Unknown'))),
                unique_artists=sorted(list(set(img.get('Artist', '') for img in working_detections_data if img.get('Artist', '') != 'Unknown'))),
                unique_databases=sorted(list(set(img.get('Database', '') for img in working_detections_data if img.get('Database', '') != 'Unknown'))),
                unique_locations=sorted(list(set(img.get('Location', '') for img in working_detections_data if img.get('Location', '') != 'Unknown'))),
                page=1,
                total_pages=1,
                detections=[],
                filter_class=filter_class,
                filter_label=filter_label,
                filter_year=filter_year,
                filter_artist=filter_artist,
                filter_database=filter_database,
                filter_location=filter_location
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

    # Get all unique values for filters
    all_labels = set()
    all_categories = set()
    all_years = set()
    all_artists = set()
    all_databases = set()
    all_locations = set()

    for image_data in working_detections_data:
        # Add labels and categories from detections
        for detection in image_data.get('detections', []):
            all_labels.add(detection['label'])
            if 'category' in detection:
                all_categories.add(detection['category'])
        
        # Add metadata values
        if image_data.get('Year') and image_data.get('Year') != 'Unknown':
            all_years.add(image_data['Year'])
        if image_data.get('Artist') and image_data.get('Artist') != 'Unknown':
            all_artists.add(image_data['Artist'])
        if image_data.get('Database') and image_data.get('Database') != 'Unknown':
            all_databases.add(image_data['Database'])
        if image_data.get('Location') and image_data.get('Location') != 'Unknown':
            all_locations.add(image_data['Location'])

    return render_template(
        'index.html',
        image_file=image_file,
        labels=labels,
        unique_labels=sorted(list(all_labels)),
        unique_categories=sorted(list(all_categories)),
        unique_years=sorted(list(all_years)),
        unique_artists=sorted(list(all_artists)),
        unique_databases=sorted(list(all_databases)),
        unique_locations=sorted(list(all_locations)),
        page=page,
        total_pages=total_pages,
        detections=detections,
        filter_class=filter_class,
        filter_label=filter_label,
        filter_year=filter_year,
        filter_artist=filter_artist,
        filter_database=filter_database,
        filter_location=filter_location
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
    # Return all artworks with their detections and metadata
    artworks = []
    for image_data in working_detections_data:
        artwork = {
            'image_url': url_for('static', filename=f'artworks_50/{image_data["image_file"]}'),
            'detections': image_data.get('detections', []),
            'Year': image_data.get('Year', 'Unknown'),
            'Artist': image_data.get('Artist', 'Unknown'),
            'Database': image_data.get('Database', 'Unknown'),
            'Location': image_data.get('Location', 'Unknown'),
            'Caption': image_data.get('Caption', 'No caption available'),
            'Photo_Credit': image_data.get('Photo Credit', 'Unknown')
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
    app.run(host='0.0.0.0', port=5000, debug=True)

