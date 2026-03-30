"""Dev server with no-cache headers to prevent browser module caching.
Also hosts SC-Config Toolkit under /sc/ path."""
import http.server
import json
import os
import sys

# Add parent dir so we can import sc_server
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sc_server

POLYLINE_DIR = os.path.dirname(os.path.abspath(__file__))

class CombinedHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=POLYLINE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path == "/sc" or self.path == "/sc/":
            # Serve SC-Config UI
            ui_path = sc_server.SCRIPT_DIR / "sc_ui.html"
            if ui_path.exists():
                body = ui_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", len(body))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_error(500, "sc_ui.html not found")
        elif self.path.startswith("/api/"):
            # Delegate to SC-Config handler
            sc_handler = _SCBridge(self)
            sc_handler.handle_request()
        else:
            # Serve static polyline-app files
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            sc_handler = _SCBridge(self)
            sc_handler.handle_request()
        else:
            self.send_error(404)


class _SCBridge:
    """Bridges SC-Config logic into the combined handler."""
    def __init__(self, handler):
        self.handler = handler

    def handle_request(self):
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(self.handler.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # Build params from query string (GET) or JSON body (POST)
        if self.handler.command == "POST":
            length = int(self.handler.headers.get("Content-Length", 0))
            params = json.loads(self.handler.rfile.read(length)) if length else {}
        else:
            params = {k: v[0] for k, v in qs.items()}

        result = self._route(path, params)
        if result is not None:
            body = json.dumps(result).encode("utf-8")
            self.handler.send_response(200)
            self.handler.send_header("Content-Type", "application/json")
            self.handler.send_header("Content-Length", len(body))
            self.handler.end_headers()
            self.handler.wfile.write(body)
        else:
            self.handler.send_error(404)

    def _route(self, path, p):
        if path == "/api/variants":
            return sc_server.list_variants()
        elif path == "/api/file":
            variant = p.get("variant", "")
            filename = p.get("file", "")
            if variant and filename and filename in sc_server.SC_FILES:
                return {"content": sc_server.read_file_content(variant, filename)}
            return {"error": "Invalid params"}
        elif path == "/api/log":
            return sc_server.get_deploy_log()
        elif path == "/api/dcs-status":
            ver, msg = sc_server.get_active_dcs_version()
            return {"version": ver, "message": msg, "dcs_target": sc_server.DCS_TARGET}
        elif path == "/api/config":
            return {
                "workspace": str(sc_server.WORKSPACE),
                "dcs_root": sc_server.DCS_ROOT,
                "dcs_target": sc_server.DCS_TARGET,
                "rel_path": sc_server.REL_PATH,
                "files": sc_server.SC_FILES,
                "version_prefix": sc_server.VERSION_PREFIX,
                "omm_author": sc_server.OMM_AUTHOR,
                "omm_category": sc_server.OMM_CATEGORY,
                "dcs_exists": os.path.isdir(sc_server.DCS_TARGET),
            }
        elif path == "/api/variant-path":
            name = p.get("name", "")
            if name:
                vpath = str(sc_server.WORKSPACE / name)
                return {"path": vpath, "exists": (sc_server.WORKSPACE / name).is_dir()}
            return {"error": "No name"}
        elif path == "/api/refresh-variant":
            name = p.get("name", "")
            if name:
                info = sc_server.read_variant_info(name)
                if info:
                    contents = {}
                    for f in sc_server.SC_FILES:
                        contents[f] = sc_server.read_file_content(name, f)
                    return {"ok": True, "info": info, "contents": contents}
                return {"ok": False, "message": "Variant not found"}
            return {"error": "No name"}
        elif path == "/api/create":
            name = p.get("name", "")
            source = p.get("source", "Original")
            ok, msg = sc_server.create_variant(name, source)
            return {"ok": ok, "message": msg}
        elif path == "/api/stamp":
            sc_server.stamp_files(p.get("name", ""), p.get("version", ""), p.get("notes", ""))
            return {"ok": True}
        elif path == "/api/status":
            sc_server.set_status(p.get("name", ""), p.get("status", ""))
            return {"ok": True}
        elif path == "/api/save-file":
            variant = p.get("variant", "")
            filename = p.get("file", "")
            content = p.get("content", "")
            if variant and filename in sc_server.SC_FILES:
                sc_server.write_file_content(variant, filename, content)
                return {"ok": True}
            return {"ok": False, "message": "Invalid params"}
        elif path == "/api/clone":
            ok, msg, dest = sc_server.clone_variant(p.get("source", ""))
            return {"ok": ok, "message": msg, "dest": dest}
        elif path == "/api/delete":
            ok, msg = sc_server.delete_variant(p.get("name", ""))
            return {"ok": ok, "message": msg}
        elif path == "/api/deploy":
            ok, msg = sc_server.deploy_to_dcs(p.get("name", ""))
            return {"ok": ok, "message": msg}
        elif path == "/api/log-deploy":
            sc_server.log_deploy(p.get("name", ""), p.get("version", ""))
            return {"ok": True}
        elif path == "/api/clear-log":
            sc_server.clear_deploy_log()
            return {"ok": True}
        elif path == "/api/package":
            path_out, msg = sc_server.build_omm_package(p.get("name", ""), p.get("description", ""))
            return {"ok": path_out is not None, "message": msg, "path": path_out}
        elif path == "/api/version":
            return {"version": "3.0-combined"}
        return None


if __name__ == '__main__':
    sc_server.ensure_workspace()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    server = http.server.HTTPServer(('', port), CombinedHandler)
    print(f'Serving on http://localhost:{port} (no-cache)')
    print(f'  Marshalling Editor: http://localhost:{port}/')
    print(f'  SC-Config Toolkit:  http://localhost:{port}/sc/')
    print(f'  Workspace: {sc_server.WORKSPACE}')
    server.serve_forever()
