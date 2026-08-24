// Minimal test harness for CLT environments (no XCTest available).
// Run with: swift run cast-tests   — exits non-zero on any failure.
import Foundation
@testable import CastMetalCore

nonisolated(unsafe) var failures = 0
nonisolated(unsafe) var checks = 0

func expect<T: Equatable>(_ actual: T, _ expected: T, _ label: String) {
    checks += 1
    if actual != expected {
        failures += 1
        print("FAIL [\(label)]: expected \(expected), got \(actual)")
    }
}

func expectTrue(_ cond: Bool, _ label: String) {
    checks += 1
    if !cond {
        failures += 1
        print("FAIL [\(label)]")
    }
}

// ---- Smoke ----
expect(ShaderParams(), ShaderParams(), "ShaderParams equatable")

// ---- ShaderParams defaults (mirroring videoShader.ts uniforms) ----
var p = ShaderParams()
expect(p.contrast, Float(1.5), "default contrast == 1.5")
expect(p.ditherType, DitherType.bayer4x4, "default ditherType == bayer4x4")
expect(p.rezCellWidth, Float(8.0), "default rezCellWidth == 8")
expect(p.gradientBlendMode, GradientBlendMode.multiply, "default gradientBlendMode == multiply")
expect(p.alphaThreshold, Float(0.7), "default alphaThreshold == 0.7")
expect(p.distortionFrequency, Float(20.0), "default distortionFrequency == 20")
expect(p.distortionAmplitude, Float(0.02), "default distortionAmplitude == 0.02")
expectTrue(p.ditherEnabled, "ditherEnabled default true")
expectTrue(p.shaderEnabled, "shaderEnabled default true")

// ---- JSON round-trip via golden fixture ----
let fixtureURL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()            // Tests/cast-tests
    .deletingLastPathComponent()            // Tests
    .deletingLastPathComponent()            // package root
    .appendingPathComponent("Fixtures/params-v1.json")
do {
    let data = try Data(contentsOf: fixtureURL)
    let decoded = try JSONDecoder().decode(ShaderParams.self, from: data)
    expect(decoded, ShaderParams(), "golden fixture decodes to exact defaults")
    let reencoded = try JSONEncoder().encode(decoded)
    let redecoded = try JSONDecoder().decode(ShaderParams.self, from: reencoded)
    expect(redecoded, decoded, "JSON round-trip preserves all fields")
} catch {
    checks += 1
    failures += 1
    print("FAIL [fixture load]: \(error)")
}

// ---- Merge semantics ----
p = ShaderParams()
try? p.merge(patchData: Data(#"{"contrast": 2.5, "bogusKey": 9}"#.utf8))
expect(p.contrast, Float(2.5), "merge applies known key")
expect(p.ditherType, DitherType.bayer4x4, "merge leaves other keys intact")
checks += 1
if p.brightness != 1.0 { failures += 1; print("FAIL [merge ignores unknown keys]") }

try? p.merge(patchData: Data(#"{"ditherType": "blueNoise", "ditherColor": {"r":0,"g":1,"b":0}}"#.utf8))
expect(p.ditherType, DitherType.blueNoise, "enum merge by name")
expect(p.ditherColor.r, Float(0), "vec merge r")
expect(p.ditherColor.g, Float(1), "vec merge g")

// invalid patch throws
do {
    try p.merge(patchData: Data("not json".utf8))
    checks += 1; failures += 1; print("FAIL [invalid patch should throw]")
} catch { checks += 1 } // expected

// enum out-of-range rejected
do {
    try p.merge(patchData: Data(#"{"ditherType": 99}"#.utf8))
    checks += 1; failures += 1; print("FAIL [out-of-range enum should throw]")
} catch { checks += 1 } // expected

// ---- MSLUniforms byte-layout sanity ----
let gpu = MSLUniforms.from(params: ShaderParams(), time: 0.5)
let encoded = gpu.encode()
let expectedBytes = 8+8+120+24+4+24+52+16+8+36+16+16+36+4
expect(encoded.count, expectedBytes, "uniform block size == \(expectedBytes)")

if failures == 0 {
    print("OK — \(checks) checks passed")
} else {
    print("\(failures)/\(checks) checks FAILED")
    exit(1)
}
