#!/usr/bin/env python3
"""
Simple local static server for the `race_3js` prototype.
Starts a HTTP server on the chosen port (default 8005) and opens the default browser.
Usage:
  py -3 run_server.py --port 8005
  or
  python run_server.py
"""
import http.server
import socketserver
import argparse
import webbrowser
import os
import json
from pathlib import Path

class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/save_map':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data)
                
                # Save to file
                with open('map_data.json', 'w') as f:
                    json.dump(data, f, indent=4)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'message': 'Map saved to map_data.json'}).encode())
                print("Map saved successfully to map_data.json")
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(e)}).encode())
                print(f"Error saving map: {e}")
        else:
            self.send_error(404, "File not found")

def main():
    parser = argparse.ArgumentParser(description='Serve the race_3js folder locally')
    parser.add_argument('--host', default='localhost', help='Host to bind (default: localhost)')
    parser.add_argument('--port', type=int, default=8005, help='Port to serve on (default: 8005)')
    args = parser.parse_args()

    # Ensure we serve from the folder containing this script (race_3js)
    root = Path(__file__).parent.resolve()
    os.chdir(root)

    handler = CustomHandler

    with ReuseTCPServer((args.host, args.port), handler) as httpd:
        url = f'http://{args.host}:{args.port}/'
        print(f'Serving `{root}` at {url}')
        try:
            # Try to open the browser, but continue if it fails
            try:
                webbrowser.open(url)
            except Exception:
                pass

            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServer stopped by user')


if __name__ == '__main__':
    main()
