import Foundation
import Security

/// The ingest token lives in the login keychain, never in a file or in defaults.
/// Put it there with: security add-generic-password -U -s orbit-helper -a ingest-token -w
/// The first read shows a macOS prompt; choose Always Allow.
enum Keychain {
    static let service = "orbit-helper"
    static let account = "ingest-token"

    static func token() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        let token = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (token?.isEmpty ?? true) ? nil : token
    }
}
