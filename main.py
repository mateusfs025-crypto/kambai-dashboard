from flask import Flask, request, jsonify
import requests

app = Flask(__name__, static_folder='static', static_url_path='')

WINDSOR_KEY = 'af49eacb41a92fa489a714e8dd18c47d8114'

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/windsor')
def windsor():
    connector  = request.args.get('connector')
    date_from  = request.args.get('date_from')
    date_to    = request.args.get('date_to')
    fields     = request.args.get('fields')

    url = f"https://connectors.windsor.ai/{connector}?api_key={WINDSOR_KEY}&date_from={date_from}&date_to={date_to}&fields={fields}&force_refresh=true"

    try:
        r = requests.get(url, timeout=30)
        data = r.json()
        rows = data if isinstance(data, list) else data.get('data', data.get('results', []))
        return jsonify(rows)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
