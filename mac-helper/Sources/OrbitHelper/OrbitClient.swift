import Foundation

struct IngestResponse: Decodable {
    let meetingId: String
    let status: String
}

struct StatusResponse: Decodable {
    let id: String
    let title: String?
    let clientId: String?
    let otherWork: Bool?
    let processing: String?
    let errorMessage: String?
}

private struct VocabularyResponse: Decodable {
    let prompt: String
}

private struct ErrorBody: Decodable {
    let error: String?
}

enum OrbitError: LocalizedError {
    case noToken
    case http(Int, String)

    var errorDescription: String? {
        switch self {
        case .noToken: "No Orbit token in the Keychain. See the setup guide, step 5."
        case let .http(code, message): "Orbit answered \(code): \(message)"
        }
    }

    /// Worth trying again later: the network, a rate limit, a server error, or a token that is wrong or not set yet
    /// (fixing the token should send what waited). A 400 or 413 means Orbit refused the body itself, so it is not.
    var retryable: Bool {
        switch self {
        case .noToken: true
        case let .http(code, _): code == 401 || code == 403 || code == 408 || code == 429 || code >= 500
        }
    }
}

/// The four Orbit routes the helper uses. Contract: docs/ingest.md in the Orbit repo.
struct OrbitClient {
    let base: URL
    let token: String

    static func fromKeychain() throws -> OrbitClient {
        guard let token = Keychain.token() else { throw OrbitError.noToken }
        return OrbitClient(base: Settings.orbitURL, token: token)
    }

    func meetingURL(_ id: String) -> URL { base.appendingPathComponent("meetings").appendingPathComponent(id) }

    func vocabularyPrompt() async throws -> String {
        let data = try await send(path: "api/v1/vocabulary")
        return try JSONDecoder().decode(VocabularyResponse.self, from: data).prompt
    }

    /// 202 for a new meeting, 200 when Orbit already has it (same start minute and opening words). Both count as sent.
    func ingest(_ body: Data) async throws -> IngestResponse {
        let data = try await send(path: "api/meetings/ingest", method: "POST", body: body)
        return try JSONDecoder().decode(IngestResponse.self, from: data)
    }

    func status(_ id: String) async throws -> StatusResponse {
        let data = try await send(path: "api/meetings/\(id)/status")
        return try JSONDecoder().decode(StatusResponse.self, from: data)
    }

    /// Runs Orbit's pipeline again for a meeting that is stuck in received or processing.
    func process(_ id: String) async throws {
        _ = try await send(path: "api/meetings/\(id)/process", method: "POST", body: Data("{}".utf8))
    }

    private func send(path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        var req = URLRequest(url: base.appendingPathComponent(path), timeoutInterval: 90)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200 ..< 300).contains(code) else {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? HTTPURLResponse.localizedString(forStatusCode: code)
            throw OrbitError.http(code, message)
        }
        return data
    }
}
