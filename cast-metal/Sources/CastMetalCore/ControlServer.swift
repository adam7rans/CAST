import Foundation
import Network

/// Minimal HTTP + WebSocket control server on localhost:4313.
/// - GET /status  → JSON {version, fps, camera, params}
/// - PUT /params  → body: partial JSON patch; returns full merged params
/// - WS   /ws     → accepts {type:"setParams", patch:{...}}; sends {type:"params", params:{...}} and {type:"stats", ...}
public final class ControlServer {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "cast-metal.control")
    private var connections: [ObjectIdentifier: ConnectionBox] = [:]
    private let lock = NSLock()

    public struct Stats {
        public var fps: Double = 0
        public var frameCount = 0
        public var cameraName = ""
    }

    private(set) public var stats = Stats()
    private var paramsData: Data

    public var onParamsChanged: ((ShaderParams) -> Void)?
    public var port: UInt16 { listener.port?.rawValue ?? 0 }

    public init(port: UInt16 = 4313, initialParams: ShaderParams) throws {
        paramsData = try JSONEncoder().encode(initialParams)
        // Pretty-print for GET /params readability
        if let obj = try? JSONSerialization.jsonObject(with: paramsData),
           let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) {
            paramsData = pretty
        }
        let p = NWEndpoint.Port(rawValue: port)!
        listener = try NWListener(using: .tcp, on: p)
    }

    public func start() {
        listener.newConnectionHandler = { [weak self] conn in self?.accept(conn) }
        listener.start(queue: queue)
    }

    public func stop() {
        listener.cancel()
        lock.lock()
        connections.values.forEach { $0.connection.cancel() }
        connections.removeAll()
        lock.unlock()
    }

    public func updateStats(fps: Double, frames: Int, camera: String) {
        lock.lock()
        stats = Stats(fps: fps, frameCount: frames, cameraName: camera)
        let s = stats
        lock.unlock()
        broadcast(["type": "stats", "fps": s.fps, "frames": s.frameCount, "camera": s.cameraName])
    }

    private func currentParams() -> ShaderParams {
        (try? JSONDecoder().decode(ShaderParams.self, from: paramsData)) ?? ShaderParams()
    }

    private func apply(patchData: Data) -> ShaderParams? {
        var p = currentParams()
        guard let _ = try? p.merge(patchData: patchData) else { return nil }
        guard let encoded = try? JSONEncoder().encode(p),
              let obj = try? JSONSerialization.jsonObject(with: encoded),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) else { return nil }
        lock.lock()
        paramsData = pretty
        lock.unlock()
        broadcast(["type": "params", "params": obj])
        DispatchQueue.main.async { [weak self] in self?.onParamsChanged?(p) }
        return p
    }

    private func broadcast(_ json: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: json) else { return }
        lock.lock()
        let conns = Array(connections.values)
        lock.unlock()
        for box in conns where box.isWebSocket {
            box.sendWebSocket(data)
        }
    }

    // MARK: - connection handling

    /// Public so the app target can route via the shared static hooks.
    public final class ConnectionBox {
        let connection: NWConnection
        var isWebSocket = false
        var wsBuffer = Data()
        var httpBuffer = Data()

        init(_ c: NWConnection) { connection = c }

        func sendHTTP(status: String, contentType: String, body: Data, extraHeaders: [String: String] = [:]) {
            var head = "HTTP/1.1 \(status)\r\nContent-Type: \(contentType)\r\n"
            head += "Access-Control-Allow-Origin: *\r\n"
            head += "Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS\r\n"
            head += "Access-Control-Allow-Headers: Content-Type\r\n"
            for (k, v) in extraHeaders { head += "\(k): \(v)\r\n" }
            head += "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
            var out = Data(head.utf8)
            out.append(body)
            connection.send(content: out, completion: .contentProcessed { [weak self] _ in
                self?.connection.cancel()
            })
        }

        /// Send one WebSocket text frame (server→client is unmasked).
        func sendWebSocket(_ payload: Data) {
            var frame = Data([0x81]) // FIN + text opcode
            if payload.count < 126 {
                frame.append(UInt8(payload.count))
            } else if payload.count <= 0xFFFF {
                frame.append(126)
                frame.append(UInt8((payload.count >> 8) & 0xFF))
                frame.append(UInt8(payload.count & 0xFF))
            } else {
                frame.append(127)
                for shift in stride(from: 56, through: 0, by: -8) {
                    frame.append(UInt8((payload.count >> shift) & 0xFF))
                }
            }
            frame.append(payload)
            connection.send(content: frame, completion: .contentProcessed { _ in })
        }

        func receiveLoop() {
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, err in
                guard let self else { return }
                if let data { self.ingest(data) }
                if err != nil || done {
                    ControlServer.sharedLock.lock()
                    ControlServer.sharedRefs[ObjectIdentifier(self)] = nil
                    ControlServer.sharedLock.unlock()
                    self.connection.cancel()
                    return
                }
                self.receiveLoop()
            }
        }

        func ingest(_ chunk: Data) {
            if isWebSocket {
                parseWebSocket(chunk)
            } else {
                httpBuffer.append(chunk)
                if let requestEnd = httpBuffer.range(of: Data("\r\n\r\n".utf8)) {
                    let headerText = String(data: httpBuffer[..<(requestEnd.lowerBound)], encoding: .utf8) ?? ""
                    if headerText.contains("Upgrade: websocket") || headerText.contains("upgrade: websocket") {
                        isWebSocket = true
                        completeHandshake(headers: headerText)
                        // any body bytes after the handshake belong to ws frames
                        let rest = httpBuffer.subdata(in: requestEnd.upperBound..<httpBuffer.endIndex)
                        if !rest.isEmpty { parseWebSocket(rest) }
                    } else if headerText.hasPrefix("GET") || headerText.hasPrefix("PUT") || headerText.hasPrefix("POST") || headerText.hasPrefix("OPTIONS") {
                        handleHTTP(headers: headerText)
                    }
                }
            }
        }

        func completeHandshake(headers: String) {
            guard let keyLine = headers.split(separator: "\r\n").first(where: { $0.lowercased().contains("sec-websocket-key") }),
                  let key = keyLine.split(separator: ":").last?.trimmingCharacters(in: .whitespaces) else {
                connection.cancel(); return
            }
            let magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            let digest = Crypto.sha1(Data(magic.utf8))
            let accept = digest.base64EncodedString()
            let resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n"
            connection.send(content: Data(resp.utf8), completion: .contentProcessed { _ in })
        }

        func parseWebSocket(_ data: Data) {
            wsBuffer.append(data)
            while wsBuffer.count >= 2 {
                let b0 = wsBuffer[wsBuffer.startIndex]
                let opcode = b0 & 0x0F
                let b1 = wsBuffer[wsBuffer.startIndex + 1]
                var offset = 2
                let masked = (b1 & 0x80) != 0
                var payloadLen = Int(b1 & 0x7F)
                if payloadLen == 126 {
                    guard wsBuffer.count >= 4 else { return }
                    payloadLen = Int(wsBuffer[u_offset(2)]) << 8 | Int(wsBuffer[u_offset(3)])
                    offset = 4
                } else if payloadLen == 127 {
                    guard wsBuffer.count >= 10 else { return }
                    payloadLen = 0
                    for i in 0..<8 { payloadLen = payloadLen << 8 | Int(wsBuffer[u_offset(2 + i)]) }
                    offset = 10
                }
                let maskLen = masked ? 4 : 0
                guard wsBuffer.count >= offset + maskLen + payloadLen else { return }
                var payload = wsBuffer.subdata(in: u_range(offset + maskLen, payloadLen))
                if masked {
                    let mask = wsBuffer.subdata(in: u_range(offset, 4))
                    for i in 0..<payload.count {
                        payload[i] ^= mask[i % 4]
                    }
                }
                wsBuffer.removeSubrange(u_range(0, offset + maskLen + payloadLen))
                switch opcode {
                case 0x8: connection.cancel(); return          // close
                case 0x9: sendWebSocketControl(0xA, payload); return // ping → pong
                case 0x1: ControlServer.sharedHandler?(payload, self)
                default: break
                }
            }
        }

        func sendWebSocketControl(_ op: UInt8, _ payload: Data) {
            var frame = Data([0x80 | op, UInt8(payload.count)])
            frame.append(payload)
            connection.send(content: frame, completion: .contentProcessed { _ in })
        }

        // index helpers over Data with startIndex possibly nonzero
        func u_offset(_ i: Int) -> Data.Index { wsBuffer.startIndex + i }
        func u_range(_ loc: Int, _ len: Int) -> Range<Data.Index> { u_offset(loc)..<u_offset(loc + len) }

        func handleHTTP(headers: String) {
            let lines = headers.split(separator: "\r\n").map(String.init)
            guard let reqLine = lines.first else { return }
            let parts = reqLine.split(separator: " ")
            guard parts.count >= 2 else { return }
            let method = String(parts[0])
            let path = String(parts[1]).split(separator: "?").first.map(String.init) ?? "/"
            ControlServer.sharedRouter?(method, path, self)
        }
    }

    static let sharedLock = NSLock()
    static var sharedRefs: [ObjectIdentifier: ConnectionBox] = [:]
    public static var sharedHandler: ((Data, ConnectionBox) -> Void)?
    public static var sharedRouter: ((String, String, ConnectionBox) -> Void)?
    /// App-side hooks: list preset names; load a preset by name into fresh params.
    public var presetLoader: (() -> [String])?
    public var presetApply: ((String) -> ShaderParams?)?

    /// Replace the full params state (e.g. after loading a preset) and notify WS clients.
    public func install(_ p: ShaderParams) {
        guard let encoded = try? JSONEncoder().encode(p),
              let obj = try? JSONSerialization.jsonObject(with: encoded),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]) else { return }
        lock.lock()
        paramsData = pretty
        lock.unlock()
        broadcast(["type": "params", "params": obj])
        DispatchQueue.main.async { [weak self] in self?.onParamsChanged?(p) }
    }

    private func accept(_ conn: NWConnection) {
        let box = ConnectionBox(conn)
        lock.lock()
        connections[ObjectIdentifier(box)] = box
        lock.unlock()
        Self.sharedLock.lock()
        Self.sharedRefs[ObjectIdentifier(box)] = box
        Self.sharedLock.unlock()
        conn.stateUpdateHandler = { [weak self] state in
            if case .failed = state {
                self?.drop(box)
            }
        }
        conn.start(queue: queue)
        box.receiveLoop()
    }

    private func drop(_ box: ConnectionBox) {
        lock.lock()
        connections.removeValue(forKey: ObjectIdentifier(box))
        lock.unlock()
        Self.sharedLock.lock()
        Self.sharedRefs[ObjectIdentifier(box)] = nil
        Self.sharedLock.unlock()
    }

    // MARK: - routing

    public func route(method: String, path: String, to box: ConnectionBox) {
        switch (method, path) {
        case ("GET", "/status"):
            let p = currentParams()
            let body = """
            {"version":"0.1","fps":\(stats.fps),"camera":"\(stats.cameraName)","port":\(port)}
            """
            box.sendHTTP(status: "200 OK", contentType: "application/json", body: Data(body.utf8))
        case ("GET", "/params"):
            box.sendHTTP(status: "200 OK", contentType: "application/json", body: paramsData)
        case ("PUT", "/params"), ("POST", "/params"):
            // body arrives after headers; buffered in httpBuffer — read remainder
            if let sep = box.httpBuffer.range(of: Data("\r\n\r\n".utf8)) {
                let body = box.httpBuffer.subdata(in: sep.upperBound..<box.httpBuffer.endIndex)
                if let merged = apply(patchData: body), let out = try? JSONEncoder().encode(merged) {
                    box.sendHTTP(status: "200 OK", contentType: "application/json", body: out)
                } else {
                    box.sendHTTP(status: "400 Bad Request", contentType: "application/json",
                                 body: Data(#"{"error":"invalid patch"}"#.utf8))
                }
            } else {
                box.sendHTTP(status: "400 Bad Request", contentType: "application/json",
                             body: Data(#"{"error":"no body"}"#.utf8))
            }
        case ("OPTIONS", _):
            box.sendHTTP(status: "204 No Content", contentType: "text/plain", body: Data())
        case ("GET", "/presets"):
            let names = presetLoader?() ?? []
            let body = try? JSONSerialization.data(withJSONObject: ["presets": names])
            box.sendHTTP(status: "200 OK", contentType: "application/json", body: body ?? Data("[]".utf8))
        default:
            // POST /presets/load {name} — load a CAST preset by filename
            if method == "POST", path == "/presets/load",
               let sep = box.httpBuffer.range(of: Data("\r\n\r\n".utf8)) {
                let body = box.httpBuffer.subdata(in: sep.upperBound..<box.httpBuffer.endIndex)
                if let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                   let name = obj["name"] as? String,
                   let newParams = presetApply?(name) {
                    install(newParams)
                    let out = try? JSONSerialization.data(withJSONObject: ["type": "params", "loaded": name, "ok": true])
                    box.sendHTTP(status: "200 OK", contentType: "application/json", body: out ?? Data())
                } else {
                    box.sendHTTP(status: "400 Bad Request", contentType: "application/json",
                                 body: Data(#"{"error":"unknown preset"}"#.utf8))
                }
                return
            }
            box.sendHTTP(status: "404 Not Found", contentType: "application/json",
                         body: Data(#"{"error":"not found"}"#.utf8))
        }
    }

    public func handleWebSocketMessage(_ data: Data, from box: ConnectionBox) {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        switch obj["type"] as? String {
        case "setParams":
            if let patchObj = obj["patch"],
               let patchData = try? JSONSerialization.data(withJSONObject: patchObj),
               apply(patchData: patchData) != nil {
                // broadcast already sent full params
            } else {
                box.sendWebSocket(Data(#"{"type":"error","message":"invalid patch"}"#.utf8))
            }
        case "getParams":
            if let pObj = try? JSONSerialization.jsonObject(with: paramsData) {
                box.sendWebSocket(try! JSONSerialization.data(withJSONObject: ["type": "params", "params": pObj]))
            }
        default:
            break
        }
    }
}

// MARK: - SHA-1 (for WebSocket handshake; no crypto deps needed)

enum Crypto {
    static func sha1(_ data: Data) -> Data {
        var msg = data
        let bitLength = UInt64(data.count * 8)
        msg.append(0x80)
        while msg.count % 64 != 56 { msg.append(0) }
        for shift in stride(from: 56, through: 0, by: -8) {
            msg.append(UInt8((bitLength >> UInt64(shift)) & 0xFF))
        }
        var h: [UInt32] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]

        func rotl(_ x: UInt32, _ n: UInt32) -> UInt32 { (x << n) | (x >> (32 - n)) }

        for chunkStart in stride(from: 0, to: msg.count, by: 64) {
            var w = [UInt32](repeating: 0, count: 80)
            for i in 0..<16 {
                let idx = chunkStart + i * 4
                w[i] = UInt32(msg[idx]) << 24 | UInt32(msg[idx+1]) << 16 | UInt32(msg[idx+2]) << 8 | UInt32(msg[idx+3])
            }
            for i in 16..<80 {
                w[i] = rotl(w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16], 1)
            }
            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4]
            for i in 0..<80 {
                let (f, k): (UInt32, UInt32)
                switch i {
                case 0..<20: f = (b & c) | (~b & d); k = 0x5A827999
                case 20..<40: f = b ^ c ^ d; k = 0x6ED9EBA1
                case 40..<60: f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC
                default: f = b ^ c ^ d; k = 0xCA62C1D6
                }
                let tmp = rotl(a, 5) &+ f &+ e &+ k &+ w[i]
                e = d; d = c; c = rotl(b, 30); b = a; a = tmp
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d; h[4] = h[4] &+ e
        }
        var out = Data()
        for v in h {
            out.append(UInt8((v >> 24) & 0xFF)); out.append(UInt8((v >> 16) & 0xFF))
            out.append(UInt8((v >> 8) & 0xFF)); out.append(UInt8(v & 0xFF))
        }
        return out
    }
}
