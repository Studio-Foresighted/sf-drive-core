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
from pathlib import Path

class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


def main():
    parser = argparse.ArgumentParser(description='Serve the race_3js folder locally')
    parser.add_argument('--host', default='localhost', help='Host to bind (default: localhost)')
    parser.add_argument('--port', type=int, default=8005, help='Port to serve on (default: 8005)')
    args = parser.parse_args()

    # Ensure we serve from the folder containing this script (race_3js)
    root = Path(__file__).parent.resolve()
    os.chdir(root)

    handler = http.server.SimpleHTTPRequestHandler

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
