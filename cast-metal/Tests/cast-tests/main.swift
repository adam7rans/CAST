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

if failures == 0 {
    print("OK — \(checks) checks passed")
} else {
    print("\(failures)/\(checks) checks FAILED")
    exit(1)
}
